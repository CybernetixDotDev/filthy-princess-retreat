update public.store_products
set fulfillment_reference = 'lifetime', updated_at = now()
where id = '77e5cde7-9535-4bc2-b53c-f54212d578b3'
  and slug = 'inner-sanctum-lifetime'
  and fulfillment_type = 'inner_sanctum_membership'
  and fulfillment_reference is null;

alter table public.store_products
  add constraint store_products_membership_fulfillment_reference_valid
  check (fulfillment_type <> 'inner_sanctum_membership' or fulfillment_reference = 'lifetime')
  not valid;

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
  if selected_order.status <> 'paid' or selected_order.payment_status <> 'verified' then raise exception 'verified_payment_required' using errcode = '22023'; end if;
  if exists (select 1 from public.store_order_items i where i.order_id = p_order_id and i.fulfillment_type = 'inner_sanctum_membership' and i.fulfillment_reference = 'lifetime')
    and not exists (select 1 from public.store_order_items i where i.order_id = p_order_id and not (i.fulfillment_type = 'inner_sanctum_membership' and i.fulfillment_reference = 'lifetime')) then
    return selected_order;
  end if;
  if p_order_id = '2a5564f3-502c-48db-bb45-a8a9a1de475e'::uuid
    and selected_order.status = 'paid' and selected_order.payment_status = 'verified'
    and selected_order.payment_method = 'payfast' and selected_order.currency = 'ZAR'
    and selected_order.total_amount = 5000.00
    and not exists (select 1 from public.store_order_items i where i.order_id = p_order_id and i.quantity <> 1)
    and not exists (select 1 from public.store_order_items i where i.order_id = p_order_id and i.product_id <> '77e5cde7-9535-4bc2-b53c-f54212d578b3'::uuid)
    and exists (select 1 from public.store_order_items i where i.order_id = p_order_id and i.product_id = '77e5cde7-9535-4bc2-b53c-f54212d578b3'::uuid and i.product_type = 'membership' and i.currency = 'ZAR' and i.unit_price_amount = 5000.00 and i.line_total_amount = 5000.00 and i.fulfillment_type = 'inner_sanctum_membership' and i.fulfillment_reference is null)
    and exists (select 1 from public.store_products p where p.id = '77e5cde7-9535-4bc2-b53c-f54212d578b3'::uuid and p.slug = 'inner-sanctum-lifetime' and p.status = 'active' and p.product_type = 'membership' and p.price_amount = 5000.00 and p.currency = 'ZAR' and p.fulfillment_type = 'inner_sanctum_membership' and p.fulfillment_reference = 'lifetime')
    and not exists (select 1 from public.store_claims c where c.order_id = p_order_id and c.status in ('available', 'claimed'))
    and selected_order.fulfilled_at is null and selected_order.fulfillment_completed_at is null then
    return selected_order;
  end if;
  raise exception 'unsupported_store_fulfillment' using errcode = '22023';
end;
$$;