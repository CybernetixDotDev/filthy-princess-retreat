import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("Cell 5 safe public teaser snapshot", async t => {
  const db=new PGlite({extensions:{pgcrypto}}); t.after(()=>db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; $$;
    grant usage on schema auth,public,extensions to anon,authenticated,service_role;`);
  const migrate=async(name:string)=>db.exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8"));
  for(const name of ["20260908080833_retreat_launch_foundation","20260911081131_inner_sanctum_membership_foundation","20260911085538_store_foundation_membership_product","20260911094905_store_claim_fulfillment_foundation","20260911145238_referral_filth_meter_foundation","20260921085907_teaser_foundation"])await migrate(name);
  const functions=()=>db.query("select p.oid,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname<>'get_published_teaser_by_slug' order by p.oid");
  const before=(await functions()).rows;
  const grants=(await db.query("select relacl from pg_class where oid='public.teasers'::regclass")).rows;
  const policies=(await db.query("select * from pg_policies where tablename='teasers'")).rows;
  await migrate("20260921093723_teaser_public_read");
  assert.deepEqual((await functions()).rows,before); // Store/referral functions and all other public functions untouched.
  assert.deepEqual((await db.query("select relacl from pg_class where oid='public.teasers'::regclass")).rows,grants);
  assert.deepEqual((await db.query("select * from pg_policies where tablename='teasers'")).rows,policies);
  const admin=randomUUID(),member=randomUUID();
  await db.query("insert into auth.users(id) values($1),($2)",[admin,member]);await db.query("insert into public.admin_users(user_id) values($1)",[admin]);
  const product=(await db.query<{id:string}>("select id from public.store_products limit 1")).rows[0].id;
  const owner=()=>db.exec("reset role;select set_config('request.jwt.claims','{}',false)");
  const user=(id:string)=>db.exec(`reset role;select set_config('request.jwt.claims','{"sub":"${id}"}',false);set role authenticated`);
  const anon=async()=>{await owner();await db.exec("set role anon");};
  const lookup=async(slug:string|null)=>(await db.query<Record<string,unknown>>("select * from public.get_published_teaser_by_slug($1)",[slug])).rows;
  await user(admin);
  const row=(await db.query<{id:string;slug:string}>("insert into public.teasers(internal_name,title,body,graffiti_lines,store_product_id) values('Secret campaign','Hero','Body',array['Second','First'],$1) returning id,slug",[product])).rows[0];
  const image=`${row.id}/${randomUUID()}-polaroid-1.webp`;
  await db.query("update public.teasers set image_1_path=$1 where id=$2",[image,row.id]);
  await t.test("drafts never return in either visibility",async()=>{
    for(const visibility of ["private","public"]) {
      await user(admin);await db.query("update public.teasers set visibility=$1 where id=$2",[visibility,row.id]);await anon();assert.deepEqual(await lookup(row.slug),[]);
    }
  });
  await t.test("published private/public return to anon and ordinary authenticated callers with exact projection",async()=>{
    const expected=["id","slug","eyebrow","title","body","graffiti_lines","image_1_path","image_2_path","image_3_path","visibility","store_product_id","store_product_active","published_at"].sort();
    for(const visibility of ["private","public"]) {
      await user(admin);await db.query("update public.teasers set status='published',visibility=$1 where id=$2",[visibility,row.id]);
      for(const role of ["anon","member"]) {
        if(role==="anon")await anon();else await user(member);
        const data=await lookup(row.slug);assert.equal(data.length,1);assert.deepEqual(Object.keys(data[0]).sort(),expected);
        assert.equal(data[0].visibility,visibility);assert.deepEqual(data[0].graffiti_lines,["Second","First"]);
        assert.equal(data[0].image_1_path,image);assert.equal(data[0].image_2_path,null);assert.equal(data[0].image_3_path,null);
        assert.equal(data[0].store_product_id,product);assert.equal(data[0].store_product_active,true);assert.ok(data[0].published_at);
      }
    }
  });
  await t.test("invalid and unknown exact slugs return no result; no raw access",async()=>{
    await anon();
    for(const slug of [null,"","abc",row.slug.toUpperCase(),"../"+row.slug,"' OR true --",randomUUID(),"f".repeat(48),row.slug+"\n"," "+row.slug])assert.deepEqual(await lookup(slug),[]);
    await assert.rejects(db.query("select * from public.teasers"),/permission denied/);
    await assert.rejects(db.query("update public.teasers set status='published'"),/permission denied/);
    await user(member);assert.equal((await db.query("select * from public.teasers")).rows.length,0);
  });
  await t.test("inactive destination changes availability only; null destination remains renderable",async()=>{
    for(const status of ["draft","archived"]) {
      await owner();await db.query("update public.store_products set status=$1 where id=$2",[status,product]);
      await anon();const data=await lookup(row.slug);assert.equal(data.length,1);assert.equal(data[0].store_product_active,false);
      await user(admin);assert.equal((await db.query<{status:string}>("select status from public.teasers where id=$1",[row.id])).rows[0].status,"published");
    }
    await db.query("update public.teasers set store_product_id=null where id=$1",[row.id]);await anon();const data=await lookup(row.slug);assert.equal(data[0].store_product_id,null);assert.equal(data[0].store_product_active,false);
  });
  await t.test("return to draft hides historical publication immediately; republish reuses slug/time",async()=>{
    await anon();const first=(await lookup(row.slug))[0].published_at;
    await user(admin);await db.query("update public.teasers set status='draft' where id=$1",[row.id]);await anon();assert.deepEqual(await lookup(row.slug),[]);
    await user(admin);await db.query("update public.teasers set status='published' where id=$1",[row.id]);await anon();const data=(await lookup(row.slug))[0];assert.deepEqual(data.published_at,first);assert.equal(data.slug,row.slug);
  });
  await owner();
  const fn=(await db.query<{prosecdef:boolean;provolatile:string;proconfig:string[]}>("select prosecdef,provolatile,proconfig from pg_proc where oid='public.get_published_teaser_by_slug(text)'::regprocedure")).rows[0];
  assert.equal(fn.prosecdef,true);assert.equal(fn.provolatile,"s");assert.ok(fn.proconfig.some(v=>v.startsWith('search_path=')));
  assert.equal((await db.query("select 1 from pg_proc where proname='list_public_teasers'")).rows.length,0);
});
