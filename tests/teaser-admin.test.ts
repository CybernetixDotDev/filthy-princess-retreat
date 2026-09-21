import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseTeaserForm } from "../lib/teasers.ts";
import { adminNavigation } from "../lib/admin-navigation.ts";
const require = createRequire(import.meta.url);
const id = "550e8400-e29b-41d4-a716-446655440000";
function form(visibility = "private", product = "") {
  const f = new FormData();
  for (const [k,v] of Object.entries({internal_name:" Campaign ",eyebrow:"",title:" Title ",body:" Body ",visibility,store_product_id:product})) f.set(k,v);
  return f;
}
test("content validation preserves ordering, trims blanks, excludes protected fields", () => {
  for (let n=0;n<=15;n++) { const f=form(); for(let i=0;i<n;i++) f.append("graffiti_lines",`Phrase ${i}`); assert.equal(parseTeaserForm(f).success,true); }
  const f=form("public"); for(const s of [" First "," ","Second"]) f.append("graffiti_lines",s);
  f.set("slug","injected"); f.set("status","draft"); f.set("published_at","injected"); f.set("image_1_path","injected");
  const parsed=parseTeaserForm(f); assert.ok(parsed.success);
  assert.deepEqual(parsed.data.graffiti_lines,["First","Second"]); assert.equal(parsed.data.internal_name,"Campaign");
  assert.equal(parsed.data.store_product_id,null); assert.equal(parsed.data.eyebrow,null);
  for(const k of ["slug","status","published_at","image_1_path"]) assert.equal(k in parsed.data,false);
  for(let i=0;i<16;i++) f.append("graffiti_lines","more"); assert.equal(parseTeaserForm(f).success,false);
  const long=form();long.append("graffiti_lines","x".repeat(201));assert.equal(parseTeaserForm(long).success,false);
});
function harness() {
  const h={admin:true,currentProduct:null as string|null,active:true,visibilityFails:false,updates:[] as Record<string,unknown>[],inserts:[] as Record<string,unknown>[],revalidated:[] as string[],media:[] as unknown[][]};
  const db={from(table:string) {
    let patch:Record<string,unknown>|undefined;
    const q={select(){return q;},eq(){return q;},insert(v:Record<string,unknown>){h.inserts.push(v);return q;},update(v:Record<string,unknown>){patch=v;h.updates.push(v);return q;},
      async single(){return {data:table==="teasers"&& !h.inserts.length ? {store_product_id:h.currentProduct} : {id}};},
      async maybeSingle(){return {data:table==="store_products" ? h.active ? {id}:null : patch?.visibility && h.visibilityFails ? null : {id}};}};return q;
  }};
  const exports:Record<string, (...args:unknown[])=>Promise<Record<string,unknown>>>={};
  const source=readFileSync(new URL("../app/admin/teasers/actions.ts",import.meta.url),"utf8");
  const mocks:Record<string,unknown>={
    "next/cache":{revalidatePath:(p:string)=>h.revalidated.push(p)},
    "next/navigation":{redirect:(p:string)=>{throw new Error(`REDIRECT:${p}`);}},
    "@/lib/auth":{requireAdmin:async()=>h.admin ? {supabase:db} : null},
    "@/lib/teasers":{parseTeaserForm},
    "@/lib/teaser-media-server":{uploadTeaserImage:async(...args:unknown[])=>{h.media.push(args);return {ok:true};},removeTeaserImage:async(...args:unknown[])=>{h.media.push(args);return {ok:true};}},
  };
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:(name:string)=>mocks[name]??require(name),File,FormData});
  return {...h,state:h,actions:exports};
}
test("Admin create uses draft defaults and redirects; Public selection is applied separately",async()=>{
  for(const visibility of ["private","public"]) {
    const h=harness();await assert.rejects(h.actions.saveTeaser(null,{},form(visibility)),new RegExp(`REDIRECT:/admin/teasers/${id}$`));
    assert.equal(h.inserts.length,1);assert.equal("status" in h.inserts[0],false);assert.equal("slug" in h.inserts[0],false);
    assert.equal("visibility" in h.inserts[0],false);assert.equal(h.updates.length,visibility==="public"?1:0);
  }
  const h=harness();h.state.visibilityFails=true;
  await assert.rejects(h.actions.saveTeaser(null,{},form("public")),/visibilityPending=1/);assert.equal(h.inserts.length,1);
});
test("Save preserves lifecycle and permits unchanged inactive product; changed product must be active",async()=>{
  const h=harness();h.state.currentProduct=id;h.state.active=false;
  assert.ok((await h.actions.saveTeaser(id,{},form("public",id))).message);
  assert.equal("status" in h.updates[0],false);assert.equal("published_at" in h.updates[0],false);
  const other=harness();other.state.active=false;
  assert.ok((await other.actions.saveTeaser(id,{},form("private",id))).error);assert.equal(other.updates.length,0);
});
test("nonadmins cannot mutate; media actions delegate slots to Cell 2",async()=>{
  const h=harness();h.state.admin=false;
  assert.ok((await h.actions.saveTeaser(null,{},form())).error);
  assert.ok((await h.actions.manageTeaserImage(id,1,{},new FormData())).error);assert.equal(h.inserts.length,0);
  h.state.admin=true;
  for(const slot of [1,2,3]) {const f=new FormData();f.set("intent","upload");f.set("image",new File(["image"],"x.png"));assert.ok((await h.actions.manageTeaserImage(id,slot,{},f)).message);}
  const f=new FormData();f.set("intent","remove");assert.ok((await h.actions.manageTeaserImage(id,2,{},f)).message);
  f.set("intent","upload");assert.ok((await h.actions.manageTeaserImage(id,1,{},f)).error);
  assert.equal(h.media.length,4);
});
test("navigation and route guards are present; editor shows inactive warning and previews",()=>{
  assert.ok(adminNavigation.find(g=>g.label==="Commerce")?.items.some(i=>i.href==="/admin/teasers"));
  for(const route of ["page.tsx","new/page.tsx","[id]/page.tsx"]) assert.match(readFileSync(new URL(`../app/admin/teasers/${route}`,import.meta.url),"utf8"),/await requireAdmin\(\)/);
  assert.match(readFileSync(new URL("../components/teaser-form.tsx",import.meta.url),"utf8"),/Linked product is no longer active/);
  assert.match(readFileSync(new URL("../components/teaser-image-controls.tsx",import.meta.url),"utf8"),/teaserMediaPublicUrl\(path\)/);
});
