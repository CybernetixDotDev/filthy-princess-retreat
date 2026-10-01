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
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
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

  select jsonb_agg(jsonb_build_object('product_id', grouped.product_id, 'quantity', grouped.quantity) order by grouped.product_id)
  into normalized_items
  from (
    select item.product_id, sum(item.quantity)::integer quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    group by item.product_id
  ) grouped;

  if normalized_items is null or jsonb_array_length(normalized_items) = 0 then
    raise exception 'invalid_store_cart' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(normalized_items) as item(product_id uuid, quantity integer)
    where item.product_id is null or item.quantity is null or item.quantity <= 0 or item.quantity > 100
  ) then
    raise exception 'invalid_store_cart' using errcode = '22023';
  end if;

  request_fingerprint := encode(extensions.digest(
    convert_to(normalized_items::text || ':' || p_acquisition_method::text, 'UTF8'), 'sha256'), 'hex');

  select order_row.* into existing_order
  from public.store_orders order_row
  where order_row.request_key = p_request_key;
  if existing_order.id is not null then
    if existing_order.user_id is distinct from auth.uid()
      or existing_order.buyer_email is distinct from normalized_email
      or existing_order.acquisition_method is distinct from p_acquisition_method
      or existing_order.request_fingerprint is distinct from request_fingerprint then
      if existing_order.user_id is distinct from auth.uid()
        or existing_order.request_fingerprint is not null
        or existing_order.buyer_email is distinct from normalized_email
        or existing_order.acquisition_method is distinct from p_acquisition_method then
        raise exception 'store_order_request_conflict' using errcode = '23505';
      end if;
      select jsonb_agg(jsonb_build_object('product_id', order_item.product_id, 'quantity', order_item.quantity) order by order_item.product_id)
      into existing_items
      from public.store_order_items order_item
      where order_item.order_id = existing_order.id;
      if existing_items is distinct from normalized_items then
        raise exception 'store_order_request_conflict' using errcode = '23505';
      end if;
    end if;
    return query select existing_order.order_reference, existing_order.status,
      existing_order.currency, existing_order.total_amount;
    return;
  end if;

  for requested_item in
    select item.product_id, item.quantity
    from jsonb_to_recordset(normalized_items) as item(product_id uuid, quantity integer)
    order by item.product_id
  loop
    select product_row.* into selected_product
    from public.store_products product_row
    where product_row.id = requested_item.product_id and product_row.status = 'active'
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
    exit when not exists (
      select 1
      from public.store_orders order_row
      where order_row.order_reference = candidate_reference
    );
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
    select item.product_id, item.quantity
    from jsonb_to_recordset(normalized_items) as item(product_id uuid, quantity integer)
    order by item.product_id
  loop
    select product_row.* into selected_product
    from public.store_products product_row
    where product_row.id = requested_item.product_id
    for update;
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
    select new_order.id, referral.id, referral.user_id
    from public.inner_sanctum_referrals referral
    where referral.code = p_referral_code and public.is_valid_inner_sanctum_referral_code(referral.code)
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
