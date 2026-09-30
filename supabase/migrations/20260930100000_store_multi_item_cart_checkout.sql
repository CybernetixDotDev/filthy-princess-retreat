-- Multi-item Store orders retain immutable line snapshots and existing payment boundaries.
alter table public.store_orders
  add column request_fingerprint text;

alter table public.store_orders
  add constraint store_orders_request_fingerprint_format check (
    request_fingerprint is null or request_fingerprint ~ '^[a-f0-9]{64}$'
  );

create or replace function store_private.protect_order_commercial_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(new.order_reference, new.request_key, new.request_fingerprint,
      new.currency, new.subtotal_amount, new.total_amount, new.created_at)
    is distinct from
    row(old.order_reference, old.request_key, old.request_fingerprint,
      old.currency, old.subtotal_amount, old.total_amount, old.created_at) then
    raise exception 'store_order_commercial_snapshot_is_immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

alter table public.store_order_items
  drop constraint if exists store_order_items_order_id_key,
  drop constraint if exists store_order_items_single_product_quantity,
  add constraint store_order_items_order_product_key unique (order_id, product_id),
  add constraint store_order_items_quantity_positive check (quantity > 0);

alter table public.store_inventory_holds
  drop constraint if exists store_inventory_holds_order_id_key,
  add constraint store_inventory_holds_order_product_key unique (order_id, product_id);

create or replace function store_private.reserve_inventory(
  p_product_id uuid,
  p_order_id uuid,
  p_quantity integer default 1
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_row public.store_products%rowtype;
  existing_hold public.store_inventory_holds%rowtype;
  committed integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'store_inventory_quantity_invalid' using errcode = '22023';
  end if;
  select * into product_row
  from public.store_products
  where id = p_product_id
  for update;
  if product_row.id is null then
    raise exception 'store_product_not_found' using errcode = 'P0002';
  end if;
  if product_row.inventory_unlimited then return; end if;

  select * into existing_hold
  from public.store_inventory_holds
  where order_id = p_order_id and product_id = p_product_id
  for update;
  if existing_hold.id is not null then
    if existing_hold.status = 'held' and existing_hold.expires_at > now()
      and existing_hold.quantity = p_quantity then return; end if;
    raise exception 'store_inventory_hold_conflict' using errcode = '22023';
  end if;

  select
    coalesce((select sum(i.quantity)
      from public.store_order_items i
      join public.store_orders o on o.id = i.order_id
      where i.product_id = p_product_id and o.status = 'paid'), 0)
    + coalesce((select sum(h.quantity)
      from public.store_inventory_holds h
      where h.product_id = p_product_id and h.status = 'held' and h.expires_at > now()), 0)
  into committed;
  if committed + p_quantity > product_row.inventory_quantity then
    raise exception 'store_inventory_unavailable' using errcode = 'P0002';
  end if;
  insert into public.store_inventory_holds(product_id, order_id, quantity, expires_at)
  values (p_product_id, p_order_id, p_quantity, now() + interval '15 minutes');
end;
$$;

create or replace function store_private.consume_inventory(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  line record;
  hold_row public.store_inventory_holds%rowtype;
begin
  for line in
    select i.product_id, i.quantity, p.inventory_unlimited
    from public.store_order_items i
    join public.store_products p on p.id = i.product_id
    where i.order_id = p_order_id
    order by i.product_id
  loop
    if line.inventory_unlimited then continue; end if;
    select * into hold_row
    from public.store_inventory_holds
    where order_id = p_order_id and product_id = line.product_id
    for update;
    if hold_row.id is null then
      raise exception 'store_inventory_hold_required' using errcode = '22023';
    end if;
    if hold_row.status <> 'held' or hold_row.expires_at <= now() then
      raise exception 'store_inventory_hold_expired' using errcode = '22023';
    end if;
    if hold_row.quantity <> line.quantity then
      raise exception 'store_inventory_hold_mismatch' using errcode = '22023';
    end if;
    update public.store_inventory_holds
    set status = 'sold', sold_at = now()
    where id = hold_row.id;
  end loop;
end;
$$;

create or replace function store_private.release_inventory(p_order_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.store_inventory_holds
  set status = 'released', released_at = now()
  where order_id = p_order_id and status = 'held';
$$;

create or replace function public.create_public_store_order_multi(
  p_items jsonb,
  p_buyer_email text,
  p_request_key uuid,
  p_referral_code text default null,
  p_acquisition_method public.store_acquisition_method default 'money'
)
returns table(order_reference text, order_status public.store_order_status, currency text, total_amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(p_buyer_email));
  normalized_items jsonb;
  request_fingerprint text;
  existing_order public.store_orders%rowtype;
  existing_items jsonb;
  selected_product public.store_products%rowtype;
  new_order public.store_orders%rowtype;
  requested_item record;
  candidate_reference text;
  currency_code text;
  order_total numeric := 0;
  filth_total bigint := 0;
  membership_count integer := 0;
  line_count integer := 0;
begin
  if p_request_key is null
    or p_acquisition_method is null
    or length(normalized_email) not between 3 and 320
    or position('@' in normalized_email) <= 1
    or p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid_store_cart' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'product_id')
      or not (item ? 'quantity')
  ) then
    raise exception 'invalid_store_cart' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', quantity) order by product_id)
  into normalized_items
  from (
    select product_id, sum(quantity)::integer quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    group by product_id
  ) grouped;

  if normalized_items is null or jsonb_array_length(normalized_items) = 0 then
    raise exception 'invalid_store_cart' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(normalized_items) as item(product_id uuid, quantity integer)
    where product_id is null or quantity is null or quantity <= 0 or quantity > 100
  ) then
    raise exception 'invalid_store_cart' using errcode = '22023';
  end if;

  request_fingerprint := encode(extensions.digest(
    convert_to(normalized_items::text || ':' || p_acquisition_method::text, 'UTF8'), 'sha256'), 'hex');

  select * into existing_order from public.store_orders where request_key = p_request_key;
  if existing_order.id is not null then
    if existing_order.buyer_email is distinct from normalized_email
      or existing_order.acquisition_method is distinct from p_acquisition_method
      or existing_order.request_fingerprint is distinct from request_fingerprint then
      if existing_order.request_fingerprint is not null
        or existing_order.buyer_email is distinct from normalized_email
        or existing_order.acquisition_method is distinct from p_acquisition_method then
        raise exception 'store_order_request_conflict' using errcode = '23505';
      end if;
      select jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', quantity) order by product_id)
      into existing_items
      from public.store_order_items where order_id = existing_order.id;
      if existing_items is distinct from normalized_items then
        raise exception 'store_order_request_conflict' using errcode = '23505';
      end if;
    end if;
    return query select existing_order.order_reference, existing_order.status,
      existing_order.currency, existing_order.total_amount;
    return;
  end if;

  for requested_item in
    select product_id, quantity
    from jsonb_to_recordset(normalized_items) as item(product_id uuid, quantity integer)
    order by product_id
  loop
    select * into selected_product
    from public.store_products
    where id = requested_item.product_id and status = 'active'
    for update;
    if selected_product.id is null then
      raise exception 'store_product_unavailable' using errcode = 'P0002';
    end if;
    if currency_code is null then currency_code := selected_product.currency;
    elsif currency_code is distinct from selected_product.currency then
      raise exception 'store_currency_mismatch' using errcode = '22023';
    end if;
    if p_acquisition_method = 'money' and not selected_product.money_enabled then
      raise exception 'store_money_acquisition_unavailable' using errcode = 'P0002';
    end if;
    if p_acquisition_method = 'filth' then
      if not selected_product.filth_enabled or selected_product.filth_price is null then
        raise exception 'store_filth_acquisition_unavailable' using errcode = 'P0002';
      end if;
      if selected_product.filth_audience = 'inner_sanctum' and not public.has_inner_sanctum_access() then
        raise exception 'inner_sanctum_access_required' using errcode = '42501';
      end if;
      filth_total := filth_total + selected_product.filth_price * requested_item.quantity;
    else
      order_total := order_total + selected_product.price_amount * requested_item.quantity;
    end if;
    if selected_product.fulfillment_type = 'inner_sanctum_membership'
      and selected_product.fulfillment_reference = 'lifetime' then
      membership_count := membership_count + requested_item.quantity;
      if requested_item.quantity <> 1 or membership_count > 1 then
        raise exception 'store_membership_quantity_invalid' using errcode = '22023';
      end if;
    end if;
    line_count := line_count + 1;
  end loop;
  if line_count = 0 or (p_acquisition_method = 'filth' and filth_total > 2147483647) then
    raise exception 'invalid_store_cart' using errcode = '22023';
  end if;

  loop
    candidate_reference := 'FP-'
      || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 8)) || '-'
      || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 9, 8)) || '-'
      || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 17, 8));
    exit when not exists (select 1 from public.store_orders where order_reference = candidate_reference);
  end loop;

  insert into public.store_orders(
    order_reference, request_key, request_fingerprint, user_id, buyer_email, status,
    currency, subtotal_amount, total_amount, acquisition_method, filth_price_snapshot
  ) values (
    candidate_reference, p_request_key, request_fingerprint, auth.uid(), normalized_email, 'pending',
    currency_code, order_total, order_total, p_acquisition_method,
    case when p_acquisition_method = 'filth' then filth_total::integer else null end
  ) returning * into new_order;

  for requested_item in
    select product_id, quantity
    from jsonb_to_recordset(normalized_items) as item(product_id uuid, quantity integer)
    order by product_id
  loop
    select * into selected_product from public.store_products where id = requested_item.product_id for update;
    insert into public.store_order_items(
      order_id, product_id, product_name, product_slug, product_type, unit_price_amount,
      currency, quantity, line_total_amount, fulfillment_type, fulfillment_reference, filth_price_snapshot
    ) values (
      new_order.id, selected_product.id, selected_product.name, selected_product.slug, selected_product.product_type,
      case when p_acquisition_method = 'money' then selected_product.price_amount else 0 end,
      selected_product.currency, requested_item.quantity,
      case when p_acquisition_method = 'money' then selected_product.price_amount * requested_item.quantity else 0 end,
      selected_product.fulfillment_type, selected_product.fulfillment_reference,
      case when p_acquisition_method = 'filth' then selected_product.filth_price else null end
    );
    perform store_private.reserve_inventory(selected_product.id, new_order.id, requested_item.quantity);
  end loop;

  if p_referral_code is not null then
    insert into public.store_order_referrals(order_id, referral_id, referrer_user_id)
    select new_order.id, r.id, r.user_id
    from public.inner_sanctum_referrals r
    where r.code = p_referral_code and public.is_valid_inner_sanctum_referral_code(r.code)
    on conflict(order_id) do nothing;
  end if;
  return query select new_order.order_reference, new_order.status,
    new_order.currency, new_order.total_amount;
end;
$$;

revoke all on function public.create_public_store_order_multi(jsonb, text, uuid, text, public.store_acquisition_method)
  from public, anon, authenticated;
grant execute on function public.create_public_store_order_multi(jsonb, text, uuid, text, public.store_acquisition_method)
  to anon, authenticated;

create or replace function public.create_public_store_order(
  p_product_id uuid,
  p_buyer_email text,
  p_request_key uuid,
  p_referral_code text default null,
  p_acquisition_method public.store_acquisition_method default 'money'
)
returns table(order_reference text, order_status public.store_order_status, currency text, total_amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from public.create_public_store_order_multi(
    jsonb_build_array(jsonb_build_object('product_id', p_product_id, 'quantity', 1)),
    p_buyer_email, p_request_key, p_referral_code, p_acquisition_method
  );
end;
$$;

drop function if exists public.get_public_store_order(text);
create function public.get_public_store_order(p_order_reference text)
returns table(
  order_reference text,
  order_status public.store_order_status,
  currency text,
  subtotal_amount numeric,
  total_amount numeric,
  created_at timestamptz,
  item_id uuid,
  product_id uuid,
  product_name text,
  product_slug text,
  product_type public.store_product_type,
  unit_price_amount numeric,
  quantity integer,
  line_total_amount numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_reference, o.status, o.currency, o.subtotal_amount, o.total_amount, o.created_at,
    i.id, i.product_id, i.product_name, i.product_slug, i.product_type,
    i.unit_price_amount, i.quantity, i.line_total_amount
  from public.store_orders o
  join public.store_order_items i on i.order_id = o.id
  where o.order_reference = upper(trim(p_order_reference))
  order by i.created_at, i.id;
$$;
revoke all on function public.get_public_store_order(text) from public, anon, authenticated;
grant execute on function public.get_public_store_order(text) to anon, authenticated;

create or replace function public.settle_my_filth_store_order(p_order_reference text)
returns public.store_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.store_orders;
  line record;
  product_row public.store_products%rowtype;
  available bigint;
  total_filth bigint := 0;
  has_membership boolean := false;
  existing_event public.inner_sanctum_filth_events%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  select * into o from public.store_orders
  where order_reference = upper(trim(p_order_reference)) and user_id = auth.uid() for update;
  if o.id is null then raise exception 'order_unavailable' using errcode = '42501'; end if;
  if o.acquisition_method <> 'filth' then raise exception 'filth_payment_not_applicable' using errcode = '22023'; end if;
  if o.status = 'paid' then return o; end if;
  if o.status in ('cancelled', 'failed') then raise exception 'order_not_open' using errcode = '22023'; end if;

  for line in
    select i.*, p.id as current_product_id
    from public.store_order_items i
    left join public.store_products p on p.id = i.product_id
    where i.order_id = o.id
    order by i.product_id
  loop
    select * into product_row from public.store_products where id = line.product_id for update;
    if product_row.id is null or product_row.status <> 'active'
      or not product_row.filth_enabled or product_row.filth_price is null
      or line.filth_price_snapshot is distinct from product_row.filth_price then
      raise exception 'filth_configuration_changed' using errcode = '22023';
    end if;
    if product_row.filth_audience = 'inner_sanctum' and not public.has_inner_sanctum_access() then
      raise exception 'inner_sanctum_access_required' using errcode = '42501';
    end if;
    total_filth := total_filth + line.filth_price_snapshot * line.quantity;
    if line.fulfillment_type = 'inner_sanctum_membership' and line.fulfillment_reference = 'lifetime' then
      has_membership := true;
    end if;
  end loop;
  if total_filth <= 0 or total_filth is distinct from o.filth_price_snapshot then
    raise exception 'filth_configuration_changed' using errcode = '22023';
  end if;
  select coalesce(sum(points), 0) into available
  from public.inner_sanctum_filth_events where user_id = auth.uid();
  if available < total_filth then raise exception 'insufficient_filth' using errcode = '22023'; end if;
  perform store_private.consume_inventory(o.id);
  select * into existing_event from public.inner_sanctum_filth_events
  where source_reference = 'store-filth-redemption:' || o.id;
  if existing_event.id is null then
    insert into public.inner_sanctum_filth_events(user_id, event_type, event_class, points, source_reference, created_by)
    values(auth.uid(), 'special', 'redemption', -total_filth, 'store-filth-redemption:' || o.id, auth.uid());
  end if;
  update public.store_orders set status = 'paid', payment_status = 'verified', payment_method = 'filth',
    payment_submitted_at = coalesce(payment_submitted_at, now()), payment_verified_at = now(),
    payment_verified_by = auth.uid(), payment_reviewed_at = now(), payment_reviewed_by = auth.uid()
  where id = o.id returning * into o;
  if has_membership then
    perform inner_sanctum_private.apply_membership_transition(o.user_id, 'grant', 'store', o.order_reference, auth.uid());
    if not exists (select 1 from public.store_order_items where order_id = o.id
      and not (fulfillment_type = 'inner_sanctum_membership' and fulfillment_reference = 'lifetime')) then
      update public.store_orders set fulfilled_at = now() where id = o.id returning * into o;
    end if;
  end if;
  return o;
end;
$$;

create or replace function store_private.verify_payment(p_order_id uuid, p_method text, p_verifier uuid, p_note text)
returns public.store_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare o public.store_orders; has_membership boolean;
begin
  select * into o from public.store_orders where id = p_order_id for update;
  if o.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if o.acquisition_method <> 'money' then raise exception 'money_payment_not_applicable' using errcode = '22023'; end if;
  if o.payment_status = 'verified' then return o; end if;
  if o.user_id is null or o.status <> 'pending' or o.payment_status <> 'submitted' then
    raise exception 'payment_not_submitted' using errcode = '22023';
  end if;
  perform store_private.consume_inventory(o.id);
  update public.store_orders set status = 'paid', payment_status = 'verified', payment_method = p_method,
    payment_verified_at = now(), payment_verified_by = p_verifier, payment_reviewed_at = now(),
    payment_reviewed_by = p_verifier, payment_verification_note = nullif(trim(p_note), '')
  where id = o.id returning * into o;
  select exists (select 1 from public.store_order_items where order_id = o.id
    and fulfillment_type = 'inner_sanctum_membership' and fulfillment_reference = 'lifetime') into has_membership;
  if has_membership then
    if exists (select 1 from public.store_order_referrals where order_id = o.id) then
      perform inner_sanctum_referral_private.record_successful_referral_conversion(o.id, o.user_id, 'verified_payment', p_verifier);
    end if;
    perform inner_sanctum_private.apply_membership_transition(o.user_id, 'grant', 'store', o.order_reference, coalesce(p_verifier, o.user_id));
    if not exists (select 1 from public.store_order_items where order_id = o.id
      and not (fulfillment_type = 'inner_sanctum_membership' and fulfillment_reference = 'lifetime')) then
      update public.store_orders set fulfilled_at = now() where id = o.id returning * into o;
    end if;
  end if;
  return o;
end;
$$;

create or replace function store_private.assert_supported_order(p_order_id uuid)
returns public.store_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare selected_order public.store_orders%rowtype;
begin
  select * into selected_order from public.store_orders where id = p_order_id for update;
  if selected_order.id is null then raise exception 'store_order_not_found' using errcode = 'P0002'; end if;
  if selected_order.status in ('cancelled', 'failed') then raise exception 'store_order_ineligible' using errcode = '22023'; end if;
  if not exists (select 1 from public.store_order_items i where i.order_id = p_order_id
    and i.fulfillment_type = 'inner_sanctum_membership' and i.fulfillment_reference = 'lifetime')
    or exists (select 1 from public.store_order_items i where i.order_id = p_order_id
      and not (i.fulfillment_type = 'inner_sanctum_membership' and i.fulfillment_reference = 'lifetime')) then
    raise exception 'unsupported_store_fulfillment' using errcode = '22023';
  end if;
  return selected_order;
end;
$$;

create or replace function public.admin_mark_store_fulfilled(p_order_id uuid)
returns public.store_orders
language plpgsql
security definer
set search_path = ''
as $$
declare order_row public.store_orders;
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into order_row from public.store_orders where id = p_order_id for update;
  if order_row.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if order_row.status <> 'paid' or order_row.payment_status <> 'verified' then raise exception 'store_order_not_paid' using errcode = '22023'; end if;
  if order_row.fulfilled_at is not null or order_row.fulfillment_completed_at is not null then return order_row; end if;
  if not exists (select 1 from public.store_order_items where order_id = order_row.id
    and not (fulfillment_type = 'inner_sanctum_membership' and fulfillment_reference = 'lifetime')) then
    raise exception 'store_order_auto_fulfilled' using errcode = '22023';
  end if;
  update public.store_orders set fulfillment_completed_at = now(), fulfillment_completed_by = auth.uid()
  where id = order_row.id returning * into order_row;
  return order_row;
end;
$$;
