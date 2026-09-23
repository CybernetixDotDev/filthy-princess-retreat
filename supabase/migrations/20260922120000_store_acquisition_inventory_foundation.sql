create type public.store_filth_audience as enum ('inner_sanctum', 'authenticated');

alter table public.store_products
  add column money_enabled boolean not null default true,
  add column filth_enabled boolean not null default false,
  add column filth_price integer,
  add column filth_audience public.store_filth_audience,
  add column inventory_unlimited boolean not null default true,
  add column inventory_quantity integer,
  add column show_remaining_quantity boolean not null default false;

alter table public.store_products
  add constraint store_products_filth_price_valid check (filth_price is null or filth_price > 0),
  add constraint store_products_filth_configuration_valid check (
    (filth_enabled = false and filth_price is null and filth_audience is null)
    or (filth_enabled = true and filth_price is not null and filth_audience is not null)
  ),
  add constraint store_products_inventory_configuration_valid check (
    (inventory_unlimited = true and inventory_quantity is null and show_remaining_quantity = false)
    or (inventory_unlimited = false and inventory_quantity is not null and inventory_quantity >= 0)
  ),
  add constraint store_products_published_acquisition_valid check (
    status <> 'active' or money_enabled = true or filth_enabled = true
  );

create or replace function public.create_public_store_order(p_product_id uuid,p_buyer_email text,p_request_key uuid,p_referral_code text default null)
returns table(order_reference text,order_status public.store_order_status,currency text,total_amount numeric)
language plpgsql security definer set search_path = '' as $$
declare selected_product public.store_products; existing_order public.store_orders; new_order public.store_orders; normalized_email text := lower(trim(p_buyer_email)); candidate_reference text;
begin
  if p_product_id is null or p_request_key is null or length(normalized_email) not between 3 and 320 or position('@' in normalized_email) <= 1 then raise exception 'invalid_store_order_request' using errcode = '22023'; end if;
  select * into existing_order from public.store_orders where request_key = p_request_key;
  if existing_order.id is not null then
    if existing_order.buyer_email is distinct from normalized_email then raise exception 'store_order_request_conflict' using errcode = '23505'; end if;
    return query select existing_order.order_reference, existing_order.status, existing_order.currency, existing_order.total_amount; return;
  end if;
  select * into selected_product from public.store_products where id = p_product_id and status = 'active';
  if selected_product.id is null or not selected_product.money_enabled then raise exception 'store_money_acquisition_unavailable' using errcode = 'P0002'; end if;
  if not selected_product.inventory_unlimited and selected_product.inventory_quantity = 0 then raise exception 'store_product_unavailable' using errcode = 'P0002'; end if;
  loop
    candidate_reference := 'FP-' || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 8)) || '-' || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 9, 8)) || '-' || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 17, 8));
    exit when not exists(select 1 from public.store_orders o where o.order_reference = candidate_reference);
  end loop;
  insert into public.store_orders(order_reference, request_key, user_id, buyer_email, status, currency, subtotal_amount, total_amount)
  values(candidate_reference, p_request_key, auth.uid(), normalized_email, 'pending', selected_product.currency, selected_product.price_amount, selected_product.price_amount) returning * into new_order;
  insert into public.store_order_items(order_id, product_id, product_name, product_slug, product_type, unit_price_amount, currency, quantity, line_total_amount, fulfillment_type, fulfillment_reference)
  values(new_order.id, selected_product.id, selected_product.name, selected_product.slug, selected_product.product_type, selected_product.price_amount, selected_product.currency, 1, selected_product.price_amount, selected_product.fulfillment_type, selected_product.fulfillment_reference);
  if p_referral_code is not null then
    insert into public.store_order_referrals(order_id, referral_id, referrer_user_id)
    select new_order.id, r.id, r.user_id from public.inner_sanctum_referrals r where r.code = p_referral_code and public.is_valid_inner_sanctum_referral_code(r.code) on conflict(order_id) do nothing;
  end if;
  return query select new_order.order_reference, new_order.status, new_order.currency, new_order.total_amount;
end;
$$;
