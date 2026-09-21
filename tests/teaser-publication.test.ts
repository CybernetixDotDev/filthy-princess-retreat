import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { TeaserRow } from "../lib/database.types.ts";
import { teaserReadiness } from "../lib/teaser-publication.ts";
import { teaserPromoUrl } from "../lib/teaser-promo-url.ts";
const require=createRequire(import.meta.url);
const id="550e8400-e29b-41d4-a716-446655440000";
const teaser:TeaserRow={id,internal_name:"Campaign",eyebrow:null,title:"Title",body:"Body",graffiti_lines:[],image_1_path:null,image_2_path:null,image_3_path:null,store_product_id:id,slug:"a".repeat(48),status:"draft",visibility:"private",created_by:id,created_at:"2026-09-21T00:00:00Z",updated_at:"2026-09-21T00:00:00Z",published_at:null};
test("readiness permits optional images/eyebrow/graffiti, requires valid content and active product",()=>{
  for(const visibility of ["private","public"] as const) assert.equal(teaserReadiness({...teaser,visibility},{id,status:"active"}).ready,true);
  for(const product of [null,{id,status:"draft"},{id,status:"archived"},{id:"wrong",status:"active"}]) assert.equal(teaserReadiness(teaser,product).ready,false);
  for(const patch of [{store_product_id:null},{title:" "},{body:" "},{internal_name:""},{graffiti_lines:[""]},{graffiti_lines:Array(16).fill("phrase")},{graffiti_lines:["x".repeat(201)]}]) assert.equal(teaserReadiness({...teaser,...patch},{id,status:"active"}).ready,false);
});
test("Promo URL requires explicit valid origin, normalizes it and remains stable",()=>{
  assert.equal(teaserPromoUrl(teaser.slug," HTTPS://MARKETING.EXAMPLE:443/ "),`https://marketing.example/t/${teaser.slug}`);
  assert.equal(teaserPromoUrl(teaser.slug,"http://localhost:3001"),`http://localhost:3001/t/${teaser.slug}`);
  for(const origin of ["","bad","ftp://example.com","https://example.com/path","https://user:pass@example.com","https://example.com/?x=1","https://example.com/#x"]) assert.throws(()=>teaserPromoUrl(teaser.slug,origin),/FILTHY_PRINCESS_PUBLIC_SITE_URL/);
  assert.throws(()=>teaserPromoUrl("bad","https://example.com"),/slug/);
  const previous=process.env.FILTHY_PRINCESS_PUBLIC_SITE_URL;
  try { delete process.env.FILTHY_PRINCESS_PUBLIC_SITE_URL; assert.throws(()=>teaserPromoUrl(teaser.slug),/FILTHY_PRINCESS_PUBLIC_SITE_URL/); process.env.FILTHY_PRINCESS_PUBLIC_SITE_URL="https://configured.example"; assert.match(teaserPromoUrl(teaser.slug),/^https:\/\/configured.example\/t\//); }
  finally { if(previous===undefined) delete process.env.FILTHY_PRINCESS_PUBLIC_SITE_URL;else process.env.FILTHY_PRINCESS_PUBLIC_SITE_URL=previous; }
});
function harness() {
  const h={admin:true,teaser:{...teaser},product:{id,status:"active"},conflict:false,patches:[] as Record<string,unknown>[],filters:[] as unknown[][]};
  const db={from(table:string) {const q={select(){return q;},eq(...args:unknown[]){h.filters.push(args);return q;},update(patch:Record<string,unknown>){h.patches.push(patch);return q;},async single(){return {data:h.teaser};},async maybeSingle(){return {data:table==="store_products"?h.product:h.conflict?null:{id}};}};return q;}};
  const exports:Record<string,(...args:unknown[])=>Promise<Record<string,unknown>>>={};
  const mocks:Record<string,unknown>={"next/cache":{revalidatePath(){}},"@/lib/auth":{requireAdmin:async()=>h.admin?{supabase:db}:null},"@/lib/teaser-publication":{teaserReadiness}};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../app/admin/teasers/publication-actions.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>mocks[name]??require(name)});
  return {h,run:(status:string)=>{const form=new FormData();form.set("status",status);form.set("store_product_id",id);return exports.changeTeaserPublication(id,{},form);}};
}
test("publish reloads canonical state, changes only status and checks concurrent edits",async()=>{
  const {h,run}=harness(); assert.ok((await run("published")).message);
  assert.equal(Object.keys(h.patches[0]).join(),"status");assert.equal(h.patches[0].status,"published");
  assert.ok(h.filters.some(f=>f[0]==="updated_at"&&f[1]===teaser.updated_at));
  h.conflict=true;assert.ok((await run("published")).error);
});
test("missing/inactive destination and nonadmins cannot publish",async()=>{
  for(const mode of ["missing","inactive","nonadmin"]) {
    const {h,run}=harness();if(mode==="missing")h.teaser.store_product_id=null;if(mode==="inactive")h.product.status="archived";if(mode==="nonadmin")h.admin=false;
    assert.ok((await run("published")).error);assert.equal(h.patches.length,0);
  }
});
test("Return to Draft works with inactive product and preserves historical fields",async()=>{
  const {h,run}=harness();h.teaser.status="published";h.teaser.published_at="2026-09-20T00:00:00Z";h.product.status="archived";
  assert.ok((await run("draft")).message);assert.equal(Object.keys(h.patches[0]).join(),"status");
  h.teaser.status="draft";assert.ok((await run("published")).error);
  h.product.status="active";assert.ok((await run("published")).message);
  assert.equal(h.teaser.slug,teaser.slug);assert.equal(h.teaser.published_at,"2026-09-20T00:00:00Z");
});
test("preview is guarded, read-only, and no public renderer is introduced",()=>{
  const preview=readFileSync(new URL("../app/admin/teasers/[id]/preview/page.tsx",import.meta.url),"utf8");
  assert.match(preview,/await requireAdmin\(\)/);assert.doesNotMatch(preview,/\.(update|insert|rpc)\(/);assert.match(preview,/Back to editor/);
  const editor=readFileSync(new URL("../app/admin/teasers/[id]/page.tsx",import.meta.url),"utf8");
  assert.match(editor,/Private \/ Unlisted/);assert.match(editor,/Public \/ Discoverable/);assert.match(editor,/This teaser remains published/);
  assert.equal(existsSync(new URL("../app/t/[slug]/page.tsx",import.meta.url)),false);
  for(const source of [preview,editor,readFileSync(new URL("../components/teaser-publication-controls.tsx",import.meta.url),"utf8")])assert.doesNotMatch(source,/filthyprincesss\.com/);
});
