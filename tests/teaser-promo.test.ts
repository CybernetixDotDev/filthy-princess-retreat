import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { parseTeaserForm } from "../lib/teasers.ts";

test("Promo migration preserves Store history, rejects contradictions and extends safe lookup",async t=>{
 const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; $$;
 grant usage on schema auth,public,extensions to anon,authenticated;`);
 const migrate=async(name:string)=>db.exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8"));
 for(const name of ["20260908080833_retreat_launch_foundation","20260911085538_store_foundation_membership_product","20260921085907_teaser_foundation","20260921093723_teaser_public_read"])await migrate(name);
 const admin=randomUUID();await db.query("insert into auth.users values($1)",[admin]);await db.query("insert into public.admin_users(user_id) values($1)",[admin]);
 const asAdmin=()=>db.exec(`reset role;select set_config('request.jwt.claims','{"sub":"${admin}"}',false);set role authenticated`);
 await asAdmin();const old=(await db.query<Record<string,unknown>>("insert into public.teasers(internal_name,title,body,store_product_id) select 'Campaign','Title','Body',id from public.store_products limit 1 returning *")).rows[0];
 const before=(await db.query<Record<string,unknown>>("update public.teasers set status='published' where id=$1 returning *",[old.id])).rows[0];
 await db.exec("reset role");await migrate("20260921113633_teaser_promo_destination");await asAdmin();
 const after=(await db.query<Record<string,unknown>>("select * from public.teasers where id=$1",[old.id])).rows[0];
 assert.equal(after.destination_type,"store");assert.equal(after.promo_destination,null);
 for(const key of Object.keys(before))assert.deepEqual(after[key],before[key]);
 for(const values of ["'store','contribute',null","'promo',null,null","'event',null,null",`'promo','contribute','${old.store_product_id}'`,"'promo','https://bad.example',null"])
 await assert.rejects(db.query(`insert into public.teasers(internal_name,title,body,destination_type,promo_destination,store_product_id) values('C','T','B',${values})`),/check constraint/);
 const promo=(await db.query<{id:string;slug:string}>("insert into public.teasers(internal_name,title,body,destination_type,promo_destination) values('Promo','Contribute','Join in','promo','contribute') returning id,slug")).rows[0];
 await db.query("update public.teasers set status='published' where id=$1",[promo.id]);
 await db.exec("reset role;set role anon");
 for(const slug of [old.slug,promo.slug]){
 const row=(await db.query<Record<string,unknown>>("select * from public.get_published_teaser_by_slug($1)",[slug])).rows[0];assert.ok(row);assert.equal('internal_name' in row,false);
 if(slug===promo.slug){assert.equal(row.destination_type,"promo");assert.equal(row.promo_destination,"contribute");assert.equal(row.store_product_id,null);assert.equal(row.store_product_active,false);}
 else {assert.equal(row.destination_type,"store");assert.equal(row.store_product_active,true);}
 }
 await assert.rejects(db.query("select * from public.teasers"),/permission denied/);
});
test("Promo form creates controlled destination and removes contradictory Store selection",()=>{
 const form=new FormData();for(const [k,v]of Object.entries({internal_name:"Promo",title:"Title",body:"Body",visibility:"private",destination_type:"promo",promo_destination:"contribute",store_product_id:randomUUID()}))form.set(k,v);
 const result=parseTeaserForm(form);assert.ok(result.success);assert.equal(result.data.store_product_id,null);assert.equal(result.data.promo_destination,"contribute");
 form.set("promo_destination","https://arbitrary.example");assert.equal(parseTeaserForm(form).success,false);
 form.set("destination_type","event");assert.equal(parseTeaserForm(form).success,false);
});
