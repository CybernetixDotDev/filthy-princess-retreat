-- Cell 3: authenticated checkout and one authoritative payment boundary.
create type public.store_payment_status as enum ('pending', 'submitted', 'verified', 'rejected');
alter type public.inner_sanctum_referral_conversion_source add value if not exists 'verified_payment';
alter table public.inner_sanctum_referral_conversions
  drop constraint inner_sanctum_referral_conversions_referred_user_id_key;
create index inner_sanctum_referral_conversions_referred_user_idx
  on public.inner_sanctum_referral_conversions(referred_user_id);

alter table public.store_orders
  add column payment_status public.store_payment_status not null default 'pending',
  add column payment_method text,
  add column payment_submitted_at timestamptz,
  add column payment_reference text,
  add column payment_verified_at timestamptz,
  add column payment_verified_by uuid references auth.users(id) on delete restrict,
  add column payment_reviewed_at timestamptz,
  add column payment_reviewed_by uuid references auth.users(id) on delete restrict,
  add column payment_verification_note text,
  add column fulfilled_at timestamptz,
  add constraint store_payment_text_lengths check (
    (payment_method is null or length(trim(payment_method)) between 1 and 100)
    and (payment_reference is null or length(payment_reference) between 1 and 300)
    and (payment_verification_note is null or length(payment_verification_note) between 1 and 2000)
  ),
  add constraint store_payment_state_audit check (
    (payment_status = 'pending' and payment_submitted_at is null and payment_verified_at is null and payment_reviewed_at is null)
    or (payment_status = 'submitted' and payment_submitted_at is not null and payment_method is not null and payment_verified_at is null and payment_reviewed_at is null)
    or (payment_status = 'verified' and payment_submitted_at is not null and payment_method is not null and payment_verified_at is not null and payment_reviewed_at is not null and status = 'paid')
    or (payment_status = 'rejected' and payment_submitted_at is not null and payment_method is not null and payment_verified_at is null and payment_reviewed_at is not null and payment_reviewed_by is not null)
  );
create index store_orders_payment_verified_by_idx on public.store_orders(payment_verified_by);
create index store_orders_payment_reviewed_by_idx on public.store_orders(payment_reviewed_by);

create function public.bind_my_store_order(p_order_reference text)
returns public.store_orders language plpgsql security definer set search_path = '' as $$
declare o public.store_orders; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into o from public.store_orders where order_reference = upper(trim(p_order_reference)) for update;
  if o.id is null then raise exception 'order_unavailable' using errcode = 'P0002'; end if;
  if o.user_id = actor then return o; end if;
  if o.user_id is not null then raise exception 'order_owned_by_another_user' using errcode = '42501'; end if;
  if o.status <> 'pending' or o.payment_status <> 'pending' then
    raise exception 'order_ineligible' using errcode = '22023';
  end if;
  update public.store_orders set user_id = actor where id = o.id returning * into o;
  return o;
end;
$$;

create function public.get_my_store_checkout(p_order_reference text)
returns public.store_orders language plpgsql stable security definer set search_path = '' as $$
declare o public.store_orders;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into o from public.store_orders where order_reference = upper(trim(p_order_reference)) and user_id = auth.uid();
  if o.id is null then raise exception 'order_unavailable' using errcode = 'P0002'; end if;
  return o;
end;
$$;

create function public.submit_my_store_payment(p_order_reference text, p_payment_method text, p_payment_reference text default null)
returns public.store_orders language plpgsql security definer set search_path = '' as $$
declare o public.store_orders;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into o from public.store_orders where order_reference = upper(trim(p_order_reference)) and user_id = auth.uid() for update;
  if o.id is null then raise exception 'order_unavailable' using errcode = '42501'; end if;
  if o.payment_status = 'submitted' then return o; end if;
  if o.status <> 'pending' or o.payment_status <> 'pending' then raise exception 'payment_not_pending' using errcode = '22023'; end if;
  if p_payment_method is null or p_payment_method not in ('manual_transfer', 'manual_crypto', 'manual_other') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;
  update public.store_orders set payment_status = 'submitted', payment_method = p_payment_method,
    payment_reference = nullif(trim(p_payment_reference), ''), payment_submitted_at = now()
  where id = o.id returning * into o;
  return o;
end;
$$;

-- Trusted backend boundary. Not callable by customer/admin API roles directly.
-- A future verified provider integration may call this same internal operation.
create function store_private.verify_payment(p_order_id uuid, p_method text, p_verifier uuid, p_note text)
returns public.store_orders language plpgsql security invoker set search_path = '' as $$
declare o public.store_orders;
begin
  select * into o from public.store_orders where id = p_order_id for update;
  if o.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if o.payment_status = 'verified' then return o; end if;
  if o.user_id is null or o.status <> 'pending' or o.payment_status <> 'submitted' then
    raise exception 'payment_not_submitted' using errcode = '22023';
  end if;
  update public.store_orders set status = 'paid', payment_status = 'verified', payment_method = p_method,
    payment_verified_at = now(), payment_verified_by = p_verifier,
    payment_reviewed_at = now(), payment_reviewed_by = p_verifier,
    payment_verification_note = nullif(trim(p_note), '')
  where id = o.id returning * into o;

  if exists (select 1 from public.store_order_items where order_id = o.id
    and fulfillment_type = 'inner_sanctum_membership' and fulfillment_reference = 'lifetime') then
    if exists (select 1 from public.store_order_referrals where order_id = o.id) then
      perform inner_sanctum_referral_private.record_successful_referral_conversion(o.id, o.user_id, 'verified_payment', p_verifier);
    end if;
    perform inner_sanctum_private.apply_membership_transition(o.user_id, 'grant', 'store', o.order_reference, coalesce(p_verifier, o.user_id));
    update public.store_orders set fulfilled_at = now() where id = o.id returning * into o;
  end if;
  return o;
end;
$$;

create function public.admin_verify_store_payment(p_order_id uuid, p_note text default null)
returns public.store_orders language plpgsql security definer set search_path = '' as $$
declare method text;
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select payment_method into method from public.store_orders where id = p_order_id;
  return store_private.verify_payment(p_order_id, method, auth.uid(), p_note);
end;
$$;

create function public.admin_reject_store_payment(p_order_id uuid, p_note text default null)
returns public.store_orders language plpgsql security definer set search_path = '' as $$
declare o public.store_orders;
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into o from public.store_orders where id = p_order_id for update;
  if o.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if o.payment_status = 'rejected' then return o; end if;
  if o.status <> 'pending' or o.payment_status <> 'submitted' then raise exception 'payment_not_submitted' using errcode = '22023'; end if;
  update public.store_orders set payment_status = 'rejected', payment_reviewed_at = now(),
    payment_reviewed_by = auth.uid(), payment_verification_note = nullif(trim(p_note), '')
  where id = o.id returning * into o;
  return o;
end;
$$;

revoke all on function store_private.verify_payment(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.bind_my_store_order(text), public.get_my_store_checkout(text),
  public.submit_my_store_payment(text,text,text), public.admin_verify_store_payment(uuid,text),
  public.admin_reject_store_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.bind_my_store_order(text), public.get_my_store_checkout(text),
  public.submit_my_store_payment(text,text,text), public.admin_verify_store_payment(uuid,text),
  public.admin_reject_store_payment(uuid,text) to authenticated;

-- Entitlement keys remain; redemption no longer represents commercial success.
drop trigger if exists store_claim_converts_referral on public.store_claims;

-- Every entry point, including legacy admin test tooling, requires verified payment.
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
 return v_conversion_id;
end;
$$;
revoke all on function inner_sanctum_referral_private.record_successful_referral_conversion(uuid,uuid,public.inner_sanctum_referral_conversion_source,uuid) from public,anon,authenticated;

