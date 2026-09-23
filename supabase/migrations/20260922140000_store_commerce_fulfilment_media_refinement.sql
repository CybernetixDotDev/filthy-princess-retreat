alter table public.store_orders
  add column fulfillment_completed_at timestamptz,
  add column fulfillment_completed_by uuid references auth.users(id) on delete set null;

alter table public.store_products
  drop constraint if exists store_products_image_path_format,
  add constraint store_products_image_path_format check (
    image_path is null
    or image_path ~ '^/assets/[A-Za-z0-9._/-]+\.(png|jpg|jpeg|webp)$'
    or image_path ~ '^store-product-media/[A-Za-z0-9._/-]+\.(png|jpg|jpeg|webp)$'
  );

insert into storage.buckets (id, name, public)
values ('store-product-media', 'store-product-media', true)
on conflict (id) do update set public = excluded.public;

create policy "Public can read Store product media"
on storage.objects for select
to public
using (bucket_id = 'store-product-media');

create policy "Admins can upload Store product media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'store-product-media' and (select retreat_private.is_retreat_admin()));

create policy "Admins can update Store product media"
on storage.objects for update
 to authenticated
using (bucket_id = 'store-product-media' and (select retreat_private.is_retreat_admin()))
with check (bucket_id = 'store-product-media' and (select retreat_private.is_retreat_admin()));

create policy "Admins can delete Store product media"
on storage.objects for delete
 to authenticated
using (bucket_id = 'store-product-media' and (select retreat_private.is_retreat_admin()));

create or replace function public.create_public_store_order(p_product_id uuid, p_buyer_email text, p_request_key uuid, p_referral_code text default null, p_acquisition_method public.store_acquisition_method default 'money')
returns table(order_reference text, order_status public.store_order_status, currency text, total_amount numeric)
language plpgsql security definer set search_path = '' as $$
declare selected_product public.store_products%rowtype; existing_order public.store_orders%rowtype; new_order public.store_orders%rowtype; normalized_email text := lower(trim(p_buyer_email)); candidate_reference text; available bigint;
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
  if p_acquisition_method = 'filth' then
    if not selected_product.filth_enabled or selected_product.filth_price is null then raise exception 'store_filth_acquisition_unavailable' using errcode = 'P0002'; end if;
    if selected_product.filth_audience = 'inner_sanctum' and not public.has_inner_sanctum_access() then raise exception 'inner_sanctum_access_required' using errcode = '42501'; end if;
    select coalesce(sum(points), 0) into available from public.inner_sanctum_filth_events where user_id = auth.uid();
    if available < selected_product.filth_price then raise exception 'insufficient_filth' using errcode = '22023'; end if;
  end if;
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

create or replace function public.admin_mark_store_fulfilled(p_order_id uuid)
returns public.store_orders language plpgsql security definer set search_path = '' as $$
declare order_row public.store_orders;
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into order_row from public.store_orders where id = p_order_id for update;
  if order_row.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if order_row.status <> 'paid' or order_row.payment_status <> 'verified' then raise exception 'store_order_not_paid' using errcode = '22023'; end if;
  if order_row.fulfilled_at is not null or order_row.fulfillment_completed_at is not null then return order_row; end if;
  if exists (select 1 from public.store_order_items where order_id = order_row.id and fulfillment_type = 'inner_sanctum_membership' and fulfillment_reference = 'lifetime') then raise exception 'store_order_auto_fulfilled' using errcode = '22023'; end if;
  update public.store_orders set fulfillment_completed_at = now(), fulfillment_completed_by = auth.uid() where id = order_row.id returning * into order_row;
  return order_row;
end;
$$;
revoke all on function public.admin_mark_store_fulfilled(uuid) from public, anon, authenticated;
grant execute on function public.admin_mark_store_fulfilled(uuid) to authenticated;
