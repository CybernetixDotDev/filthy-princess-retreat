-- Cell 4: USD commission entitlement, evaluated once on new conversion.
create type public.affiliate_commission_rule_type as enum ('percentage', 'fixed');
create type public.affiliate_commission_status as enum ('pending');

create table public.affiliate_commission_settings (
  id boolean primary key default true check (id),
  default_commission_type public.affiliate_commission_rule_type not null default 'percentage',
  default_commission_value numeric(12,2) not null default 10,
  commission_hold_days integer not null default 14 check (commission_hold_days >= 0),
  updated_at timestamptz not null default now(),
  constraint affiliate_commission_settings_value check (
    default_commission_value >= 0 and default_commission_value < 'Infinity'::numeric
    and (default_commission_type <> 'percentage' or default_commission_value <= 100)
  )
);
insert into public.affiliate_commission_settings(id) values (true);
create trigger affiliate_commission_settings_updated_at
  before update on public.affiliate_commission_settings
  for each row execute function affiliate_private.set_updated_at();

alter table public.store_products
  add column commission_type public.affiliate_commission_rule_type,
  add column commission_value numeric(12,2),
  add constraint store_products_commission_override check (
    (commission_type is null and commission_value is null)
    or (commission_type is not null and commission_value is not null
      and commission_value >= 0 and commission_value < 'Infinity'::numeric
      and (commission_type <> 'percentage' or commission_value <= 100))
  );

create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  conversion_id uuid not null unique references public.inner_sanctum_referral_conversions(id) on delete restrict,
  affiliate_account_id uuid not null references public.affiliate_accounts(id) on delete restrict,
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  gross_amount numeric(12,2) not null,
  commissionable_amount numeric(12,2) not null,
  rule_type public.affiliate_commission_rule_type not null,
  rule_value numeric(12,2) not null,
  commission_amount numeric(12,2) not null,
  status public.affiliate_commission_status not null default 'pending',
  created_at timestamptz not null default now(),
  available_at timestamptz not null,
  constraint affiliate_commissions_amounts check (
    gross_amount > 0 and gross_amount < 'Infinity'::numeric
    and commissionable_amount = gross_amount
    and commission_amount > 0 and commission_amount <= commissionable_amount
    and rule_value >= 0 and rule_value < 'Infinity'::numeric
    and (rule_type <> 'percentage' or rule_value <= 100)
    and commission_amount = case when rule_type = 'percentage'
      then round(commissionable_amount * rule_value / 100, 2)
      else least(rule_value, commissionable_amount) end
  ),
  constraint affiliate_commissions_hold check (available_at >= created_at)
);
create index affiliate_commissions_account_idx on public.affiliate_commissions(affiliate_account_id);
create index affiliate_commissions_referrer_idx on public.affiliate_commissions(referrer_user_id);

create function affiliate_private.protect_commission_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'affiliate_commission_history_is_immutable';
end;
$$;
revoke all on function affiliate_private.protect_commission_history() from public, anon, authenticated;
create trigger affiliate_commissions_immutable before update or delete on public.affiliate_commissions
  for each row execute function affiliate_private.protect_commission_history();

alter table public.affiliate_commission_settings enable row level security;
alter table public.affiliate_commissions enable row level security;
revoke all on public.affiliate_commission_settings, public.affiliate_commissions from public, anon, authenticated;
-- No client API for creating or mutating entitlements or programme settings.

create function affiliate_private.create_conversion_commission(p_conversion_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  conversion public.inner_sanctum_referral_conversions;
  account public.affiliate_accounts;
  store_order public.store_orders;
  settings public.affiliate_commission_settings;
  product public.store_products;
  resolved_type public.affiliate_commission_rule_type;
  resolved_value numeric;
  amount numeric;
  created timestamptz := now();
begin
  select * into strict conversion from public.inner_sanctum_referral_conversions where id = p_conversion_id;
  -- Serialize eligibility against changes to the recipient's commercial state.
  select * into account from public.affiliate_accounts where user_id = conversion.referrer_user_id for share;
  if not affiliate_private.is_commercially_ready(conversion.referrer_user_id) then return; end if;
  select * into strict store_order from public.store_orders where id = conversion.order_id;
  if store_order.currency <> 'USD' or store_order.total_amount <= 0 then return; end if;
  select * into strict settings from public.affiliate_commission_settings where id = true;
  select p.* into strict product from public.store_order_items i
    join public.store_products p on p.id = i.product_id where i.order_id = store_order.id;
  resolved_type := coalesce(product.commission_type, settings.default_commission_type);
  resolved_value := coalesce(product.commission_value, settings.default_commission_value);
  amount := case when resolved_type = 'percentage'
    then round(store_order.total_amount * resolved_value / 100, 2)
    else least(resolved_value, store_order.total_amount) end;
  if amount <= 0 then return; end if;
  insert into public.affiliate_commissions(conversion_id, affiliate_account_id, referrer_user_id,
    gross_amount, commissionable_amount, rule_type, rule_value, commission_amount, created_at, available_at)
  values(conversion.id, account.id, conversion.referrer_user_id,
    store_order.total_amount, store_order.total_amount, resolved_type, resolved_value, amount,
    created, created + make_interval(days => settings.commission_hold_days));
end;
$$;
revoke all on function affiliate_private.create_conversion_commission(uuid) from public, anon, authenticated;

-- Preserve the existing conversion body and its early return for historical conversions.
create or replace function inner_sanctum_referral_private.record_successful_referral_conversion(p_order_id uuid,p_referred_user_id uuid,p_conversion_source public.inner_sanctum_referral_conversion_source,p_created_by uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare attribution public.store_order_referrals; referral public.inner_sanctum_referrals; order_row public.store_orders; points integer; v_conversion_id uuid;
begin
 select * into order_row from public.store_orders where id=p_order_id for update;
 if order_row.id is null then raise exception 'order_not_found' using errcode='P0002'; end if;
 if order_row.payment_status <> 'verified' or order_row.user_id is null or order_row.user_id is distinct from p_referred_user_id then raise exception 'verified_owned_payment_required' using errcode='22023'; end if;
 if not exists(select 1 from public.store_order_items i where i.order_id=order_row.id and i.fulfillment_type='inner_sanctum_membership' and i.fulfillment_reference='lifetime') then raise exception 'ineligible_order' using errcode='22023'; end if;
 select * into attribution from public.store_order_referrals where order_id=order_row.id for update;
 if attribution.id is null then raise exception 'referral_attribution_required' using errcode='P0002'; end if;
 select * into referral from public.inner_sanctum_referrals where id=attribution.referral_id;
 if referral.id is null then raise exception 'referral_not_found' using errcode='P0002'; end if;
 if referral.user_id=p_referred_user_id then raise exception 'self_referral' using errcode='22023'; end if;
 if not exists(select 1 from auth.users where id=p_referred_user_id) then raise exception 'referred_user_not_found' using errcode='P0002'; end if;
 select id into v_conversion_id from public.inner_sanctum_referral_conversions where order_id=order_row.id;
 if v_conversion_id is not null then return v_conversion_id; end if;
 select referral_points into points from public.inner_sanctum_filth_settings where id=true;
 insert into public.inner_sanctum_referral_conversions(referral_id,referrer_user_id,referred_user_id,order_id,order_reference,points_awarded,conversion_source)
 values(referral.id,referral.user_id,p_referred_user_id,order_row.id,order_row.order_reference,points,p_conversion_source) returning id into v_conversion_id;
 insert into public.inner_sanctum_filth_events(user_id,event_type,points,source_reference,created_by) values(referral.user_id,'referral',points,'referral-conversion:'||v_conversion_id,p_created_by);
 update public.store_order_referrals set converted_at=now(),conversion_id=v_conversion_id where id=attribution.id;
 perform inner_sanctum_referral_private.evaluate_filth_milestones(referral.user_id);
 perform affiliate_private.create_conversion_commission(v_conversion_id);
 return v_conversion_id;
end;
$$;
revoke all on function inner_sanctum_referral_private.record_successful_referral_conversion(uuid,uuid,public.inner_sanctum_referral_conversion_source,uuid) from public,anon,authenticated;
