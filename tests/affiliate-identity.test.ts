import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const migration = readFileSync(new URL("../supabase/migrations/20260919084950_affiliate_identity_foundation.sql", import.meta.url), "utf8");
const member = "60000000-0000-4000-8000-000000000001";
const newcomer = "60000000-0000-4000-8000-000000000002";
const affiliateOnly = "60000000-0000-4000-8000-000000000003";
const inactive = "60000000-0000-4000-8000-000000000004";

test("Affiliate identity foundation executes against isolated PostgreSQL", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  t.after(() => db.close());
  // Supabase-owned auth primitives; all application objects below come from
  // the real migrations, including Store, referrals, Filth and claim conversion.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    $$;
    grant usage on schema auth, public, extensions to anon, authenticated, service_role;
  `);
  for (const name of [
    "20260908080833_retreat_launch_foundation",
    "20260911081131_inner_sanctum_membership_foundation",
    "20260911085538_store_foundation_membership_product",
    "20260911094905_store_claim_fulfillment_foundation",
    "20260911145238_referral_filth_meter_foundation",
    "20260911145802_fix_referral_conversion_linkage",
    "20260913108000_automatic_referral_conversion_on_claim",
  ]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  }
  const rows = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows;
  const scalar = async (sql: string) => Object.values((await rows(sql))[0])[0];
  const asOwner = () => db.exec("reset role; select set_config('request.jwt.claims', '{}', false);");
  const asUser = (id: string) => db.exec(`reset role; select set_config('request.jwt.claims', '{"sub":"${id}","role":"authenticated"}', false); set role authenticated;`);
  const account = (id: string) => rows(`select * from public.affiliate_accounts where user_id = '${id}'`);
  const transition = (id: string, action: string) => db.query(`select inner_sanctum_private.apply_membership_transition($1, $2, 'admin', null, $3)`, [id, action, member]);
  const accepts = () => db.query("select * from public.accept_current_affiliate_terms('affiliate-v1', true)");
  const denied = (sql: string, code = "42501") => assert.rejects(db.query(sql), { code });
  const originalTables = (await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by tablename")).rows;
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const { tablename } of originalTables) result[tablename] = await rows(`select to_jsonb(t) as data from public.${tablename} t order by to_jsonb(t)::text`);
    return result;
  };
  await db.exec(`insert into auth.users(id, email) values
    ('${member}', 'affiliate-member@example.test'), ('${newcomer}', 'new-member@example.test'),
    ('${affiliateOnly}', 'affiliate-only@example.test'), ('${inactive}', 'inactive@example.test');
    insert into public.admin_users(user_id) values ('${member}');`);
  await transition(member, "grant");
  await transition(inactive, "grant");
  await transition(inactive, "suspend");
  await asUser(member);
  await db.query("select * from public.get_my_filth_meter()");
  await db.query("select public.admin_add_filth_points($1, 3, 'existing history fixture')", [member]);
  await db.query(`select * from public.create_public_store_order(
    (select id from public.store_products where slug = 'inner-sanctum-lifetime'),
    'historical@example.test', '60000000-0000-4000-8000-000000000011',
    (select code from public.inner_sanctum_referrals where user_id = '${member}'))`);
  await asOwner();
  const historicalOrder = await scalar("select id from public.store_orders where request_key = '60000000-0000-4000-8000-000000000011'");
  await asUser(member);
  await db.query("select public.admin_record_test_referral_conversion($1, $2)", [historicalOrder, inactive]);
  await asOwner();
  const before = await snapshot();
  const protectedDefinitions = async () => rows(`select n.nspname, p.proname, pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'inner_sanctum_referral_private', 'store_private')
    and p.proname not in ('accept_current_affiliate_terms', 'get_my_affiliate_state') order by p.oid`);
  const definitionsBefore = await protectedDefinitions();
  await db.exec(migration);

  await t.test("migration backfills active members without changing any existing domain data or functions", async () => {
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await protectedDefinitions(), definitionsBefore);
    const [a] = await account(member);
    assert.equal(a.status, "active");
    assert.equal(a.accepted_terms_version, null);
    assert.equal(a.terms_accepted_at, null);
    assert.equal((await account(inactive)).length, 0);
    // Replay the actual migration's backfill, not a hand-maintained copy.
    const backfill = migration.slice(migration.indexOf("insert into public.affiliate_accounts (user_id)\nselect"), migration.indexOf("-- Canonical membership boundary"));
    await db.exec(backfill);
    assert.deepEqual(await account(member), [a]);
  });

  await t.test("canonical grants, retries and restores provision once without consent", async () => {
    await transition(newcomer, "grant");
    const first = await account(newcomer);
    const membership = await rows(`select * from public.inner_sanctum_memberships where user_id = '${newcomer}'`);
    await transition(newcomer, "grant");
    assert.deepEqual(await account(newcomer), first);
    assert.deepEqual(await rows(`select * from public.inner_sanctum_memberships where user_id = '${newcomer}'`), membership);
    assert.equal(first[0].terms_accepted_at, null);
    await transition(inactive, "restore");
    assert.equal((await account(inactive))[0].status, "active");
    // Exercise the early return repair path for an already-active member.
    await db.exec(`delete from public.affiliate_accounts where user_id = '${newcomer}'`);
    await transition(newcomer, "grant");
    assert.equal((await account(newcomer)).length, 1);
    assert.equal((await account(newcomer))[0].terms_accepted_at, null);
  });

  await t.test("explicit Affiliate-only acceptance changes no membership, Store, referral, Filth or milestone data", async () => {
    const domainsBefore = await snapshot();
    await asUser(affiliateOnly);
    const state = (await rows("select * from public.get_my_affiliate_state()"))[0];
    assert.equal(state.has_account, false);
    assert.equal(state.has_accepted_current_terms, false);
    assert.equal(state.current_terms_version, "affiliate-v1");
    await denied("select public.accept_current_affiliate_terms('affiliate-v1', false)", "22023");
    await denied("select public.accept_current_affiliate_terms('affiliate-v1', null)", "22023");
    await denied("select public.accept_current_affiliate_terms('old-version', true)", "22023");
    await denied("select public.accept_current_affiliate_terms(null, true)", "22023");
    assert.equal((await account(affiliateOnly)).length, 0);
    await accepts();
    const first = await account(affiliateOnly);
    assert.equal(first[0].status, "active");
    assert.equal(first[0].accepted_terms_version, "affiliate-v1");
    assert.equal(await scalar(`select terms_accepted_at between now() - interval '1 minute' and now() from public.affiliate_accounts where user_id = '${affiliateOnly}'`), true);
    await accepts();
    assert.deepEqual(await account(affiliateOnly), first);
    assert.equal(await scalar("select has_inner_sanctum_access()"), false);
    assert.equal((await rows("select * from public.get_my_affiliate_state()"))[0].has_accepted_current_terms, true);
    await asOwner();
    assert.deepEqual(await snapshot(), domainsBefore);
  });

  await t.test("provisioned member acceptance leaves membership and referral identity unchanged", async () => {
    const domainsBefore = await snapshot();
    const identity = (await account(member))[0].id;
    await asUser(member);
    await accepts();
    assert.equal((await account(member))[0].id, identity);
    assert.equal((await account(member))[0].accepted_terms_version, "affiliate-v1");
    await asOwner();
    assert.deepEqual(await snapshot(), domainsBefore);
  });

  await t.test("RLS and grants deny other-user reads, direct mutation, internal ensure and anonymous RPCs", async () => {
    await asUser(affiliateOnly);
    assert.equal((await account(member)).length, 0);
    assert.equal(await scalar("select count(*) from public.affiliate_accounts"), 1);
    await denied(`update public.affiliate_accounts set status = 'closed', closed_at = now()`);
    await denied(`update public.affiliate_accounts set terms_accepted_at = '2000-01-01'`);
    await denied(`update public.affiliate_accounts set accepted_terms_version = 'forged'`);
    await denied(`insert into public.affiliate_accounts(user_id) values ('${member}')`);
    await denied("delete from public.affiliate_accounts");
    await denied(`select affiliate_private.ensure_account('${member}')`);
    await denied(`select inner_sanctum_private.apply_membership_transition('${affiliateOnly}', 'grant', 'admin', null, '${affiliateOnly}')`);
    await asOwner();
    await db.exec("set role anon");
    await denied("select * from public.affiliate_accounts");
    await denied("select * from public.get_my_affiliate_state()");
    await denied("select public.accept_current_affiliate_terms('affiliate-v1', true)");
    await asOwner();
    await db.exec("set role authenticated");
    await denied("select * from public.get_my_affiliate_state()");
    await denied("select public.accept_current_affiliate_terms('affiliate-v1', true)");
    await asOwner();
  });

  await t.test("suspension/closure cannot be bypassed and membership transitions preserve Affiliate history", async () => {
    const memberBefore = await rows(`select * from public.inner_sanctum_memberships where user_id = '${member}'`);
    for (const status of ["suspended", "closed"]) {
      await db.exec(`update public.affiliate_accounts set status = '${status}', ${status === "suspended" ? "suspended_at" : "closed_at"} = now() where user_id = '${member}'`);
      const history = await account(member);
      assert.deepEqual(await rows(`select * from public.inner_sanctum_memberships where user_id = '${member}'`), memberBefore);
      await asUser(member);
      await denied("select public.accept_current_affiliate_terms('affiliate-v1', true)");
      await asOwner();
      for (const action of ["grant", "suspend", "restore", "cancel", "grant"]) await transition(member, action);
      assert.deepEqual(await account(member), history);
      // Compare the next iteration against the intentional new membership state.
      memberBefore.splice(0, memberBefore.length, ...await rows(`select * from public.inner_sanctum_memberships where user_id = '${member}'`));
    }
  });

  await t.test("new Terms version requires fresh consent on the same account", async () => {
    const identity = (await account(affiliateOnly))[0].id;
    await db.exec(`create or replace function affiliate_private.current_terms_version() returns text language sql immutable security invoker set search_path = '' as $$ select 'affiliate-v2'::text $$;`);
    await asUser(affiliateOnly);
    assert.equal((await rows("select * from public.get_my_affiliate_state()"))[0].has_accepted_current_terms, false);
    await denied("select public.accept_current_affiliate_terms('affiliate-v1', true)", "22023");
    await db.query("select public.accept_current_affiliate_terms('affiliate-v2', true)");
    const [a] = await account(affiliateOnly);
    assert.equal(a.id, identity);
    assert.equal(a.accepted_terms_version, "affiliate-v2");
    assert.equal((await rows("select * from public.get_my_affiliate_state()"))[0].has_accepted_current_terms, true);
    await asOwner();
  });

  await t.test("Store claim still grants membership and converts referrals with Filth, even when referrer's Affiliate is closed", async () => {
    const claimant = "60000000-0000-4000-8000-000000000005";
    const token = "affiliate-claim-".padEnd(43, "0");
    const referralEventsBefore = await scalar(`select count(*) from public.inner_sanctum_filth_events where user_id = '${member}' and event_type = 'referral'`);
    await db.query("insert into auth.users(id, email) values ($1, 'claim-regression@example.test')", [claimant]);
    const code = await scalar(`select code from public.inner_sanctum_referrals where user_id = '${member}'`);
    assert.equal(await scalar(`select public.is_valid_inner_sanctum_referral_code('${code}')`), true);
    const product = await scalar("select id from public.store_products where slug = 'inner-sanctum-lifetime'");
    await db.exec("set role anon");
    const order = (await db.query<{ order_reference: string }>("select * from public.create_public_store_order($1, 'claim-regression@example.test', $2, $3)", [product, "60000000-0000-4000-8000-000000000010", code])).rows[0];
    await asOwner();
    const orderId = await scalar(`select id from public.store_orders where order_reference = '${order.order_reference}'`);
    await asUser(member);
    await db.query("select * from public.admin_authorize_store_fulfillment($1, encode(extensions.digest($2, 'sha256'), 'hex'), null)", [orderId, token]);
    await asUser(claimant);
    assert.equal((await db.query<{ redemption_state: string }>("select * from public.redeem_store_claim($1)", [token])).rows[0].redemption_state, "success");
    assert.equal(await scalar("select public.has_inner_sanctum_access()"), true);
    assert.equal((await account(claimant))[0].status, "active");
    assert.equal((await account(claimant))[0].terms_accepted_at, null);
    await db.query("select * from public.redeem_store_claim($1)", [token]);
    await asOwner();
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_referral_conversions where order_id = '${orderId}'`), 1);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_filth_events where user_id = '${member}' and event_type = 'referral'`), Number(referralEventsBefore) + 1);
    assert.equal(await scalar(`select status::text from public.store_orders where id = '${orderId}'`), "pending");
    assert.equal((await account(claimant)).length, 1);
  });

  await t.test("database constraints enforce status, identity uniqueness and paired Terms fields", async () => {
    await denied(`insert into public.affiliate_accounts(user_id) values ('${member}')`, "23505");
    await denied(`update public.affiliate_accounts set status = 'suspended', suspended_at = null where user_id = '${affiliateOnly}'`, "23514");
    await denied(`update public.affiliate_accounts set status = 'closed', closed_at = null where user_id = '${affiliateOnly}'`, "23514");
    await denied(`update public.affiliate_accounts set accepted_terms_version = null where user_id = '${affiliateOnly}'`, "23514");
    await denied(`update public.affiliate_accounts set accepted_terms_version = '' where user_id = '${affiliateOnly}'`, "23514");
    await denied(`update public.affiliate_accounts set terms_accepted_at = null where user_id = '${affiliateOnly}'`, "23514");
    await denied(`update public.affiliate_accounts set status = 'pending' where user_id = '${affiliateOnly}'`, "22P02");
  });
  // Continue from the Cell 1 database; no second harness or repeated setup.
  const unchangedDefinitions = (await protectedDefinitions()).filter((f) =>
    !["get_my_filth_meter", "is_valid_inner_sanctum_referral_code", "create_public_store_order"].includes(String(f.proname)));
  await db.exec(readFileSync(new URL("../supabase/migrations/20260919091242_affiliate_referral_identity.sql", import.meta.url), "utf8"));
  const identity = () => rows("select * from public.get_or_create_my_referral_identity()");
  const valid = async (code: unknown) => (await db.query<{ valid: boolean }>("select public.is_valid_inner_sanctum_referral_code($1) as valid", [code])).rows[0].valid;
  const acceptV2 = () => db.query("select public.accept_current_affiliate_terms('affiliate-v2', true)");
  let affiliateCode: unknown;
  let memberCode: unknown;
  const createOrder = async (code: unknown) => {
    await asOwner();
    const product = await scalar("select id from public.store_products where slug = 'inner-sanctum-lifetime'");
    await db.exec("set role anon");
    const order = (await db.query<{ order_reference: string }>("select * from public.create_public_store_order($1, 'cell2@example.test', gen_random_uuid(), $2)", [product, code])).rows[0];
    await asOwner();
    return scalar(`select id from public.store_orders where order_reference = '${order.order_reference}'`);
  };

  await t.test("Cell 2: read-only Filth meter, eligible identity provisioning and security", async () => {
    assert.deepEqual((await protectedDefinitions()).filter((f) =>
      !["get_my_filth_meter", "is_valid_inner_sanctum_referral_code", "create_public_store_order", "get_or_create_my_referral_identity"].includes(String(f.proname))), unchangedDefinitions);
    await asUser(newcomer);
    assert.equal(await scalar("select referral_code from public.get_my_filth_meter()"), null);
    assert.equal(await scalar("select count(*) from public.inner_sanctum_referrals"), 0);
    await denied("select public.get_or_create_my_referral_identity()");
    await acceptV2();
    const firstMemberIdentity = await identity();
    memberCode = firstMemberIdentity[0].code;
    assert.deepEqual(await identity(), firstMemberIdentity);
    assert.equal(await scalar("select referral_code from public.get_my_filth_meter()"), memberCode);
    await asOwner();
    const beforeCreation = await snapshot();
    await asUser(affiliateOnly);
    const first = await identity();
    affiliateCode = first[0].code;
    assert.match(String(affiliateCode), /^[0-9a-f]{24}$/);
    assert.deepEqual(await identity(), first);
    assert.equal(await valid(affiliateCode), true);
    assert.equal(await scalar("select public.has_inner_sanctum_access()"), false);
    await denied("select * from public.get_my_filth_meter()");
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_referrals where user_id = '${newcomer}'`), 0);
    await db.query("update public.inner_sanctum_referrals set user_id = $1", [newcomer]);
    assert.deepEqual(await identity(), first);
    await denied(`insert into public.inner_sanctum_referrals(user_id, code) values ('${affiliateOnly}', 'forged-referral-code')`);
    await asOwner();
    const afterCreation = await snapshot();
    delete beforeCreation.inner_sanctum_referrals;
    delete afterCreation.inner_sanctum_referrals;
    assert.deepEqual(afterCreation, beforeCreation);
    await db.exec("set role anon");
    await denied("select public.get_or_create_my_referral_identity()");
    await asOwner();
    await db.exec("set role authenticated");
    await denied("select public.get_or_create_my_referral_identity()");
    await asOwner();
  });

  await t.test("Cell 2: Terms/status/referral validity gates new Store attribution without deleting history", async () => {
    const attributedOrder = await createOrder(affiliateCode);
    assert.equal(await scalar(`select referrer_user_id from public.store_order_referrals where order_id = '${attributedOrder}'`), affiliateOnly);
    const attribution = await rows(`select * from public.store_order_referrals where order_id = '${attributedOrder}'`);
    for (const status of ["suspended", "closed"]) {
      await db.exec(`update public.affiliate_accounts set status = '${status}',
        suspended_at = ${status === "suspended" ? "now()" : "null"},
        closed_at = ${status === "closed" ? "now()" : "null"} where user_id = '${affiliateOnly}'`);
      await asUser(affiliateOnly);
      assert.equal(await valid(affiliateCode), false);
      await denied("select public.get_or_create_my_referral_identity()");
      const orderId = await createOrder(affiliateCode);
      assert.equal(await scalar(`select count(*) from public.store_order_referrals where order_id = '${orderId}'`), 0);
      assert.deepEqual(await rows(`select * from public.store_order_referrals where order_id = '${attributedOrder}'`), attribution);
      assert.equal(await scalar(`select count(*) from public.inner_sanctum_memberships where user_id = '${affiliateOnly}'`), 0);
    }
    await db.exec(`update public.affiliate_accounts set status = 'active', closed_at = null, accepted_terms_version = 'affiliate-v1' where user_id = '${affiliateOnly}'`);
    await asUser(affiliateOnly);
    assert.equal(await valid(affiliateCode), false);
    await denied("select public.get_or_create_my_referral_identity()");
    await acceptV2();
    await asOwner();
    await db.exec(`update public.inner_sanctum_referrals set status = 'disabled' where user_id = '${affiliateOnly}'`);
    await asUser(affiliateOnly);
    assert.equal((await identity())[0].status, "disabled");
    assert.equal(await valid(affiliateCode), false);
    await asOwner();
    await db.exec(`update public.inner_sanctum_referrals set status = 'active' where user_id = '${affiliateOnly}';
      update public.affiliate_accounts set accepted_terms_version = null, terms_accepted_at = null where user_id = '${newcomer}'`);
    await asUser(newcomer);
    assert.equal(await scalar("select public.has_inner_sanctum_access()"), true);
    assert.equal(await valid(memberCode), false);
    await denied("select public.get_or_create_my_referral_identity()");
    await acceptV2();
    assert.equal(await valid(memberCode), true);
    await asOwner();
  });

  await t.test("Cell 2: Affiliate-only and member claim conversions retain Filth; later membership preserves progression", async () => {
    for (const [index, referrer, code] of [[6, affiliateOnly, affiliateCode], [8, affiliateOnly, affiliateCode], [7, newcomer, memberCode]] as const) {
      const claimant = `60000000-0000-4000-8000-00000000000${index}`;
      const token = `cell2-claim-${index}`.padEnd(43, "0");
      await db.query("insert into auth.users(id, email) values ($1, $2)", [claimant, `claim-${index}@example.test`]);
      const orderId = await createOrder(code);
      assert.equal(await scalar(`select referrer_user_id from public.store_order_referrals where order_id = '${orderId}'`), referrer);
      await asUser(member);
      await db.query("select * from public.admin_authorize_store_fulfillment($1, encode(extensions.digest($2, 'sha256'), 'hex'), null)", [orderId, token]);
      await asUser(claimant);
      assert.equal((await db.query<{ redemption_state: string }>("select * from public.redeem_store_claim($1)", [token])).rows[0].redemption_state, "success");
      await db.query("select * from public.redeem_store_claim($1)", [token]);
      await asOwner();
      assert.equal(await scalar(`select count(*) from public.inner_sanctum_referral_conversions where order_id = '${orderId}'`), 1);
      assert.equal(await scalar(`select count(*) from public.inner_sanctum_filth_events e join public.inner_sanctum_referral_conversions c on e.source_reference = 'referral-conversion:' || c.id where c.order_id = '${orderId}' and e.user_id = '${referrer}'`), 1);
      assert.equal(await scalar(`select status::text from public.store_orders where id = '${orderId}'`), "pending");
    }
    await asUser(affiliateOnly);
    assert.equal(await scalar("select public.has_inner_sanctum_access()"), false);
    await denied("select * from public.get_my_filth_meter()");
    await asOwner();
    const events = await rows(`select * from public.inner_sanctum_filth_events where user_id = '${affiliateOnly}'`);
    const milestones = await rows(`select * from public.inner_sanctum_member_filth_milestones where user_id = '${affiliateOnly}'`);
    assert.ok(milestones.length > 0, "Affiliate-only progression evaluates milestones before membership");
    await transition(affiliateOnly, "grant");
    assert.deepEqual(await rows(`select * from public.inner_sanctum_filth_events where user_id = '${affiliateOnly}'`), events);
    assert.deepEqual(await rows(`select * from public.inner_sanctum_member_filth_milestones where user_id = '${affiliateOnly}'`), milestones);
    await asUser(affiliateOnly);
    assert.equal(await scalar("select public.has_inner_sanctum_access()"), true);
    assert.equal(await scalar("select filth_total from public.get_my_filth_meter()"), events.reduce((sum, e) => sum + Number(e.points), 0));
    await asOwner();
  });
  // Cell 3 applies to the same migrated database; prior stages remain regression fixtures.
  await db.exec(readFileSync(new URL("../supabase/migrations/20260919102143_authenticated_checkout_payment_verification.sql", import.meta.url), "utf8"));
  const paymentReferrer = "60000000-0000-4000-8000-000000000011";
  const buyer = "60000000-0000-4000-8000-000000000012";
  await db.query("insert into auth.users(id,email) values ($1,'payment-referrer@example.test'),($2,'buyer@example.test')", [paymentReferrer, buyer]);
  await asUser(paymentReferrer);
  await acceptV2();
  const paymentCode = (await identity())[0].code;
  await asOwner();
  const paymentOrder = async (code: unknown) => {
    const id = await createOrder(code);
    return (await db.query<Record<string, unknown>>("select * from public.store_orders where id = $1", [id])).rows[0];
  };
  const bind = (reference: unknown) => db.query("select * from public.bind_my_store_order($1)", [reference]);
  const submit = (reference: unknown) => db.query("select * from public.submit_my_store_payment($1, 'manual_crypto', 'customer-provided-reference')", [reference]);
  const verify = (id: unknown) => db.query("select * from public.admin_verify_store_payment($1, 'Independently confirmed receipt')", [id]);
  let firstPaymentOrder: Record<string, unknown>;

  await t.test("Cell 3: anonymous attribution, authenticated ownership and submission have no commercial side effects", async () => {
    firstPaymentOrder = await paymentOrder(paymentCode);
    assert.equal(firstPaymentOrder.user_id, null);
    assert.equal(firstPaymentOrder.payment_status, "pending");
    assert.equal(await scalar(`select referrer_user_id from public.store_order_referrals where order_id = '${firstPaymentOrder.id}'`), paymentReferrer);
    await db.exec("set role anon");
    await assert.rejects(bind(firstPaymentOrder.order_reference), { code: "42501" });
    await asUser(buyer);
    await assert.rejects(submit(firstPaymentOrder.order_reference), { code: "42501" });
    const bound = (await bind(firstPaymentOrder.order_reference)).rows;
    assert.deepEqual((await bind(firstPaymentOrder.order_reference)).rows, bound);
    assert.equal(await scalar("select public.has_inner_sanctum_access()"), false);
    await asUser(newcomer);
    await assert.rejects(bind(firstPaymentOrder.order_reference), { code: "42501" });
    await assert.rejects(submit(firstPaymentOrder.order_reference), { code: "42501" });
    await asUser(buyer);
    const submitted = (await submit(firstPaymentOrder.order_reference)).rows;
    assert.deepEqual((await submit(firstPaymentOrder.order_reference)).rows, submitted);
    await assert.rejects(verify(firstPaymentOrder.id), { code: "42501" });
    await denied(`select public.admin_reject_store_payment('${firstPaymentOrder.id}', null)`);
    await denied(`select store_private.verify_payment('${firstPaymentOrder.id}', 'manual_crypto', '${buyer}', null)`);
    await denied("update public.store_orders set payment_status = 'verified'");
    await asOwner();
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_memberships where user_id = '${buyer}'`), 0);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_referral_conversions where order_id = '${firstPaymentOrder.id}'`), 0);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_filth_events where user_id = '${paymentReferrer}'`), 0);
    assert.equal(await scalar(`select payment_submitted_at between now() - interval '1 minute' and now() from public.store_orders where id = '${firstPaymentOrder.id}'`), true);
    // Attribution is frozen: eligibility changes after Buy Now do not redirect it.
    await db.exec(`update public.affiliate_accounts set status = 'suspended', suspended_at = now() where user_id = '${paymentReferrer}'`);
  });

  await t.test("Cell 3: verification converts once, automatically grants membership and supports repeat purchasers/referrers", async () => {
    await asUser(member);
    const verified = (await verify(firstPaymentOrder.id)).rows;
    assert.deepEqual((await verify(firstPaymentOrder.id)).rows, verified);
    await asOwner();
    assert.equal(await scalar(`select payment_verified_by from public.store_orders where id = '${firstPaymentOrder.id}'`), member);
    assert.equal(await scalar(`select payment_status::text from public.store_orders where id = '${firstPaymentOrder.id}'`), "verified");
    assert.equal(await scalar(`select status::text from public.store_orders where id = '${firstPaymentOrder.id}'`), "paid");
    assert.equal(await scalar(`select fulfilled_at is not null from public.store_orders where id = '${firstPaymentOrder.id}'`), true);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_referral_conversions where order_id = '${firstPaymentOrder.id}'`), 1);
    assert.equal(await scalar(`select conversion_source::text from public.inner_sanctum_referral_conversions where order_id = '${firstPaymentOrder.id}'`), "verified_payment");
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_filth_events where user_id = '${paymentReferrer}'`), 1);
    assert.equal(await scalar(`select count(*) from public.store_claims where order_id = '${firstPaymentOrder.id}'`), 0);
    await asUser(buyer);
    assert.equal(await scalar("select public.has_inner_sanctum_access()"), true);
    assert.equal((await account(buyer))[0].terms_accepted_at, null);
    await asUser(paymentReferrer);
    assert.equal(await scalar("select public.has_inner_sanctum_access()"), false);
    await denied("select * from public.get_my_filth_meter()");
    await asOwner();
    await db.exec(`update public.affiliate_accounts set status = 'active', suspended_at = null where user_id = '${paymentReferrer}'`);
    const membershipBefore = await rows(`select * from public.inner_sanctum_memberships where user_id = '${buyer}'`);
    for (const [code, expectedReferrer] of [[paymentCode, paymentReferrer], [memberCode, newcomer]]) {
      const order = await paymentOrder(code);
      await asUser(buyer);
      await bind(order.order_reference);
      await submit(order.order_reference);
      await asUser(member);
      await verify(order.id);
      await verify(order.id);
      await asOwner();
      assert.equal(await scalar(`select referrer_user_id from public.inner_sanctum_referral_conversions where order_id = '${order.id}'`), expectedReferrer);
    }
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_referral_conversions where referred_user_id = '${buyer}'`), 3);
    assert.deepEqual(await rows(`select * from public.inner_sanctum_memberships where user_id = '${buyer}'`), membershipBefore);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_filth_events where user_id = '${paymentReferrer}'`), 2);
  });

  await t.test("Cell 3: rejection, self-referral, unsubmitted verification and legacy claims remain safe", async () => {
    const rejected = await paymentOrder(paymentCode);
    await asUser(buyer);
    await bind(rejected.order_reference);
    await asUser(member);
    await assert.rejects(verify(rejected.id), { code: "22023" });
    await asUser(buyer);
    await submit(rejected.order_reference);
    await asUser(member);
    await db.query("select public.admin_reject_store_payment($1, 'Receipt not found')", [rejected.id]);
    await assert.rejects(verify(rejected.id), { code: "22023" });
    await asOwner();
    assert.equal(await scalar(`select payment_reviewed_by from public.store_orders where id = '${rejected.id}'`), member);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_referral_conversions where order_id = '${rejected.id}'`), 0);
    const self = await paymentOrder(paymentCode);
    await asUser(paymentReferrer);
    await bind(self.order_reference);
    await submit(self.order_reference);
    await asUser(member);
    await assert.rejects(verify(self.id), { code: "22023", message: "self_referral" });
    await asOwner();
    assert.equal(await scalar(`select payment_status::text from public.store_orders where id = '${self.id}'`), "submitted");
    const claimOrder = await paymentOrder(paymentCode);
    const recipient = "60000000-0000-4000-8000-000000000013";
    const token = "cell3-legacy-claim".padEnd(43, "0");
    await db.query("insert into auth.users(id,email) values ($1,'legacy-claim@example.test')", [recipient]);
    await asUser(member);
    await db.query("select public.admin_authorize_store_fulfillment($1, encode(extensions.digest($2, 'sha256'),'hex'), null)", [claimOrder.id, token]);
    await asUser(recipient);
    assert.equal((await db.query<{ redemption_state: string }>("select * from public.redeem_store_claim($1)", [token])).rows[0].redemption_state, "success");
    assert.equal(await scalar("select public.has_inner_sanctum_access()"), true);
    await asOwner();
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_referral_conversions where order_id = '${claimOrder.id}'`), 0);
    await asUser(member);
    await denied(`select public.admin_record_test_referral_conversion('${claimOrder.id}', '${recipient}')`, "22023");
    await asOwner();
  });
});
