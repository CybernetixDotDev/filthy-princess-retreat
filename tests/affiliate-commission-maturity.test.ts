import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("Cell 5 authoritative commission maturity", async (t) => {
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
  // Apply in one transaction, matching migration deployment semantics.
  await db.exec("begin;" + readFileSync(new URL("../supabase/migrations/20260921065120_affiliate_commission_maturity.sql", import.meta.url), "utf8") + "commit;");
  const referrer=randomUUID(), buyer=randomUUID();
  await db.query("insert into auth.users(id,email) values ($1,'referrer@test.example'),($2,'buyer@test.example')",[referrer,buyer]);
  const account=(await db.query<{id:string}>("insert into public.affiliate_accounts(user_id,accepted_terms_version,terms_accepted_at) values ($1,'affiliate-v1',now()) returning id",[referrer])).rows[0].id;
  const referral=(await db.query<{id:string}>("insert into public.inner_sanctum_referrals(user_id,code) values ($1,'maturity-referral-code') returning id",[referrer])).rows[0].id;
  const seed=async (due:boolean) => {
    const order=randomUUID(), conversion=randomUUID(), commission=randomUUID();
    const reference='FP-'+randomUUID().replaceAll('-','').slice(0,24).toUpperCase().match(/.{8}/g)!.join('-');
    await db.query(`insert into public.store_orders(id,order_reference,request_key,user_id,buyer_email,currency,subtotal_amount,total_amount)
      values($1,$2,$3,$4,'buyer@test.example','USD',100,100)`,[order,reference,randomUUID(),buyer]);
    await db.query(`insert into public.inner_sanctum_referral_conversions(id,referral_id,referrer_user_id,referred_user_id,order_id,order_reference,points_awarded,conversion_source)
      values($1,$2,$3,$4,$5,$6,1,'verified_payment')`,[conversion,referral,referrer,buyer,order,reference]);
    await db.query(`insert into public.affiliate_commissions(id,conversion_id,affiliate_account_id,referrer_user_id,gross_amount,commissionable_amount,rule_type,rule_value,commission_amount,created_at,available_at)
      values($1,$2,$3,$4,100,100,'percentage',10,10,now()-interval '30 days',now()+$5::interval)`,[commission,conversion,account,referrer,due?'-1 day':'1 day']);
    return commission;
  };
  const rows=async () => (await db.query<Record<string,unknown>>("select * from public.affiliate_commissions order by id")).rows;
  const mature=async () => Number((await db.query<{count:number}>("select affiliate_private.mature_due_commissions() as count")).rows[0].count);
  const existing=await seed(true);
  assert.equal(await mature(),1);
  const beforeExisting=(await rows()).find(r=>r.id===existing);
  const due1=await seed(true), due2=await seed(true), future=await seed(false);
  const before=await rows();

  await t.test("mixed set: two due, future pending and already available; exact database timestamp",async () => {
    await db.exec('begin');
    assert.equal(await mature(),2);
    assert.equal((await db.query<{ok:boolean}>("select bool_and(matured_at=now()) as ok from public.affiliate_commissions where id in ($1,$2)",[due1,due2])).rows[0].ok,true);
    await db.exec('commit');
    const after=await rows();
    assert.deepEqual(after.find(r=>r.id===existing),beforeExisting);
    assert.deepEqual(after.find(r=>r.id===future),before.find(r=>r.id===future));
    for (const id of [due1,due2]) {
      const row=after.find(r=>r.id===id)!; assert.equal(row.status,'available');
      assert.ok(new Date(row.matured_at as string)>new Date(row.available_at as string));
      const {status,matured_at,...financial}=row;
      const {status:oldStatus,matured_at:oldMatured,...oldFinancial}=before.find(r=>r.id===id)!;
      assert.deepEqual(financial,oldFinancial);
    }
  });
  await t.test("repeated calls leave all rows and maturity timestamps unchanged",async () => {
    const snapshot=await rows(); assert.equal(await mature(),0); assert.equal(await mature(),0);
    assert.deepEqual(await rows(),snapshot);
  });
  await t.test("suspended, closed, stale Terms and missing Terms do not prevent earned maturity",async () => {
    for (const state of ["status='suspended',suspended_at=now(),closed_at=null", "status='closed',closed_at=now()", "status='active',suspended_at=null,closed_at=null,accepted_terms_version='stale'", "accepted_terms_version=null,terms_accepted_at=null"]) {
      const id=await seed(true);
      await db.exec(`update public.affiliate_accounts set ${state} where id='${account}'`);
      assert.equal(await mature(),1);
      assert.equal((await rows()).find(r=>r.id===id)!.status,'available');
    }
  });
  await t.test("financial immutability, early maturity, timestamp tampering, regression and deletion blocked",async () => {
    const due=await seed(true);
    for (const sql of [
      `update public.affiliate_commissions set status='available',matured_at=now(),rule_value=20,commission_amount=20 where id='${due}'`,
      `update public.affiliate_commissions set status='available',matured_at=now() where id='${future}'`,
      `update public.affiliate_commissions set status='available',matured_at=available_at where id='${due}'`,
      `update public.affiliate_commissions set status='pending',matured_at=null where id='${existing}'`,
      `update public.affiliate_commissions set matured_at=now() where id='${existing}'`,
      `delete from public.affiliate_commissions where id='${due}'`,
    ]) await assert.rejects(db.exec(sql),/immutable/);
    assert.equal(await mature(),1);
  });
  await t.test("anonymous and authenticated roles cannot invoke maturity or update the ledger",async () => {
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec('select affiliate_private.mature_due_commissions()'),{code:'42501'});
      await assert.rejects(db.exec("update public.affiliate_commissions set status='available',matured_at=now()"),{code:'42501'});
      await db.exec('reset role');
    }
  });
});
