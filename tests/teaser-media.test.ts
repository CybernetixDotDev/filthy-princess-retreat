import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types.ts";
import { changeTeaserImage } from "../lib/teaser-media-operations.ts";
import { validateTeaserImage, teaserMediaPublicUrl, TEASER_MEDIA_MAX_BYTES } from "../lib/teaser-media.ts";

const id = randomUUID();
const png = () => new File([new Uint8Array([137,80,78,71,13,10,26,10,0])], "photo.png", { type: "image/png" });
function fixture() {
  const state = { admin: true, signedIn: true, exists: true, uploadError: false, updateError: false, deleteError: false, conflict: false, ambiguousCommit: false,
    row: { image_1_path: null, image_2_path: null, image_3_path: null, title: "Unchanged" } as Record<string, string | null>,
    uploads: [] as string[], deletes: [] as string[], updates: [] as Record<string, unknown>[] };
  const client = {
    auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: "admin" } : null } }) },
    from(table: string) {
      let update: Record<string, string | null> | undefined;
      const query = {
        select() { return query; }, eq() { return query; }, is() { return query; },
        update(value: Record<string, string | null>) { update = value; return query; },
        async single() { return { data: state.exists ? { ...state.row } : null }; },
        async maybeSingle() {
          if (table === "admin_users") return { data: state.admin ? { user_id: "admin" } : null };
          if (update) {
            state.updates.push(update);
            if (state.conflict) return { data: null };
            if (!state.updateError || state.ambiguousCommit) Object.assign(state.row, update);
            return state.updateError ? { error: { message: "DB error" } } : { data: { id } };
          }
          return { data: null };
        },
      };
      return query;
    },
    storage: { from(bucket: string) {
      assert.equal(bucket, "teaser-media");
      return {
        async upload(path: string, _file: File, options: { upsert: boolean }) {
          assert.equal(options.upsert, false); state.uploads.push(path);
          return { error: state.uploadError ? { message: "Upload error" } : null };
        },
        async remove(paths: string[]) {
          state.deletes.push(...paths);
          return state.deleteError ? { error: { message: "Delete error" } } : { data: paths.map(name => ({ name })) };
        },
      };
    } },
  } as unknown as SupabaseClient<Database>;
  return { state, run: (file: File | null = png(), slot = 1, teaserId: string = id) => changeTeaserImage(client, teaserId, slot, file) };
}

test("teaser image validation and public URL", async () => {
  assert.equal(await validateTeaserImage(png()), "png");
  assert.equal(await validateTeaserImage(new File([new Uint8Array([255,216,255])], "x.JPEG", {type:"image/jpeg"})), "jpg");
  assert.equal(await validateTeaserImage(new File(["RIFF1234WEBP"], "x.webp", {type:"image/webp"})), "webp");
  for (const type of ["image/svg+xml", "image/gif", "video/mp4", "text/html", "application/octet-stream"]) {
    await assert.rejects(validateTeaserImage(new File(["invalid"], "x.png", {type})));
  }
  await assert.rejects(validateTeaserImage(new File([], "x.png", {type:"image/png"})));
  await assert.rejects(validateTeaserImage(new File(["invalid"], "x.png", {type:"image/png"})));
  await assert.rejects(validateTeaserImage(new File(["RIFF1234WEBP"], "x.png", {type:"image/webp"})));
  await assert.rejects(validateTeaserImage({ size: TEASER_MEDIA_MAX_BYTES + 1 } as File), /20 MiB/);
  const path = `${id}/${randomUUID()}-polaroid-1.png`;
  assert.equal(teaserMediaPublicUrl(path, "https://configured.example/"), `https://configured.example/storage/v1/object/public/teaser-media/${path}`);
  assert.equal(teaserMediaPublicUrl(null), null);
  assert.throws(() => teaserMediaPublicUrl("../bad", "https://configured.example"));
});
test("Admin upload, immutable replacement and removal affect only selected slot", async () => {
  const f = fixture();
  for (const slot of [1,2,3]) {
    assert.equal((await f.run(png(), slot)).ok, true);
    const first = f.state.row[`image_${slot}_path`];
    assert.match(first!, new RegExp(`^${id}/[a-f0-9-]{36}-polaroid-${slot}\\.png$`));
    assert.equal((await f.run(png(), slot)).ok, true);
    assert.notEqual(f.state.row[`image_${slot}_path`], first);
    assert.ok(f.state.deletes.includes(first!));
    assert.equal((await f.run(null, slot)).ok, true);
    assert.equal(f.state.row[`image_${slot}_path`], null);
  }
  assert.equal(new Set(f.state.uploads).size, 6);
  assert.equal(f.state.row.title, "Unchanged");
  assert.ok(f.state.updates.every(update => Object.keys(update).length === 1));
});
test("authorization, existence and target validation precede upload", async () => {
  for (const setting of ["admin", "signedIn", "exists"] as const) {
    const f = fixture(); f.state[setting] = false;
    assert.equal((await f.run()).ok, false); assert.equal(f.state.uploads.length, 0);
    assert.equal((await f.run(null)).ok, false);
  }
  for (const slot of [0,4,1.5,NaN]) { const f=fixture(); assert.equal((await f.run(png(),slot)).ok,false); assert.equal(f.state.uploads.length,0); }
  const f=fixture(); assert.equal((await f.run(png(),1,"../bad")).ok,false);
});
test("upload and DB failures preserve old reference; new orphan is cleaned", async () => {
  for (const mode of ["uploadError", "updateError", "conflict"] as const) {
    const f=fixture(); const old=`${id}/${randomUUID()}-polaroid-1.png`;
    f.state.row.image_1_path=old; f.state[mode]=true;
    assert.equal((await f.run()).ok,false); assert.equal(f.state.row.image_1_path,old);
    assert.deepEqual(f.state.deletes, mode === "uploadError" ? [] : f.state.uploads);
  }
});
test("cleanup failure never reverses successful replacement or removal", async () => {
  for (const file of [png(),null]) {
    const f=fixture(); f.state.row.image_1_path=`${id}/${randomUUID()}-polaroid-1.png`; f.state.deleteError=true;
    const result=await f.run(file); assert.equal(result.ok,true); assert.ok(result.cleanupWarning);
    assert.equal(f.state.row.image_1_path,file ? f.state.uploads[0] : null);
  }
  const f=fixture(); f.state.updateError=true; f.state.deleteError=true;
  assert.ok((await f.run()).cleanupWarning);
});
test("uncertain committed update never deletes the authoritative new image", async () => {
  const f=fixture(); f.state.updateError=true; f.state.ambiguousCommit=true;
  const result=await f.run(); assert.equal(result.ok,false); assert.ok(result.cleanupWarning);
  assert.equal(f.state.row.image_1_path,f.state.uploads[0]); assert.deepEqual(f.state.deletes,[]);
});
