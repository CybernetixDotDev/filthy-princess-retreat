begin;
select plan(31);

select has_table('public', 'store_products', 'Store products table exists');
select has_table('public', 'store_orders', 'Store orders table exists');
select has_table('public', 'store_order_items', 'Store order items table exists');
select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_public_store_order'
      and pg_get_function_identity_arguments(p.oid) = 'p_product_id uuid, p_buyer_email text, p_request_key uuid'
  ),
  'order creation accepts no client price or fulfillment arguments'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'store-admin@example.com', '', now(), now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'store-user@example.com', '', now(), now(), now());
insert into public.admin_users (user_id) values ('20000000-0000-4000-8000-000000000001');

insert into public.store_products (id, slug, name, short_description, description, product_type, price_amount, currency, fulfillment_type, fulfillment_reference, status)
values ('20000000-0000-4000-8000-000000000099', 'draft-test-product', 'Draft product', 'Not public', 'A private test product.', 'digital', 25, 'USD', 'manual', null, 'draft');

set local role anon;
select is((select count(*) from public.store_products where slug = 'inner-sanctum-lifetime'), 1::bigint, 'active products are publicly readable');
select is((select count(*) from public.store_products where slug = 'draft-test-product'), 0::bigint, 'draft products are hidden from the public');

reset role;
select throws_ok(
  $$insert into public.store_products (slug, name, short_description, description, product_type, price_amount, currency, fulfillment_type, fulfillment_reference) values ('inner-sanctum-lifetime', 'Duplicate', 'Duplicate slug', 'Duplicate slug product.', 'membership', 500, 'USD', 'inner_sanctum_membership', 'lifetime')$$,
  '23505', null, 'duplicate product slugs are rejected'
);
select throws_ok(
  $$insert into public.store_products (slug, name, short_description, description, product_type, price_amount, currency, fulfillment_type) values ('negative-price', 'Negative price', 'Invalid price', 'Invalid negative price.', 'digital', -1, 'USD', 'manual')$$,
  '23514', null, 'negative prices are rejected'
);
select throws_ok(
  $$insert into public.store_products (slug, name, short_description, description, product_type, price_amount, currency, fulfillment_type) values ('unsupported-fulfillment', 'Unsupported fulfillment', 'Invalid fulfillment', 'Invalid fulfillment type.', 'digital', 10, 'USD', 'telepathy')$$,
  '22P02', null, 'unsupported fulfillment types are rejected'
);

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.store_products (slug, name, short_description, description, product_type, price_amount, currency, fulfillment_type) values ('member-product', 'Member product', 'Not allowed', 'Members cannot create this.', 'digital', 10, 'USD', 'manual')$$,
  '42501', null, 'non-admin users cannot create products'
);
select results_eq(
  $$update public.store_products set price_amount = 1
    where slug = 'inner-sanctum-lifetime'
    returning 1$$,
  $$select 1 where false$$,
  'non-admin users cannot edit products'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.store_products (slug, name, short_description, description, product_type, price_amount, currency, fulfillment_type, status) values ('admin-product', 'Admin product', 'Created by admin', 'An administrator-created product.', 'digital', 40, 'USD', 'manual', 'draft')$$,
  'existing admins can create products'
);
select lives_ok(
  $$update public.store_products set price_amount = 45 where slug = 'admin-product'$$,
  'existing admins can edit products'
);

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select lives_ok(
  $$select * from public.create_public_store_order((select id from public.store_products where slug = 'inner-sanctum-lifetime'), 'buyer@example.com', '30000000-0000-4000-8000-000000000001')$$,
  'an active product creates an order'
);

reset role;
select is((select status::text from public.store_orders where request_key = '30000000-0000-4000-8000-000000000001'), 'pending', 'new orders remain pending');
select is((select total_amount from public.store_orders where request_key = '30000000-0000-4000-8000-000000000001'), 500.00::numeric, 'order amount comes from the server-side product price');
select results_eq(
  $$select product_name, product_slug, unit_price_amount, fulfillment_type::text, fulfillment_reference from public.store_order_items where order_id = (select id from public.store_orders where request_key = '30000000-0000-4000-8000-000000000001')$$,
  $$values ('Lifetime Inner Sanctum Membership'::text, 'inner-sanctum-lifetime'::text, 500.00::numeric, 'inner_sanctum_membership'::text, 'lifetime'::text)$$,
  'order items snapshot product price and fulfillment metadata'
);

set local role anon;
select throws_ok(
  $$select * from public.create_public_store_order('20000000-0000-4000-8000-000000000099', 'buyer@example.com', '30000000-0000-4000-8000-000000000002')$$,
  'P0002', 'store_product_unavailable', 'inactive products cannot create orders'
);
select results_eq(
  $$select order_reference from public.create_public_store_order((select id from public.store_products where slug = 'inner-sanctum-lifetime'), 'buyer@example.com', '30000000-0000-4000-8000-000000000001')$$,
  $$select order_reference from public.create_public_store_order((select id from public.store_products where slug = 'inner-sanctum-lifetime'), 'buyer@example.com', '30000000-0000-4000-8000-000000000001')$$,
  'repeated request keys return the original order'
);

reset role;
select is((select count(*) from public.store_orders where request_key = '30000000-0000-4000-8000-000000000001'), 1::bigint, 'idempotent submission creates only one order');

set local role anon;
select lives_ok(
  $$select * from public.create_public_store_order((select id from public.store_products where slug = 'inner-sanctum-lifetime'), 'second@example.com', '30000000-0000-4000-8000-000000000003')$$,
  'a distinct request creates another order'
);

reset role;
select is((select count(distinct order_reference) from public.store_orders where request_key in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003')), 2::bigint, 'order references are unique');
update public.store_products set name = 'Renamed membership', price_amount = 650 where slug = 'inner-sanctum-lifetime';
select results_eq(
  $$select product_name, unit_price_amount from public.store_order_items where order_id = (select id from public.store_orders where request_key = '30000000-0000-4000-8000-000000000001')$$,
  $$values ('Lifetime Inner Sanctum Membership'::text, 500.00::numeric)$$,
  'historical item snapshots do not change with the product'
);
select throws_ok(
  $$update public.store_order_items set product_name = 'Tampered' where order_id = (select id from public.store_orders where request_key = '30000000-0000-4000-8000-000000000001')$$,
  'P0001', 'store_order_item_snapshot_is_immutable', 'order item snapshots cannot be edited'
);
select throws_ok(
  $$delete from public.store_order_items where order_id = (select id from public.store_orders where request_key = '30000000-0000-4000-8000-000000000001')$$,
  'P0001', 'store_order_item_snapshot_is_immutable', 'order item snapshots cannot be deleted'
);
select is((select user_id from public.store_orders where request_key = '30000000-0000-4000-8000-000000000001'), null::uuid, 'anonymous orders can exist before an Auth user is attached');

set local role anon;
select throws_ok($$select * from public.store_orders$$, '42501', null, 'public users cannot read arbitrary orders');
select throws_ok($$update public.store_orders set status = 'paid'$$, '42501', null, 'public users cannot alter order status');

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select ok((select count(*) >= 2 from public.store_orders), 'admins can inspect Store orders');

reset role;
select is((select count(*) from public.inner_sanctum_memberships where user_id in ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002')), 0::bigint, 'creating Store orders does not create Inner Sanctum membership');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_public_store_order' and pg_get_functiondef(p.oid) like '%transition_membership%'), 0::bigint, 'order creation does not call membership transition logic');

select * from finish();
rollback;
