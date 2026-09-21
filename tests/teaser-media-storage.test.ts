import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("teaser Storage migration and role policies", async t => {
  const db=new PGlite({extensions:{pgcrypto}}); t.after(()=>db.close());
  // Storage schema fixture: verifies SQL/RLS, not the hosted Storage HTTP service.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$
      select current_setting('test.storage_operation',true)=any(operations); $$;
    grant usage on schema auth,public,extensions,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    insert into storage.buckets values('inner-sanctum-media','inner-sanctum-media',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4']);`);
  for(const name of ["20260908080833_retreat_launch_foundation","20260911085538_store_foundation_membership_product","20260921085907_teaser_foundation","20260921090340_teaser_media_storage"])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8"));
  const bucket=(await db.query<Record<string,unknown>>("select * from storage.buckets where id='teaser-media'")).rows[0];
  assert.equal(bucket.public,true); assert.equal(Number(bucket.file_size_limit),20971520);
  assert.deepEqual(bucket.allowed_mime_types,["image/jpeg","image/png","image/webp"]);
  const other=(await db.query<Record<string,unknown>>("select * from storage.buckets where id='inner-sanctum-media'")).rows[0];
  assert.equal(other.public,false); assert.equal(Number(other.file_size_limit),20971520);
  assert.deepEqual(other.allowed_mime_types,["image/jpeg","image/png","image/webp","video/mp4"]);
  const admin=randomUUID(), member=randomUUID();
  await db.query("insert into auth.users values($1),($2)",[admin,member]);
  await db.query("insert into public.admin_users(user_id) values($1)",[admin]);
  const user=(id:string)=>db.exec(`reset role; select set_config('request.jwt.claims','{"sub":"${id}"}',false); set role authenticated;`);
  await user(admin);
  const id=(await db.query<{id:string}>("insert into public.teasers(internal_name,title,body) values('C','T','B') returning id")).rows[0].id;
  const upload=(path:string)=>db.query("insert into storage.objects(bucket_id,name) values('teaser-media',$1)",[path]);
  const paths=[] as string[];
  for(const extension of ["jpg","jpeg","png","webp"]) {
    const path=`${id}/${randomUUID()}-polaroid-1.${extension}`; paths.push(path); await upload(path);
    await db.query("update public.teasers set image_1_path=$1 where id=$2",[path,id]);
  }
  for(const path of [`${randomUUID()}/${randomUUID()}-polaroid-1.png`,`${id}/../bad.png`,`${id}/${randomUUID()}-polaroid-4.png`,`${id}/${randomUUID()}-polaroid-1.svg`]) await assert.rejects(upload(path),/row-level security/);
  await assert.rejects(upload(paths[0]),/unique constraint/);
  await db.exec("select set_config('test.storage_operation','object.list',false)");
  assert.equal((await db.query("select * from storage.objects")).rows.length,0);
  await db.exec("select set_config('test.storage_operation','object.delete_many',false)");
  assert.equal((await db.query("select * from storage.objects")).rows.length,4);
  assert.equal((await db.query("update storage.objects set name='bad' returning id")).rows.length,0);
  for(const role of [member,"anon"]) {
    if(role==="anon") await db.exec("reset role; set role anon"); else await user(role);
    await assert.rejects(upload(`${id}/${randomUUID()}-polaroid-2.png`),/row-level security/);
    assert.equal((await db.query("select * from storage.objects")).rows.length,0);
    assert.equal((await db.query("delete from storage.objects returning id")).rows.length,0);
  }
  await user(admin);
  assert.equal((await db.query("delete from storage.objects where name=$1 returning id",[paths[0]])).rows.length,1);
  // Images remain optional after widening the validator, including on publication.
  await db.query("update public.teasers set image_1_path=null,status='published' where id=$1",[id]);
});
