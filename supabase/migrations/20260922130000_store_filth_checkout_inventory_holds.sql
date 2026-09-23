create type public.store_acquisition_method as enum ('money', 'filth');
create type public.store_inventory_hold_status as enum ('held', 'sold', 'released');

alter table public.store_orders
  add column acquisition_method public.store_acquisition_method not null default 'money',
  add column filth_price_snapshot integer;

alter table public.store_order_items
  add column filth_price_snapshot integer;

alter table public.store_orders
  add constraint store_orders_filth_price_snapshot_valid check (filth_price_snapshot is null or filth_price_snapshot > 0);
alter table public.store_order_items
  add constraint store_order_items_filth_price_snapshot_valid check (filth_price_snapshot is null or filth_price_snapshot > 0);

create table public.store_inventory_holds (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products(id) on delete restrict,
  order_id uuid not null unique references public.store_orders(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  status public.store_inventory_hold_status not null default 'held',
  held_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sold_at timestamptz,
  released_at timestamptz,
  constraint store_inventory_holds_expiry_valid check (expires_at > held_at),
  constraint store_inventory_holds_terminal_timestamps check (
    (status = 'held' and sold_at is null and released_at is null)
    or (status = 'sold' and sold_at is not null and released_at is null)
    or (status = 'released' and sold_at is null and released_at is not null)
  )
);
create index store_inventory_holds_product_active_idx
  on public.store_inventory_holds(product_id, status, expires_at);

alter table public.store_inventory_holds enable row level security;
revoke all on table public.store_inventory_holds from anon, authenticated;
grant select on public.store_inventory_holds to authenticated;
create policy "own store inventory holds" on public.store_inventory_holds
  for select to authenticated
  using (exists (select 1 from public.store_orders o where o.id = order_id and o.user_id = (select auth.uid())));

create or replace function store_private.reserve_inventory(p_product_id uuid, p_order_id uuid, p_quantity integer default 1)
returns void language plpgsql security invoker set search_path = '' as $$
declare product_row public.store_products%rowtype; committed integer;
begin
  select * into product_row from public.store_products where id = p_product_id for update;
  if product_row.id is null then raise exception 'store_product_not_found' using errcode = 'P0002'; end if;
  if product_row.inventory_unlimited then return; end if;
  if exists (select 1 from public.store_inventory_holds where order_id = p_order_id and status = 'held' and expires_at > now()) then return; end if;
  select
    coalesce((select sum(i.quantity) from public.store_order_items i join public.store_orders o on o.id = i.order_id where i.product_id = p_product_id and o.status = 'paid'), 0)
    + coalesce((select sum(h.quantity) from public.store_inventory_holds h where h.product_id = p_product_id and h.status = 'held' and h.expires_at > now()), 0)
  into committed;
  if committed + p_quantity > product_row.inventory_quantity then
    raise exception 'store_inventory_unavailable' using errcode = 'P0002';
  end if;
  insert into public.store_inventory_holds(product_id, order_id, quantity, expires_at)
  values (p_product_id, p_order_id, p_quantity, now() + interval '15 minutes');
end;
$$;
revoke all on function store_private.reserve_inventory(uuid, uuid, integer) from public, anon, authenticated;

create or replace function store_private.consume_inventory(p_order_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare hold_row public.store_inventory_holds%rowtype; product_row public.store_products%rowtype;
begin
  select * into hold_row from public.store_inventory_holds where order_id = p_order_id for update;
  if hold_row.id is null then
    select p.* into product_row from public.store_products p join public.store_order_items i on i.product_id = p.id where i.order_id = p_order_id;
    if product_row.id is null or product_row.inventory_unlimited then return; end if;
    raise exception 'store_inventory_hold_required' using errcode = '22023';
  end if;
  if hold_row.status <> 'held' or hold_row.expires_at <= now() then
    raise exception 'store_inventory_hold_expired' using errcode = '22023';
  end if;
  update public.store_inventory_holds set status = 'sold', sold_at = now() where id = hold_row.id;
end;
$$;
revoke all on function store_private.consume_inventory(uuid) from public, anon, authenticated;

create or replace function store_private.release_inventory(p_order_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.store_inventory_holds
  set status = 'released', released_at = now()
  where order_id = p_order_id and status = 'held';
$$;
revoke all on function store_private.release_inventory(uuid) from public, anon, authenticated;

create or replace function store_private.prevent_inventory_reduction()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare committed integer;
begin
  if new.inventory_unlimited then return new; end if;
  select
    coalesce((select sum(i.quantity) from public.store_order_items i join public.store_orders o on o.id = i.order_id where i.product_id = new.id and o.status = 'paid'), 0)
    + coalesce((select sum(h.quantity) from public.store_inventory_holds h where h.product_id = new.id and h.status = 'held' and h.expires_at > now()), 0)
  into committed;
  if new.inventory_quantity < committed then
    raise exception 'store_inventory_below_committed' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function store_private.prevent_inventory_reduction() from public, anon, authenticated;
create trigger store_products_prevent_inventory_reduction
before update of inventory_unlimited, inventory_quantity on public.store_products
for each row execute function store_private.prevent_inventory_reduction();

drop function if exists public.create_public_store_order(uuid, text, uuid, text);

create or replace function public.create_public_store_order(p_product_id uuid, p_buyer_email text, p_request_key uuid, p_referral_code text default null, p_acquisition_method public.store_acquisition_method default 'money')
returns table(order_reference text, order_status public.store_order_status, currency text, total_amount numeric)
language plpgsql security definer set search_path = '' as $$
declare selected_product public.store_products%rowtype; existing_order public.store_orders%rowtype; new_order public.store_orders%rowtype; normalized_email text := lower(trim(p_buyer_email)); candidate_reference text;
begin
  if p_product_id is null or p_request_key is null or length(normalized_email) not between 3 and 320 or position('@' in normalized_email) <= 1 then raise exception 'invalid_store_order_request' using errcode = '22023'; end if;
  select * into existing_order from public.store_orders where request_key = p_request_key;
  if existing_order.id is not null then
    if existing_order.buyer_email is distinct from normalized_email then raise exception 'store_order_request_conflict' using errcode = '23505'; end if;
    return query select existing_order.order_reference, existing_order.status, existing_order.currency, existing_order.total_amount; return;
  end if;
  select * into selected_product from public.store_products where id = p_product_id and status = 'active' for update;
  if selected_product.id is null then raise exception 'store_product_unavailable' using errcode = 'P0002'; end if;
  if p_acquisition_method = 'money' and not selected_product.money_enabled then raise exception 'store_money_acquisition_unavailable' using errcode = 'P0002'; end if;
  if p_acquisition_method = 'filth' and (not selected_product.filth_enabled or selected_product.filth_price is null) then raise exception 'store_filth_acquisition_unavailable' using errcode = 'P0002'; end if;
  if p_acquisition_method = 'filth' and selected_product.filth_audience = 'inner_sanctum' and not public.has_inner_sanctum_access() then raise exception 'inner_sanctum_access_required' using errcode = '42501'; end if;
  loop
    candidate_reference := 'FP-' || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 8)) || '-' || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 9, 8)) || '-' || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 17, 8));
    exit when not exists(select 1 from public.store_orders o where o.order_reference = candidate_reference);
  end loop;
  insert into public.store_orders(order_reference, request_key, user_id, buyer_email, status, currency, subtotal_amount, total_amount, acquisition_method, filth_price_snapshot)
  values(candidate_reference, p_request_key, auth.uid(), normalized_email, 'pending', selected_product.currency, case when p_acquisition_method = 'money' then selected_product.price_amount else 0 end, case when p_acquisition_method = 'money' then selected_product.price_amount else 0 end, p_acquisition_method, case when p_acquisition_method = 'filth' then selected_product.filth_price else null end)
  returning * into new_order;
  insert into public.store_order_items(order_id, product_id, product_name, product_slug, product_type, unit_price_amount, currency, quantity, line_total_amount, fulfillment_type, fulfillment_reference, filth_price_snapshot)
  values(new_order.id, selected_product.id, selected_product.name, selected_product.slug, selected_product.product_type, case when p_acquisition_method = 'money' then selected_product.price_amount else 0 end, selected_product.currency, 1, case when p_acquisition_method = 'money' then selected_product.price_amount else 0 end, selected_product.fulfillment_type, selected_product.fulfillment_reference, case when p_acquisition_method = 'filth' then selected_product.filth_price else null end);
  perform store_private.reserve_inventory(selected_product.id, new_order.id, 1);
  if p_referral_code is not null then
    insert into public.store_order_referrals(order_id, referral_id, referrer_user_id)
    select new_order.id, r.id, r.user_id from public.inner_sanctum_referrals r where r.code = p_referral_code and public.is_valid_inner_sanctum_referral_code(r.code) on conflict(order_id) do nothing;
  end if;
  return query select new_order.order_reference, new_order.status, new_order.currency, new_order.total_amount;
end;
$$;
revoke all on function public.create_public_store_order(uuid, text, uuid, text, public.store_acquisition_method) from public, anon, authenticated;
grant execute on function public.create_public_store_order(uuid, text, uuid, text, public.store_acquisition_method) to anon, authenticated;

create or replace function public.get_my_store_inventory_hold(p_order_reference text)
returns table(quantity integer, status public.store_inventory_hold_status, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select h.quantity, h.status, h.expires_at
  from public.store_inventory_holds h join public.store_orders o on o.id = h.order_id
  where o.order_reference = upper(trim(p_order_reference)) and o.user_id = (select auth.uid());
$$;
revoke all on function public.get_my_store_inventory_hold(text) from public, anon, authenticated;
grant execute on function public.get_my_store_inventory_hold(text) to authenticated;

create or replace function public.submit_my_store_payment(p_order_reference text, p_payment_method text, p_payment_reference text default null)
returns public.store_orders language plpgsql security definer set search_path = '' as $$
declare o public.store_orders;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into o from public.store_orders where order_reference = upper(trim(p_order_reference)) and user_id = auth.uid() for update;
  if o.id is null then raise exception 'order_unavailable' using errcode = '42501'; end if;
  if o.acquisition_method <> 'money' then raise exception 'money_payment_not_applicable' using errcode = '22023'; end if;
  if o.payment_status = 'submitted' then return o; end if;
  if o.status <> 'pending' or o.payment_status <> 'pending' then raise exception 'payment_not_pending' using errcode = '22023'; end if;
  if p_payment_method is null or p_payment_method not in ('manual_transfer', 'manual_crypto', 'manual_other') then raise exception 'invalid_payment_method' using errcode = '22023'; end if;
  update public.store_orders set payment_status = 'submitted', payment_method = p_payment_method, payment_reference = nullif(trim(p_payment_reference), ''), payment_submitted_at = now() where id = o.id returning * into o;
  return o;
end;
$$;
revoke all on function public.submit_my_store_payment(text, text, text) from public, anon, authenticated;
grant execute on function public.submit_my_store_payment(text, text, text) to authenticated;

create or replace function store_private.verify_payment(p_order_id uuid, p_method text, p_verifier uuid, p_note text)
returns public.store_orders language plpgsql security invoker set search_path = '' as $$
declare o public.store_orders;
begin
  select * into o from public.store_orders where id = p_order_id for update;
  if o.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if o.acquisition_method <> 'money' then raise exception 'money_payment_not_applicable' using errcode = '22023'; end if;
  if o.payment_status = 'verified' then return o; end if;
  if o.user_id is null or o.status <> 'pending' or o.payment_status <> 'submitted' then raise exception 'payment_not_submitted' using errcode = '22023'; end if;
  perform store_private.consume_inventory(o.id);
  update public.store_orders set status = 'paid', payment_status = 'verified', payment_method = p_method, payment_verified_at = now(), payment_verified_by = p_verifier, payment_reviewed_at = now(), payment_reviewed_by = p_verifier, payment_verification_note = nullif(trim(p_note), '') where id = o.id returning * into o;
  if exists (select 1 from public.store_order_items where order_id = o.id and fulfillment_type = 'inner_sanctum_membership' and fulfillment_reference = 'lifetime') then
    if exists (select 1 from public.store_order_referrals where order_id = o.id) then
      perform inner_sanctum_referral_private.record_successful_referral_conversion(o.id, o.user_id, 'verified_payment', p_verifier);
    end if;
    perform inner_sanctum_private.apply_membership_transition(o.user_id, 'grant', 'store', o.order_reference, coalesce(p_verifier, o.user_id));
    update public.store_orders set fulfilled_at = now() where id = o.id returning * into o;
  end if;
  return o;
end;
$$;
revoke all on function store_private.verify_payment(uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public.settle_my_filth_store_order(p_order_reference text)
returns public.store_orders language plpgsql security definer set search_path = '' as $$
declare o public.store_orders; item public.store_order_items%rowtype; product_row public.store_products%rowtype; available bigint; existing_event public.inner_sanctum_filth_events%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  select * into o from public.store_orders where order_reference = upper(trim(p_order_reference)) and user_id = auth.uid() for update;
  if o.id is null then raise exception 'order_unavailable' using errcode = '42501'; end if;
  if o.acquisition_method <> 'filth' then raise exception 'filth_payment_not_applicable' using errcode = '22023'; end if;
  if o.status = 'paid' then return o; end if;
  if o.status in ('cancelled', 'failed') then raise exception 'order_not_open' using errcode = '22023'; end if;
  select * into item from public.store_order_items where order_id = o.id for update;
  select * into product_row from public.store_products where id = item.product_id for update;
  if product_row.id is null or product_row.status <> 'active' or not product_row.filth_enabled or product_row.filth_price is null or o.filth_price_snapshot is distinct from product_row.filth_price then raise exception 'filth_configuration_changed' using errcode = '22023'; end if;
  if product_row.filth_audience = 'inner_sanctum' and not public.has_inner_sanctum_access() then raise exception 'inner_sanctum_access_required' using errcode = '42501'; end if;
  select coalesce(sum(points), 0) into available from public.inner_sanctum_filth_events where user_id = auth.uid();
  if available < product_row.filth_price then raise exception 'insufficient_filth' using errcode = '22023'; end if;
  perform store_private.consume_inventory(o.id);
  select * into existing_event from public.inner_sanctum_filth_events where source_reference = 'store-filth-redemption:' || o.id;
  if existing_event.id is null then
    insert into public.inner_sanctum_filth_events(user_id, event_type, event_class, points, source_reference, created_by)
    values(auth.uid(), 'special', 'redemption', -product_row.filth_price, 'store-filth-redemption:' || o.id, auth.uid());
  end if;
  update public.store_orders set status = 'paid', payment_status = 'verified', payment_method = 'filth', payment_submitted_at = coalesce(payment_submitted_at, now()), payment_verified_at = now(), payment_verified_by = auth.uid(), payment_reviewed_at = now(), payment_reviewed_by = auth.uid() where id = o.id returning * into o;
  if item.fulfillment_type = 'inner_sanctum_membership' and item.fulfillment_reference = 'lifetime' then
    perform inner_sanctum_private.apply_membership_transition(o.user_id, 'grant', 'store', o.order_reference, auth.uid());
    update public.store_orders set fulfilled_at = now() where id = o.id returning * into o;
  end if;
  return o;
end;
$$;
revoke all on function public.settle_my_filth_store_order(text) from public, anon, authenticated;
grant execute on function public.settle_my_filth_store_order(text) to authenticated;

create or replace function public.admin_reject_store_payment(p_order_id uuid, p_note text default null)
returns public.store_orders language plpgsql security definer set search_path = '' as $$
declare o public.store_orders;
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into o from public.store_orders where id = p_order_id for update;
  if o.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if o.acquisition_method <> 'money' then raise exception 'money_payment_not_applicable' using errcode = '22023'; end if;
  if o.payment_status = 'rejected' then return o; end if;
  if o.status <> 'pending' or o.payment_status <> 'submitted' then raise exception 'payment_not_submitted' using errcode = '22023'; end if;
  update public.store_orders set payment_status = 'rejected', payment_reviewed_at = now(), payment_reviewed_by = auth.uid(), payment_verification_note = nullif(trim(p_note), '') where id = o.id returning * into o;
  perform store_private.release_inventory(o.id);
  return o;
end;
$$;
revoke all on function public.admin_reject_store_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_reject_store_payment(uuid, text) to authenticated;
