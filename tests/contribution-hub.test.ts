import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("Cell 6 Contribution Hub database boundaries", async (t) => {
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
  for (const name of ["20260921065120_affiliate_commission_maturity", "20260921074720_contribution_hub"]) {
    await db.exec("begin;" + readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8") + "commit;");
  }
  const admin=randomUUID(), user=randomUUID(), other=randomUUID();
  await db.query("insert into auth.users(id,email) values ($1,'admin@test.example'),($2,'user@test.example'),($3,'other@test.example')",[admin,user,other]);
  await db.query("insert into public.admin_users(user_id) values ($1)",[admin]);
  const owner=()=>db.exec("reset role; select set_config('request.jwt.claims','{}',false)");
  const asUser=(id:string)=>db.exec(`reset role; select set_config('request.jwt.claims','{"sub":"${id}"}',false); set role authenticated`);
  const scalar=async(sql:string)=>Object.values((await db.query<Record<string,unknown>>(sql)).rows[0])[0];
  const submit=async(title="A useful idea")=>(await db.query<{id:string}>("select public.submit_contribution('idea',$1,'A practical suggestion',null,'Additional context') as id",[title])).rows[0].id;
  const mine=async()=>(await db.query<Record<string,unknown>>("select * from public.get_my_contributions()")).rows;
  const progress=async()=>(await db.query<Record<string,unknown>>("select * from public.get_my_contribution_progress()")).rows[0];
  let id:string, declined:string;

  await t.test("Auth-only submission derives owner, begins submitted, awards nothing",async()=>{
    await asUser(user); id=await submit();
    const row=(await mine())[0];
    assert.equal(row.id,id); assert.equal(row.status,"submitted"); assert.equal(row.filth_awarded,0); assert.equal(row.paid_opportunity,false);
    assert.equal(await scalar("select public.has_inner_sanctum_access()"),false);
    assert.equal((await progress()).filth_total,0);
    await assert.rejects(db.exec(`select public.submit_contribution(p_user_id=>'${other}',p_category=>'idea',p_title=>'forged',p_description=>'forged')`));
    await assert.rejects(db.exec(`insert into public.contribution_submissions(user_id,category,title,description) values('${other}','idea','forged','forged')`),{code:"42501"});
    await owner();
    assert.equal(await scalar(`select user_id from public.contribution_submissions where id='${id}'`),user);
    assert.equal(await scalar(`select count(*) from public.affiliate_accounts where user_id='${user}'`),0);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_filth_events where user_id='${user}'`),0);
  });
  await t.test("owner-only projection and database input validation",async()=>{
    await asUser(other); declined=await submit("Another person's idea");
    assert.deepEqual((await mine()).map(r=>r.id),[declined]);
    assert.deepEqual((await db.query("select * from public.contribution_submissions")).rows,[]);
    for (const sql of [
      "select public.submit_contribution('idea',' ','valid',null,null)",
      "select public.submit_contribution('idea','valid',' ',null,null)",
      "select public.submit_contribution('idea','valid','valid','javascript:alert(1)',null)",
      "select public.submit_contribution('idea','valid','valid',null,repeat('a',3001))",
    ]) await assert.rejects(db.exec(sql));
  });
  await t.test("non-admin cannot review, inspect admin projections or mutate submissions",async()=>{
    for (const sql of [
      `select public.admin_mark_contribution_reviewing('${id}')`,
      `select public.admin_accept_contribution('${id}',50,false,null)`,
      `select public.admin_decline_contribution('${id}',null)`,
      "select * from public.admin_get_contributions()",
      `update public.contribution_submissions set status='accepted' where id='${id}'`,
    ]) await assert.rejects(db.exec(sql),{code:"42501"});
  });
  await t.test("reviewing awards nothing; atomic acceptance evaluates milestones exactly once",async()=>{
    await asUser(admin);
    await db.query("select public.admin_mark_contribution_reviewing($1)",[id]);
    await db.query("select public.admin_mark_contribution_reviewing($1)",[id]);
    await owner(); assert.equal(await scalar(`select count(*) from public.inner_sanctum_filth_events where user_id='${user}'`),0);
    // One explicit milestone ensures the canonical evaluator is exercised.
    await db.exec("insert into public.inner_sanctum_filth_milestones(threshold,title) values(50,'Contribution test milestone')");
    await asUser(admin);
    const accepted=(await db.query("select (public.admin_accept_contribution($1,50,true,'Private review note')).*",[id])).rows[0];
    const retry=(await db.query("select (public.admin_accept_contribution($1,50,true,'Private review note')).*",[id])).rows[0];
    assert.deepEqual(retry,accepted);
    for (const [award,paid,note] of [[51,true,'Private review note'],[50,false,'Private review note'],[50,true,'Changed note']]) {
      await assert.rejects(db.query("select public.admin_accept_contribution($1,$2,$3,$4)",[id,award,paid,note]),/contribution_acceptance_conflict/);
    }
    await assert.rejects(db.query("select public.admin_decline_contribution($1,null)",[id]));
    await owner();
    const events=(await db.query<Record<string,unknown>>("select * from public.inner_sanctum_filth_events where source_reference=$1",['contribution:'+id])).rows;
    assert.equal(events.length,1); assert.equal(events[0].event_type,'contribution'); assert.equal(events[0].points,50); assert.equal(events[0].created_by,admin);
    assert.equal(await scalar(`select count(*) from public.inner_sanctum_member_filth_milestones e join public.inner_sanctum_filth_milestones m on m.id=e.milestone_id where e.user_id='${user}' and m.title='Contribution test milestone'`),1);
    await assert.rejects(db.query("update public.contribution_submissions set admin_note='rewrite' where id=$1",[id]),/immutable/);
  });
  await t.test("decline records review but creates no Filth; private metadata never reaches owner",async()=>{
    await asUser(admin); await db.query("select public.admin_decline_contribution($1,'Private decline reason')",[declined]);
    const adminRows=(await db.query<Record<string,unknown>>("select * from public.admin_get_contributions('declined',$1)",[declined])).rows;
    assert.equal(adminRows[0].email,'other@test.example'); assert.equal(adminRows[0].admin_note,'Private decline reason');
    await asUser(other); const own=(await mine())[0]; assert.equal(own.status,'declined');
    for (const forbidden of ['admin_note','reviewed_by','user_id','email']) assert.equal(forbidden in own,false);
    assert.equal(JSON.stringify(own).includes('Private decline reason'),false);
    assert.equal((await progress()).filth_total,0);
    await asUser(user); const p=await progress();
    assert.equal(p.filth_total,50); assert.equal(p.accepted_contributions,1); assert.equal(p.filth_from_contributions,50);
    assert.equal((await mine())[0].paid_opportunity,true);
    await assert.rejects(db.exec("select * from public.get_my_filth_meter()"),{code:"42501"});
  });
  await t.test("failed event insert rolls acceptance back; positive award required",async()=>{
    await asUser(user); const submission=await submit("Rollback check"); await owner();
    await db.query("insert into public.inner_sanctum_filth_events(user_id,event_type,points,source_reference) values($1,'contribution',1,$2)",[user,'contribution:'+submission]);
    await asUser(admin);
    await assert.rejects(db.query("select public.admin_accept_contribution($1,0,false,null)",[submission]));
    await assert.rejects(db.query("select public.admin_accept_contribution($1,5,false,null)",[submission]),{code:"23505"});
    await owner(); assert.equal(await scalar(`select status from public.contribution_submissions where id='${submission}'`),'submitted');
  });
  await t.test("Affiliate impact and earnings isolate recipients; totals use stored status without maturity",async()=>{
    await owner();
    const fixture=async(recipient:string,amount:number,due:boolean)=>{
      await db.query("insert into public.affiliate_accounts(user_id) values($1) on conflict(user_id) do nothing",[recipient]);
      const account=await scalar(`select id from public.affiliate_accounts where user_id='${recipient}'`);
      await db.query("insert into public.inner_sanctum_referrals(user_id,code) values($1,$2) on conflict(user_id) do nothing",[recipient,randomUUID().replaceAll('-','')]);
      const referral=await scalar(`select id from public.inner_sanctum_referrals where user_id='${recipient}'`);
      const order=randomUUID(), conversion=randomUUID();
      const reference='FP-'+randomUUID().replaceAll('-','').slice(0,24).toUpperCase().match(/.{8}/g)!.join('-');
      await db.query("insert into public.store_orders(id,order_reference,request_key,user_id,buyer_email,currency,subtotal_amount,total_amount) values($1,$2,$3,$4,'private-buyer@example.test','USD',100,100)",[order,reference,randomUUID(),admin]);
      await db.query("insert into public.inner_sanctum_referral_conversions(id,referral_id,referrer_user_id,referred_user_id,order_id,order_reference,points_awarded,conversion_source) values($1,$2,$3,$4,$5,$6,2,'verified_payment')",[conversion,referral,recipient,admin,order,reference]);
      await db.query("insert into public.inner_sanctum_filth_events(user_id,event_type,points,source_reference) values($1,'referral',2,$2)",[recipient,'referral-conversion:'+conversion]);
      await db.query("insert into public.affiliate_commissions(conversion_id,affiliate_account_id,referrer_user_id,gross_amount,commissionable_amount,rule_type,rule_value,commission_amount,created_at,available_at) values($1,$2,$3,100,100,'fixed',$4,$4,now()-interval '30 days',now()+$5::interval)",[conversion,account,recipient,amount,due?'-1 day':'1 day']);
    };
    await fixture(user,10,true); await db.exec('select affiliate_private.mature_due_commissions()');
    await fixture(user,20,true); await fixture(user,30,false); await fixture(other,90,true);
    const before=(await db.query('select * from public.affiliate_commissions order by id')).rows;
    await asUser(user);
    const impact=(await db.query<Record<string,unknown>>('select * from public.get_my_affiliate_impact()')).rows[0];
    assert.equal(impact.successful_referrals,3); assert.equal(impact.filth_from_referrals,6);
    for (const entry of impact.recent_activity as Record<string,unknown>[]) assert.deepEqual(Object.keys(entry).sort(),['date','filth_awarded']);
    const earnings=(await db.query<Record<string,unknown>>('select * from public.get_my_affiliate_earnings()')).rows[0];
    assert.equal(Number(earnings.pending_total),50); assert.equal(Number(earnings.available_total),10);
    const history=earnings.commission_history as Record<string,unknown>[]; assert.equal(history.length,3);
    for (const entry of history) assert.deepEqual(Object.keys(entry).sort(),['available_at','commission_amount','created_at','id','matured_at','status']);
    await assert.rejects(db.exec('select * from public.affiliate_commissions'),{code:'42501'});
    await asUser(other); assert.equal(Number((await db.query<{pending_total:string}>('select * from public.get_my_affiliate_earnings()')).rows[0].pending_total),90);
    await owner(); assert.deepEqual((await db.query('select * from public.affiliate_commissions order by id')).rows,before);
  });
  await t.test("anonymous callers cannot submit or use self-service RPCs",async()=>{
    await owner(); await db.exec('set role anon');
    for (const sql of ["select public.submit_contribution('idea','title','description')",'select * from public.get_my_contributions()','select * from public.get_my_contribution_progress()','select * from public.get_my_affiliate_impact()','select * from public.get_my_affiliate_earnings()']) await assert.rejects(db.exec(sql),{code:'42501'});
    await owner();
  });
});
