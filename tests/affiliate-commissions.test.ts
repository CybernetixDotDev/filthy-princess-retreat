import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("Cell 4 commission entitlement through verified payment", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key, email text, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid; $$;
    grant usage on schema auth, public, extensions to anon, authenticated, service_role;`);
  for (const name of [
    "20260908080833_retreat_launch_foundation", "20260911081131_inner_sanctum_membership_foundation",
    "20260911085538_store_foundation_membership_product", "20260911094905_store_claim_fulfillment_foundation",
    "20260911145238_referral_filth_meter_foundation", "20260911145802_fix_referral_conversion_linkage",
    "20260913108000_automatic_referral_conversion_on_claim", "20260919084950_affiliate_identity_foundation",
    "20260919091242_affiliate_referral_identity", "20260919102143_authenticated_checkout_payment_verification",
    "20260921063832_affiliate_commission_ledger",
  ]) await db.exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  const admin = randomUUID(), buyer = randomUUID(), referrer = randomUUID();
  const owner = () => db.exec("reset role; select set_config('request.jwt.claims', '{}', false)");
  const asUser = (id: string) => db.exec(`reset role; select set_config('request.jwt.claims', '{"sub":"${id}"}', false); set role authenticated`);
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  await db.query("insert into auth.users(id,email) values ($1,'admin@test.example'),($2,'buyer@test.example'),($3,'referrer@test.example')", [admin,buyer,referrer]);
  await db.query("insert into public.admin_users(user_id) values ($1)", [admin]);
  await db.query("insert into public.affiliate_accounts(user_id,accepted_terms_version,terms_accepted_at) values ($1,'affiliate-v1',now())", [referrer]);
  await db.query("insert into public.inner_sanctum_referrals(user_id,code) values ($1,'commission-referral-code')", [referrer]);
  const product = await scalar("select id from public.store_products where slug='inner-sanctum-lifetime'") as string;
  const ready = () => db.query("update public.affiliate_accounts set status='active', suspended_at=null, closed_at=null, accepted_terms_version='affiliate-v1', terms_accepted_at=now() where user_id=$1", [referrer]);
  const prepare = async (price = 5000, currency = "USD") => {
    await owner(); await ready();
    await db.query("update public.store_products set price_amount=$1,currency=$2,commission_type=null,commission_value=null where id=$3", [price,currency,product]);
    await asUser(buyer);
    const result = await db.query<{order_reference: string}>("select * from public.create_public_store_order($1,'buyer@test.example',$2,'commission-referral-code')", [product,randomUUID()]);
    const reference = result.rows[0].order_reference;
    await db.query("select public.submit_my_store_payment($1,'manual_transfer',null)", [reference]);
    await owner();
    return await scalar(`select id from public.store_orders where order_reference='${reference}'`) as string;
  };
  const verify = async (id: string) => {
    await asUser(admin); await db.query("select public.admin_verify_store_payment($1)", [id]); await owner();
  };
  const commissions = async (id: string) => (await db.query<Record<string, unknown>>(`select c.* from public.affiliate_commissions c join public.inner_sanctum_referral_conversions v on v.id=c.conversion_id where v.order_id=$1`, [id])).rows;
  const assertProgress = async (id: string) => {
    assert.equal(await scalar(`select payment_status from public.store_orders where id='${id}'`), "verified");
    assert.equal(await scalar(`select fulfilled_at is not null from public.store_orders where id='${id}'`), true);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_referral_conversions where order_id='${id}'`), 1);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_filth_events e join public.inner_sanctum_referral_conversions v on e.source_reference='referral-conversion:'||v.id where v.order_id='${id}'`), 1);
  };
  let original: Record<string, unknown>, originalOrder: string;
  await t.test("percentage, pending status, hold, snapshot basis, retries", async () => {
    originalOrder = await prepare();
    // Current product price must not replace the order snapshot.
    await db.query("update public.store_products set price_amount=1 where id=$1", [product]);
    await verify(originalOrder);
    [original] = await commissions(originalOrder);
    assert.equal(Number(original.commission_amount), 500);
    assert.equal(Number(original.gross_amount), 5000);
    assert.equal(Number(original.commissionable_amount), 5000);
    assert.equal(Number(original.rule_value), 10);
    assert.equal(original.status, "pending");
    assert.equal(new Date(original.available_at as string).getTime()-new Date(original.created_at as string).getTime(),14*86400000);
    await verify(originalOrder);
    await db.query("select inner_sanctum_referral_private.record_successful_referral_conversion($1,$2,'verified_payment',$3)", [originalOrder,buyer,admin]);
    assert.equal((await commissions(originalOrder)).length,1);
    await assertProgress(originalOrder);
  });
  await t.test("fixed programme rule and cap", async () => {
    await db.exec("update public.affiliate_commission_settings set default_commission_type='fixed',default_commission_value=500");
    for (const [price,expected] of [[1000,500],[100,100]]) {
      const id=await prepare(price); await verify(id);
      assert.equal(Number((await commissions(id))[0].commission_amount),expected);
    }
    await db.exec("update public.affiliate_commission_settings set default_commission_type='percentage',default_commission_value=10");
  });
  await t.test("product override and immutable historical rule snapshots", async () => {
    const id=await prepare(100);
    await db.query("update public.store_products set commission_type='percentage',commission_value=25 where id=$1", [product]);
    await verify(id); const before=(await commissions(id))[0];
    assert.equal(Number(before.commission_amount),25); assert.equal(Number(before.rule_value),25);
    await db.exec("update public.affiliate_commission_settings set default_commission_value=30");
    await db.query("update public.store_products set commission_type='fixed',commission_value=9 where id=$1", [product]);
    assert.deepEqual((await commissions(id))[0],before);
    assert.deepEqual((await commissions(originalOrder))[0],original);
    await db.exec("update public.affiliate_commission_settings set default_commission_value=10");
  });
  await t.test("zero basis, non-USD, rounded zero, zero rule and cent rounding", async () => {
    for (const [price,currency,expected] of [[0,"USD",0],[100,"EUR",0],[0.01,"USD",0],[0.05,"USD",0.01]] as const) {
      const id=await prepare(price,currency); await verify(id); await assertProgress(id);
      const rows=await commissions(id);
      if (!expected) assert.equal(rows.length,0); else assert.equal(Number(rows[0].commission_amount),expected);
    }
    const id=await prepare(); await db.exec("update public.affiliate_commission_settings set default_commission_value=0");
    await verify(id); assert.equal((await commissions(id)).length,0);
    await db.exec("update public.affiliate_commission_settings set default_commission_value=10");
  });
  await t.test("ineligible Affiliate retains progression and never earns retroactively", async () => {
    for (const change of ["status='suspended',suspended_at=now()", "status='closed',closed_at=now()", "accepted_terms_version='stale'", "accepted_terms_version=null,terms_accepted_at=null"]) {
      const id=await prepare();
      await db.exec(`update public.affiliate_accounts set ${change} where user_id='${referrer}'`);
      await verify(id); await assertProgress(id); assert.equal((await commissions(id)).length,0);
      await ready(); await verify(id);
      await db.query("select inner_sanctum_referral_private.record_successful_referral_conversion($1,$2,'verified_payment',$3)", [id,buyer,admin]);
      assert.equal((await commissions(id)).length,0);
    }
  });
  await t.test("configuration constraints, immutability, identity retention and client denial", async () => {
    await assert.rejects(db.query("update public.store_products set commission_type='fixed',commission_value=null where id=$1", [product]));
    await assert.rejects(db.exec("update public.affiliate_commission_settings set default_commission_value=101"));
    await assert.rejects(db.exec("update public.affiliate_commission_settings set default_commission_value='NaN'"));
    await assert.rejects(db.exec("update public.affiliate_commission_settings set commission_hold_days=-1"));
    await assert.rejects(db.exec("update public.affiliate_commissions set commission_amount=1"), /immutable/);
    await assert.rejects(db.exec("delete from public.affiliate_commissions"), /immutable/);
    await assert.rejects(db.query("delete from public.affiliate_accounts where user_id=$1", [referrer]), /foreign key constraint/);
    await assert.rejects(db.query("delete from auth.users where id=$1", [referrer]), /foreign key constraint/);
    await asUser(referrer);
    for (const sql of ["insert into public.affiliate_commissions default values", "update public.affiliate_commissions set commission_amount=1", "delete from public.affiliate_commissions", "update public.affiliate_commission_settings set default_commission_value=50", `select affiliate_private.create_conversion_commission('${original.conversion_id}')`]) {
      await assert.rejects(db.exec(sql),{code:"42501"});
    }
    await owner();
  });
  await t.test("missing configuration rolls back the entire verification transaction", async () => {
    const id=await prepare(); await db.exec("delete from public.affiliate_commission_settings");
    await asUser(admin); await assert.rejects(db.query("select public.admin_verify_store_payment($1)",[id])); await owner();
    assert.equal(await scalar(`select payment_status from public.store_orders where id='${id}'`),"submitted");
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_referral_conversions where order_id='${id}'`),0);
    await db.exec("insert into public.affiliate_commission_settings(id) values(true)");
    await verify(id); assert.equal((await commissions(id)).length,1);
  });
});
