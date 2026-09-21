import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("Teaser Cell 1 database foundation", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key, email text, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid; $$;
    grant usage on schema auth, public, extensions to anon, authenticated, service_role;`);
  const migrate = async (name: string) => db.exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  await migrate("20260908080833_retreat_launch_foundation");
  await migrate("20260911085538_store_foundation_membership_product");
  const storeBefore = (await db.query<Record<string, unknown>>("select * from public.store_products order by id")).rows;
  const functionsBefore = (await db.query("select pg_get_functiondef(oid) from pg_proc where proname in ('create_public_store_order','get_public_store_order') order by oid")).rows;
  await migrate("20260921085907_teaser_foundation");
  const admin = randomUUID(), member = randomUUID();
  const owner = () => db.exec("reset role; select set_config('request.jwt.claims', '{}', false)");
  const asUser = (id: string) => db.exec(`reset role; select set_config('request.jwt.claims', '{"sub":"${id}"}', false); set role authenticated`);
  await db.query("insert into auth.users(id) values ($1),($2)", [admin, member]);
  await db.query("insert into public.admin_users(user_id) values ($1)", [admin]);
  const create = () => db.query<Record<string, unknown>>("insert into public.teasers(internal_name,title,body) values ('Campaign','Title','Body') returning *");
  await asUser(admin);
  const first = (await create()).rows[0];
  const id = first.id as string;
  const update = (set: string, args: unknown[] = []) => db.query<Record<string, unknown>>(`update public.teasers set ${set} where id='${id}' returning *`, args);
  await t.test("admin creation generates identity and safe defaults", async () => {
    assert.equal(first.status, "draft"); assert.equal(first.visibility, "private");
    assert.equal(first.created_by, admin); assert.equal(first.published_at, null);
    assert.deepEqual(first.graffiti_lines, []);
    assert.equal(first.image_1_path, null); assert.equal(first.store_product_id, null);
    assert.match(first.slug as string, /^[a-f0-9]{48}$/);
    assert.notEqual((await create()).rows[0].slug, first.slug);
    for (const column of ["slug", "created_by", "id", "status", "visibility", "published_at", "created_at"]) {
      await assert.rejects(db.query(`insert into public.teasers(internal_name,title,body,${column}) values ('C','T','B',default)`), /permission denied/);
    }
  });
  await t.test("RLS and grants exclude nonadmins and anonymous callers", async () => {
    await asUser(member);
    await assert.rejects(create(), /admin_required|row-level security/);
    assert.equal((await db.query("select * from public.teasers")).rows.length, 0);
    assert.equal((await update("title='Unauthorized'")).rows.length, 0);
    await assert.rejects(db.query("delete from public.teasers"), /permission denied/);
    await owner(); await db.exec("set role anon");
    await assert.rejects(db.query("select * from public.teasers"), /permission denied/);
    await assert.rejects(create(), /permission denied/);
    await asUser(admin);
  });
  await t.test("copy and graffiti limits reject malformed values", async () => {
    for (let n = 0; n <= 15; n++) await update("graffiti_lines=$1", [Array.from({ length: n }, (_, i) => `Phrase ${i}`)]);
    for (const lines of [Array(16).fill("Phrase"), [""], [" \n\t"], [" padded"], ["x".repeat(201)], [null], [["nested"]]]) {
      await assert.rejects(update("graffiti_lines=$1", [lines]), /check constraint/);
    }
    await assert.rejects(update("graffiti_lines=null"), /not-null constraint/);
    for (const [column, max] of [["internal_name", 200], ["title", 200], ["body", 12000], ["eyebrow", 100]] as const) {
      for (const value of ["", "\t\n", " padded ", "x".repeat(max + 1)]) await assert.rejects(update(`${column}=$1`, [value]), /check constraint/);
      await update(`${column}=$1`, ["x".repeat(max)]);
    }
    await update("eyebrow=null,graffiti_lines='{}'");
  });
  await t.test("optional image paths and Store foreign key", async () => {
    for (const slot of [1, 2, 3]) {
      await update(`image_${slot}_path=$1`, [`${id}/${randomUUID()}-polaroid-${slot}.webp`]);
      for (const path of ["https://example.com/image.webp", "../image.webp", `${id}/../image.webp`, `${randomUUID()}/${randomUUID()}-polaroid-${slot}.webp`]) {
        await assert.rejects(update(`image_${slot}_path=$1`, [path]), /check constraint/);
      }
      await update(`image_${slot}_path=null`);
    }
    const product = storeBefore[0].id;
    await update("store_product_id=$1", [product]);
    await assert.rejects(update("store_product_id=$1", [randomUUID()]), /foreign key constraint/);
    await owner();
    await assert.rejects(db.query("delete from public.store_products where id=$1", [product]), /foreign key constraint/);
    await asUser(admin); await update("store_product_id=null");
  });
  await t.test("first publication is database-managed and preserved", async () => {
    const published = (await update("status='published',visibility='public'")).rows[0];
    assert.ok(published.published_at);
    assert.deepEqual(published.published_at, published.updated_at);
    for (const status of ["draft", "published"]) {
      const row = (await update("status=$1", [status])).rows[0];
      assert.deepEqual(row.published_at, published.published_at);
      assert.deepEqual(row.created_at, first.created_at);
    }
    await asUser(member);
    assert.equal((await db.query("select * from public.teasers")).rows.length, 0);
    await asUser(admin);
  });
  await t.test("identity and audit columns protected by grants and trigger", async () => {
    const changes = ["slug=repeat('a',48)", `created_by='${member}'`, "created_by=null", "created_at=now()+interval '1 day'", "published_at=null", "id=gen_random_uuid()", "updated_at=now()"];
    for (const change of changes) await assert.rejects(update(change), /permission denied/);
    await owner();
    for (const change of changes.slice(0, -1)) await assert.rejects(update(change), /immutable|managed/);
    await db.query("delete from auth.users where id=$1", [admin]);
    const row = (await db.query<Record<string, unknown>>("select * from public.teasers where id=$1", [id])).rows[0];
    assert.equal(row.created_by, null); assert.equal(row.slug, first.slug);
    assert.deepEqual(row.created_at, first.created_at); assert.ok(row.published_at);
  });
  await t.test("existing Store catalog and order operations remain unchanged", async () => {
    assert.deepEqual((await db.query<Record<string, unknown>>("select * from public.store_products order by id")).rows, storeBefore);
    assert.deepEqual((await db.query("select pg_get_functiondef(oid) from pg_proc where proname in ('create_public_store_order','get_public_store_order') order by oid")).rows, functionsBefore);
  });
});
