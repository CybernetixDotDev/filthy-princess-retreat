import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { safeNextPath } from "../lib/domain.ts";
const require=createRequire(import.meta.url);
function harness() {
  const h={calls:[] as Record<string,unknown>[],passwordCalls:0,exchanges:[] as string[],fail:false,throws:false,member:false};
  const client={auth:{
    async signInWithOAuth(args:Record<string,unknown>){h.calls.push(args);if(h.throws)throw Error("network");return {data:{url:"https://provider.example/authorize"},error:h.fail?{}:null};},
    async signInWithPassword(){h.passwordCalls++;return {error:null};},
    async exchangeCodeForSession(code:string){h.exchanges.push(code);if(h.throws)throw Error("network");return {error:h.fail?{}:null};},
  }};
  const mocks:Record<string,unknown>={"@/lib/auth-destination":{authenticatedDestination:async(next:string)=>safeNextPath(next, "") || (h.member ? "/inner-sanctum" : "/contribute")},"@/lib/supabase/server":{createClient:async()=>client},"@/lib/domain":{safeNextPath},"next/navigation":{redirect:(url:string)=>{throw Error(`REDIRECT:${url}`);}}};
  function load(path:string) {
    const exports:Record<string,(...args:unknown[])=>Promise<unknown>>={};
    runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>mocks[name]??require(name),URL,process:{env:{NEXT_PUBLIC_SITE_URL:"http://localhost:3000"}}});
    return exports;
  }
  return {h,actions:load("app/actions/auth.ts"),callback:load("app/auth/callback/route.ts").GET};
}
const paths=["/inner-sanctum","/checkout/start?product=550e8400-e29b-41d4-a716-446655440000","/checkout/FP-REFERENCE","/claim/secret","/invite/example","/contribute"];
test("Google uses Supabase OAuth and preserves existing destinations without referral metadata",async()=>{
  const {h,actions}=harness();
  for(const next of paths){const form=new FormData();form.set("next",next);await assert.rejects(actions.signInWithGoogle({},form),/REDIRECT:https:\/\/provider.example/);const call=h.calls.at(-1)!;assert.equal(call.provider,"google");const options=call.options as {redirectTo:string;skipBrowserRedirect:boolean};const url=new URL(options.redirectTo);assert.equal(url.origin,"http://localhost:3000");assert.equal(url.pathname,"/auth/callback");assert.equal(url.searchParams.get("next"),next);assert.equal(options.skipBrowserRedirect,true);assert.deepEqual(Object.keys(call).sort(),["options","provider"]);}
  const bad=new FormData();bad.set("next","https://evil.example");await assert.rejects(actions.signInWithGoogle({},bad),/REDIRECT/);assert.equal(new URL((h.calls.at(-1)!.options as {redirectTo:string}).redirectTo).searchParams.get("next"),"");
});
test("OAuth initiation failure is actionable; email password action still authenticates and redirects",async()=>{
  const {h,actions}=harness();h.fail=true;assert.ok((await actions.signInWithGoogle({},new FormData()) as {error:string}).error);
  h.throws=true;assert.ok((await actions.signInWithGoogle({},new FormData()) as {error:string}).error);
  const form=new FormData();form.set("email","person@example.com");form.set("password","password");form.set("next",paths[1]);await assert.rejects(actions.signIn({},form),/REDIRECT:\/checkout\/start/);assert.equal(h.passwordCalls,1);
});
test("callback exchanges code and returns to intended path; failures safely return to signin",async()=>{
  const {h,callback}=harness();
  for(const next of paths){const url=new URL("http://localhost:3000/auth/callback");url.searchParams.set("code","auth-code");url.searchParams.set("next",next);const response=await callback({url:url.toString(),nextUrl:url}) as Response;assert.equal(response.headers.get("location"),new URL(next,url).toString());assert.equal(response.headers.get("cache-control"),"no-store");}
  assert.equal(h.exchanges.length,paths.length);
  for(const mode of ["denied","missing","exchange-error","network"]){h.fail=mode==="exchange-error";h.throws=mode==="network";const url=new URL("http://localhost:3000/auth/callback");url.searchParams.set("next",paths[1]);if(mode!=="missing")url.searchParams.set("code","code");if(mode==="denied")url.searchParams.set("error","access_denied");const response=await callback({url:url.toString(),nextUrl:url}) as Response;const location=new URL(response.headers.get("location")!);assert.equal(location.pathname,"/signin");assert.equal(location.searchParams.get("authError"),"callback");assert.equal(location.searchParams.get("next"),paths[1]);}
});

test("OAuth without explicit next resolves entitlement after exchange",async()=>{
  const {h,callback}=harness();
  for(const member of [false,true]){h.member=member;const url=new URL("http://localhost:3000/auth/callback?code=code");const response=await callback({url:url.toString(),nextUrl:url}) as Response;assert.equal(new URL(response.headers.get("location")!).pathname,member?"/inner-sanctum":"/contribute");}
});
