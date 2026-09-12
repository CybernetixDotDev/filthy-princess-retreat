begin;
select plan(40);

select has_table('public', 'store_fulfillment_authorizations', 'fulfillment authorization table exists');
select has_table('public', 'store_claims', 'claim table exists');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('40000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'claim-admin@example.com', '', now(), now(), now()),
  ('40000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'claim-user@example.com', '', now(), now(), now()),
  ('40000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'claim-other@example.com', '', now(), now(), now());
insert into public.admin_users (user_id) values ('40000000-0000-4000-8000-000000000001');

set local role anon;
select * from public.create_public_store_order(
  (select id from public.store_products where slug = 'inner-sanctum-lifetime'),
  'billing-email@example.com', '40000000-0000-4000-8000-000000000011'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format($$select * from public.admin_authorize_store_fulfillment(%L, %L, null)$$,
    (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000011'),
    encode(extensions.digest(convert_to('claim-one-x00000000000000000000000000000000', 'UTF8'), 'sha256'), 'hex')),
  '42501', 'not_authorized', 'non-admin cannot authorize fulfillment'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  format($$select * from public.admin_authorize_store_fulfillment(%L, %L, 'test-admin')$$,
    (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000011'),
    encode(extensions.digest(convert_to('claim-one-x00000000000000000000000000000000', 'UTF8'), 'sha256'), 'hex')),
  'admin can authorize eligible membership order and issue its first claim atomically'
);

reset role;
select is((select count(*) from public.store_fulfillment_authorizations), 1::bigint, 'only one authorization exists for the order');
select is((select count(*) from public.store_claims where status = 'available'), 1::bigint, 'authorization creates one available claim');
select is((select status::text from public.store_orders where request_key = '40000000-0000-4000-8000-000000000011'), 'pending', 'authorization does not mark the order paid');
select is((select count(*) from public.inner_sanctum_memberships where user_id in ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003')), 0::bigint, 'authorization and claim creation do not grant membership');
select is((select token_hash from public.store_claims limit 1), encode(extensions.digest(convert_to('claim-one-x00000000000000000000000000000000', 'UTF8'), 'sha256'), 'hex'), 'only the SHA-256 token digest is persisted');
select isnt((select token_hash from public.store_claims limit 1), 'claim-one-x00000000000000000000000000000000', 'raw token is not persisted');

set local role anon;
select throws_ok($$select * from public.store_claims$$, '42501', null, 'public cannot list claims or hashes');
select throws_ok($$select * from public.store_fulfillment_authorizations$$, '42501', null, 'public cannot list authorizations');
select throws_ok($$select * from public.redeem_store_claim('claim-one-x00000000000000000000000000000000')$$, '42501', null, 'logged-out visitor cannot redeem');
select results_eq(
  $$select claim_state from public.get_store_claim_state('claim-one-x00000000000000000000000000000000')$$,
  $$values ('available'::text)$$, 'available secret resolves without exposing its hash'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select redemption_state from public.redeem_store_claim('claim-one-x00000000000000000000000000000000')$$,
  $$values ('success'::text)$$, 'authenticated customer can explicitly redeem an authorized key'
);
reset role;
select results_eq(
  $$select status::text, membership_type::text, source::text, source_reference from public.inner_sanctum_memberships where user_id = '40000000-0000-4000-8000-000000000002'$$,
  $$select 'active'::text, 'lifetime'::text, 'store'::text, order_reference from public.store_orders where request_key = '40000000-0000-4000-8000-000000000011'$$,
  'redemption grants canonical lifetime membership with immutable Store provenance'
);
select is((select user_id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000011'), '40000000-0000-4000-8000-000000000002'::uuid, 'anonymous order attaches to the authenticated user despite a different buyer email');
select results_eq(
  $$select status::text, claimed_by, (claimed_at is not null) from public.store_claims where order_id = (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000011')$$,
  $$values ('claimed'::text, '40000000-0000-4000-8000-000000000002'::uuid, true)$$,
  'successful redemption permanently records claimant and time'
);

select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select redemption_state from public.redeem_store_claim('claim-one-x00000000000000000000000000000000')$$,
  $$values ('claimed'::text)$$, 'claim replay cannot produce a second claimant'
);
select throws_ok($$select inner_sanctum_private.apply_membership_transition(auth.uid(), 'grant', 'store', 'forged', auth.uid())$$, '42501', null, 'customer cannot invoke the private membership core');
select throws_ok($$update public.store_orders set user_id = auth.uid()$$, '42501', null, 'customer cannot manually attach an order');
select throws_ok($$update public.store_claims set status = 'claimed', claimed_by = auth.uid(), claimed_at = now()$$, '42501', null, 'customer cannot manually set claim state');

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select * from public.create_public_store_order((select id from public.store_products where slug = 'inner-sanctum-lifetime'), 'gift@example.com', '40000000-0000-4000-8000-000000000012');
reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select * from public.admin_authorize_store_fulfillment(
  (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000012'),
  encode(extensions.digest(convert_to('claim-two-x00000000000000000000000000000000', 'UTF8'), 'sha256'), 'hex'), null
);
reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select redemption_state from public.redeem_store_claim('claim-two-x00000000000000000000000000000000')$$, $$values ('already_member'::text)$$, 'existing active lifetime member does not consume a second key');
reset role;
select is((select status::text from public.store_claims where order_id = (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000012')), 'available', 'second key remains available');
select is((select user_id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000012'), null::uuid, 'second order remains unattached');
select is((select source_reference from public.inner_sanctum_memberships where user_id = '40000000-0000-4000-8000-000000000002'), (select order_reference from public.store_orders where request_key = '40000000-0000-4000-8000-000000000011'), 'existing membership provenance is unchanged');

select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(format($$select * from public.admin_reissue_store_claim(%L, %L)$$,
  (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000012'),
  encode(extensions.digest(convert_to('claim-new-x00000000000000000000000000000000', 'UTF8'), 'sha256'), 'hex')), 'admin can reissue an unclaimed key');
reset role;
select is((select count(*) from public.store_claims where status = 'available' and order_id = (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000012')), 1::bigint, 'database enforces one available key per order');
select is((select count(*) from public.store_claims where status = 'revoked' and order_id = (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000012')), 1::bigint, 'reissue preserves revoked key history');
set local role anon;
select results_eq($$select claim_state from public.get_store_claim_state('claim-two-x00000000000000000000000000000000')$$, $$values ('revoked'::text)$$, 'old key fails after reissue');
select results_eq($$select claim_state from public.get_store_claim_state('claim-new-x00000000000000000000000000000000')$$, $$values ('available'::text)$$, 'new key is usable');

reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.admin_revoke_store_claim((select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000012'))::text, 'revoked', 'admin can revoke an unclaimed key');
reset role;
set local role anon;
select results_eq($$select claim_state from public.get_store_claim_state('claim-new-x00000000000000000000000000000000')$$, $$values ('revoked'::text)$$, 'revocation immediately prevents redemption');

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select * from public.create_public_store_order((select id from public.store_products where slug = 'inner-sanctum-lifetime'), 'cancelled@example.com', '40000000-0000-4000-8000-000000000013');
select * from public.create_public_store_order((select id from public.store_products where slug = 'inner-sanctum-lifetime'), 'failed@example.com', '40000000-0000-4000-8000-000000000014');
reset role;
update public.store_orders set status = 'cancelled' where request_key = '40000000-0000-4000-8000-000000000013';
update public.store_orders set status = 'failed' where request_key = '40000000-0000-4000-8000-000000000014';
insert into public.store_products (id, slug, name, short_description, description, product_type, price_amount, currency, fulfillment_type, status)
values ('40000000-0000-4000-8000-000000000099', 'manual-fulfillment-test', 'Manual test', 'Manual', 'Manual fulfillment product.', 'digital', 10, 'USD', 'manual', 'active');
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select * from public.create_public_store_order('40000000-0000-4000-8000-000000000099', 'manual@example.com', '40000000-0000-4000-8000-000000000015');
reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(format($$select * from public.admin_authorize_store_fulfillment(%L, %L, null)$$, (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000013'), encode(extensions.digest(convert_to('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'UTF8'), 'sha256'), 'hex')), '22023', 'store_order_ineligible', 'cancelled orders cannot be authorized');
select throws_ok(format($$select * from public.admin_authorize_store_fulfillment(%L, %L, null)$$, (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000014'), encode(extensions.digest(convert_to('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'UTF8'), 'sha256'), 'hex')), '22023', 'store_order_ineligible', 'failed orders cannot be authorized');
select throws_ok(format($$select * from public.admin_authorize_store_fulfillment(%L, %L, null)$$, (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000015'), encode(extensions.digest(convert_to('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', 'UTF8'), 'sha256'), 'hex')), '22023', 'unsupported_store_fulfillment', 'unsupported fulfillment snapshots are rejected');

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select * from public.create_public_store_order((select id from public.store_products where slug = 'inner-sanctum-lifetime'), 'linked@example.com', '40000000-0000-4000-8000-000000000016');
reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select * from public.admin_authorize_store_fulfillment((select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000016'), encode(extensions.digest(convert_to('DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', 'UTF8'), 'sha256'), 'hex'), null);
reset role;
update public.store_orders set user_id = '40000000-0000-4000-8000-000000000002' where request_key = '40000000-0000-4000-8000-000000000016';
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select * from public.redeem_store_claim('DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD')$$, '42501', 'store_order_owned_by_another_user', 'order linked to another user cannot be reassigned');
reset role;
select is((select status::text from public.store_claims where order_id = (select id from public.store_orders where request_key = '40000000-0000-4000-8000-000000000016')), 'available', 'failed ownership validation does not consume the claim');

select is((select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'store_payments'), 0::bigint, 'FP-4 creates no payment table');
select is((select count(*) from public.store_orders where status = 'paid'), 0::bigint, 'FP-4 authorization never sets paid status');

select * from finish();
rollback;
