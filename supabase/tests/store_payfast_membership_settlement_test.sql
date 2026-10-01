begin;
select plan(41);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('50000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner-c@example.test', '', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'owner-d@example.test', '', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'owner-e@example.test', '', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'claim-recipient@example.test', '', now(), now(), now());
insert into public.admin_users (user_id) values ('50000000-0000-4000-8000-000000000002');

insert into public.store_products (
  id, slug, name, short_description, description, product_type, price_amount, currency,
  fulfillment_type, fulfillment_reference, status, inventory_unlimited, inventory_quantity
) values (
  '50000000-0000-4000-8000-000000000099', 'payfast-settlement-membership-test', 'Settlement membership',
  'Test membership', 'PayFast settlement test membership.', 'membership', 5000.00, 'ZAR',
  'inner_sanctum_membership', 'lifetime', 'active', false, 10
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select * from public.create_public_store_order_multi(
  jsonb_build_array(jsonb_build_object('product_id', '50000000-0000-4000-8000-000000000099', 'quantity', 1)),
  'billing-a@example.test', '50000000-0000-4000-8000-000000000101', null, 'money'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select * from public.create_public_store_order_multi(
  jsonb_build_array(jsonb_build_object('product_id', '50000000-0000-4000-8000-000000000099', 'quantity', 1)),
  'billing-b@example.test', '50000000-0000-4000-8000-000000000102', null, 'money'
);
reset role;
select inner_sanctum_private.apply_membership_transition(
  '50000000-0000-4000-8000-000000000002', 'grant', 'store', 'pre-existing-membership', '50000000-0000-4000-8000-000000000002'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select * from public.create_public_store_order_multi(
  jsonb_build_array(jsonb_build_object('product_id', '50000000-0000-4000-8000-000000000099', 'quantity', 1)),
  'billing-c@example.test', '50000000-0000-4000-8000-000000000103', null, 'money'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select * from public.create_public_store_order_multi(
  jsonb_build_array(jsonb_build_object('product_id', '50000000-0000-4000-8000-000000000099', 'quantity', 1)),
  'billing-d@example.test', '50000000-0000-4000-8000-000000000104', null, 'money'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select * from public.create_public_store_order_multi(
  jsonb_build_array(jsonb_build_object('product_id', '50000000-0000-4000-8000-000000000099', 'quantity', 1)),
  'legacy-billing@example.test', '50000000-0000-4000-8000-000000000105', null, 'money'
);
reset role;
update public.store_orders set user_id = null where request_key = '50000000-0000-4000-8000-000000000105';

insert into public.store_payfast_payment_attempts (id, order_id, provider_reference, amount, currency)
select v.attempt_id, o.id, v.provider_reference, o.total_amount, o.currency
from (values
  ('50000000-0000-4000-8000-000000000111'::uuid, '50000000-0000-4000-8000-000000000101'::uuid, 'FP-PF-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  ('50000000-0000-4000-8000-000000000112'::uuid, '50000000-0000-4000-8000-000000000102'::uuid, 'FP-PF-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'),
  ('50000000-0000-4000-8000-000000000113'::uuid, '50000000-0000-4000-8000-000000000103'::uuid, 'FP-PF-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'),
  ('50000000-0000-4000-8000-000000000114'::uuid, '50000000-0000-4000-8000-000000000104'::uuid, 'FP-PF-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'),
  ('50000000-0000-4000-8000-000000000115'::uuid, '50000000-0000-4000-8000-000000000105'::uuid, 'FP-PF-EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE')
) as v(attempt_id, request_key, provider_reference)
join public.store_orders o on o.request_key = v.request_key;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is((select settlement_state from public.settle_payfast_store_payment(
  'FP-PF-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '90000000001', repeat('a', 64), 'COMPLETE', '5000.00', 'ZAR', 'verified test payment'
)), 'settled', 'verified owned membership payment settles');
select is((select status::text from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101'), 'paid', 'successful order is marked paid');
select is((select payment_status::text from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101'), 'verified', 'successful order is marked verified');
select is((select user_id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101'), '50000000-0000-4000-8000-000000000001'::uuid, 'settlement preserves the authenticated order owner');
select results_eq(
  $$select status::text, membership_type::text from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000001'$$,
  $$values ('active'::text, 'lifetime'::text)$$,
  'membership is granted to the persisted order owner'
);
select results_eq(
  $$select source::text, source_reference from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000001'$$,
  $$select 'store'::text, order_reference from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101'$$,
  'membership records Store provenance and originating order reference'
);
select is((select buyer_email from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101'), 'billing-a@example.test', 'checkout email remains billing data distinct from account email');
select is((select status from public.store_payfast_payment_attempts where id = '50000000-0000-4000-8000-000000000111'), 'settled', 'successful attempt is marked settled');
select is((select status::text from public.store_inventory_holds where order_id = (select id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101')), 'sold', 'successful settlement consumes the inventory hold');
select is((select fulfilled_at is not null from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101'), true, 'directly granted membership marks the order fulfilled');

select is((select settlement_state from public.settle_payfast_store_payment(
  'FP-PF-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '90000000001', repeat('a', 64), 'COMPLETE', '5000.00', 'ZAR', 'duplicate test notification'
)), 'duplicate', 'repeated notification is recognized as a duplicate');
select is((select count(*) from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000001'), 1::bigint, 'duplicate notification does not duplicate membership');
select is((select status from public.store_payfast_payment_attempts where id = '50000000-0000-4000-8000-000000000111'), 'settled', 'duplicate notification preserves the settled attempt');
select is((select count(*) from public.store_inventory_holds where order_id = (select id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101') and status = 'sold'), 1::bigint, 'duplicate notification does not consume inventory twice');

select is((select settlement_state from public.settle_payfast_store_payment(
  'FP-PF-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', '90000000002', repeat('b', 64), 'COMPLETE', '5000.00', 'ZAR', 'verified test payment'
)), 'settled', 'payment for an existing active member settles');
select is((select count(*) from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000002'), 1::bigint, 'existing member remains a single membership');
select is((select source_reference from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000002'), 'pre-existing-membership', 'existing active membership provenance is not overwritten');

select is((select settlement_state from public.settle_payfast_store_payment(
  'FP-PF-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', '90000000003', repeat('c', 64), 'FAILED', '5000.00', 'ZAR', 'failed test payment'
)), 'recorded_failure', 'failed PayFast status is recorded without settlement');
select results_eq(
  $$select status::text, payment_status::text from public.store_orders where request_key = '50000000-0000-4000-8000-000000000103'$$,
  $$values ('pending'::text, 'pending'::text)$$,
  'failed payment leaves the order unpaid'
);
select is((select status from public.store_payfast_payment_attempts where id = '50000000-0000-4000-8000-000000000113'), 'verified_failed', 'failed attempt retains its terminal status');
select is((select count(*) from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000003'), 0::bigint, 'failed payment grants no membership');

select throws_ok(
  $$select * from public.settle_payfast_store_payment('FP-PF-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', '90000000004', repeat('d', 64), 'COMPLETE', '5000.00', 'USD', 'invalid currency')$$,
  '22023', 'payfast_notification_invalid', 'non-ZAR notification is rejected before fulfilment'
);
select is((select settlement_state from public.settle_payfast_store_payment(
  'FP-PF-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', '90000000004', repeat('e', 64), 'COMPLETE', '5001.00', 'ZAR', 'amount mismatch'
)), 'reconciliation_required', 'amount mismatch enters reconciliation');
select is((select status from public.store_payfast_payment_attempts where id = '50000000-0000-4000-8000-000000000114'), 'reconciliation_required', 'reconciliation attempt state is retained');
select is((select count(*) from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000004'), 0::bigint, 'reconciliation-required payment grants no membership');
select is((select status::text from public.store_inventory_holds where order_id = (select id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000104')), 'held', 'reconciliation-required payment does not consume inventory');

select is((select settlement_state from public.settle_payfast_store_payment(
  'FP-PF-EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', '90000000005', repeat('f', 64), 'COMPLETE', '5000.00', 'ZAR', 'verified legacy payment'
)), 'settled', 'valid historical unowned membership payment still settles');
select is((select user_id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000105'), null::uuid, 'settlement does not guess an owner for a legacy order');
select is((select count(*) from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000005'), 0::bigint, 'legacy unowned payment grants no membership to its creator');
select is((select count(*) from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000006'), 0::bigint, 'legacy billing email does not assign membership to an account');

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  format($$select * from public.admin_authorize_store_fulfillment(%L, %L, 'compatibility-test')$$,
    (select id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101'),
    encode(extensions.digest(convert_to(repeat('A', 43), 'UTF8'), 'sha256'), 'hex')),
  'legacy claim authorization remains available after direct membership fulfilment'
);
reset role;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select redemption_state from public.redeem_store_claim(repeat('A', 43))), 'already_member', 'claim redemption safely recognizes directly granted membership');
reset role;
select is((select count(*) from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000001'), 1::bigint, 'claim redemption does not duplicate directly granted membership');
select is((select source_reference from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000001'), (select order_reference from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101'), 'claim redemption preserves the direct membership provenance');
select is((select status::text from public.store_claims where order_id = (select id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101')), 'claimed', 'existing claim is consumed by its matching account');
select is((select fulfilled_at is not null from public.store_orders where request_key = '50000000-0000-4000-8000-000000000101'), true, 'claim handoff keeps the order fulfilled');

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  format($$select * from public.admin_authorize_store_fulfillment(%L, %L, 'legacy-compatibility-test')$$,
    (select id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000105'),
    encode(extensions.digest(convert_to(repeat('E', 43), 'UTF8'), 'sha256'), 'hex')),
  'legacy NULL-owner paid order remains eligible for its claim'
);
reset role;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((select redemption_state from public.redeem_store_claim(repeat('E', 43))), 'success', 'legacy unowned order can still be claimed by an authenticated recipient');
reset role;
select is((select user_id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000105'), '50000000-0000-4000-8000-000000000006'::uuid, 'legacy claim attaches the order to the claimant, not its billing email');
select results_eq(
  $$select status::text, source::text, source_reference from public.inner_sanctum_memberships where user_id = '50000000-0000-4000-8000-000000000006'$$,
  $$select 'active'::text, 'store'::text, order_reference from public.store_orders where request_key = '50000000-0000-4000-8000-000000000105'$$,
  'legacy claim grants lifetime membership with Store provenance'
);
select is((select status::text from public.store_claims where order_id = (select id from public.store_orders where request_key = '50000000-0000-4000-8000-000000000105')), 'claimed', 'legacy claim is marked claimed');

select * from finish();
rollback;
