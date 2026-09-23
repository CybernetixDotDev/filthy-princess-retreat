import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { safeNextPath } from "../lib/domain.ts";
test("canonical entitlement controls only default landing",async()=>{
 let member=false,calls=0;
 const exports:{authenticatedDestination?:(next?:string)=>Promise<string>}={};
 runInNewContext(ts.transpileModule(readFileSync("lib/auth-destination.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>name==="server-only"?{}:name==="@/lib/domain"?{safeNextPath}:{hasInnerSanctumAccess:async()=>{calls++;return member;}}});
 assert.equal(await exports.authenticatedDestination!(),"/contribute");member=true;assert.equal(await exports.authenticatedDestination!(),"/inner-sanctum");
 for(const path of ["/checkout/start?product=uuid","/checkout/reference","/claim/token","/invite/token"]){const before=calls;assert.equal(await exports.authenticatedDestination!(path),path);assert.equal(calls,before);}
 member=false;assert.equal(await exports.authenticatedDestination!("https://evil.example"),"/contribute");
});
test("Hub alias reuses existing Affiliate experience and shared membership-aware navigation",()=>{
 assert.match(readFileSync("app/contribute/page.tsx","utf8"),/contributor\/page/);
 const layout=readFileSync("app/contributor/layout.tsx","utf8");assert.match(layout,/requireContributorAuth/);assert.match(layout,/FilthyShell/);assert.doesNotMatch(layout,/affiliate_status/);
 assert.match(readFileSync("app/inner-sanctum/layout.tsx","utf8"),/FilthyShell/);
 assert.match(readFileSync("components/inner-sanctum-local-nav.tsx","utf8"),/href: "\/inner-sanctum\/tasks"/);
 assert.match(readFileSync("app/contributor/page.tsx","utf8"),/AffiliateActivation/);
 assert.match(readFileSync("app/actions/affiliate.ts","utf8"),/accept_current_affiliate_terms/);
});
