/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
function harness() {
  const h = { user: { email: "person@example.test", identities: [{ provider: "email" }], app_metadata: { providers: ["email"] } } as any,
    amr: [{ method: "password" }] as unknown, verified: false, error: null as any, claimsError: false,
    resetCalls: [] as any[], updates: [] as any[], member: false };
  const client = { auth: {
    async getUser() { h.verified = true; return { data: { user: h.user }, error: null }; },
    async getClaims() { return { data: { claims: { amr: h.amr } }, error: h.claimsError ? {} : null }; },
    async resetPasswordForEmail(...args: any[]) { h.resetCalls.push(args); return { error: h.error }; },
    async updateUser(args: any) { assert.ok(h.verified); assert.ok(h.user); h.updates.push(args); return { error: h.error }; },
    async signInWithPassword() { return { error: h.error }; },
    async exchangeCodeForSession() { return { error: h.error }; },
  } };
  const mocks: Record<string, any> = {
    "server-only": {}, "@/lib/supabase/server": { createClient: async () => client },
    "next/navigation": { redirect: (url: string) => { throw Error(`REDIRECT:${url}`); } },
    "@/components/password-change-form": { PasswordChangeForm: "PasswordChangeForm" },
    "@/lib/contributor-auth": { requireContributorAuth: async () => ({ user: h.user }) },
    "@/lib/inner-sanctum": { hasInnerSanctumAccess: async () => h.member },
    "@/lib/inner-sanctum-you": { getInnerSanctumYouState: async () => { throw Error("Membership data must not load for non-members"); } },
    "@/components/filth-meter": { FilthMeter: "FilthMeter" },
    "@/components/filthy-shell": { FilthyShell: ({ children }: { children: unknown }) => children },
    "@/components/inner-sanctum-local-nav": { InnerSanctumLocalNav: "InnerSanctumLocalNav" },
  };
  function load(path: string): any {
    const exports = {};
    runInNewContext(ts.transpileModule(readFileSync(path,"utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    }}).outputText, { exports, URL, process: { env: { NEXT_PUBLIC_SITE_URL: "https://private.example" } },
      require: (name: string) => {
        if (name.endsWith(".css")) return {};
        if (name in mocks) return mocks[name];
        if (name.startsWith("@/")) return mocks[name] = load(`${name.slice(2)}.ts`);
        return require(name);
      } });
    return exports;
  }
  return { h, load, actions: load("app/actions/auth.ts") };
}
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function fields(password = "password", confirmation = password) {
  const data = new FormData(); data.set("email", "person@example.test"); data.set("password",password); data.set("confirm_password",confirmation); return data;
}
test("You rejects unauthenticated visitors and permits a verified non-member", async () => {
  const { h, load } = harness(); const page = load("app/you/page.tsx").default;
  const tree = await page(); assert.ok(h.verified);
  assert.ok(nodes(tree).some(node => node.type === "PasswordChangeForm"));
  assert.ok(nodes(tree).some(node => node.props?.className === "account-page"));
  h.user = null;
  await assert.rejects(page(), { message: "REDIRECT:/signin?returnTo=/you" });
});
test("provider and verified password evidence are required for account controls", async () => {
  const { h, load } = harness(); const page = load("app/you/page.tsx").default;
  for (const mode of ["google", "missing-identities", "otp", "claims-error"]) {
    h.user = { email: "person@example.test", identities: mode === "missing-identities" ? [] : [{ provider: mode === "google" ? "google" : "email" }], app_metadata: { providers: [mode === "google" ? "google" : "email"] } };
    h.amr = mode === "otp" ? [{ method: "otp" }] : [{ method: "password" }]; h.claimsError = mode === "claims-error";
    assert.ok(!nodes(await page()).some(node => node.type === "PasswordChangeForm"), mode);
  }
});
test("contribution navigation exposes You independently of membership; membership You remains gated", async () => {
  const { h, load } = harness(); const layout = load("app/contributor/layout.tsx").default;
  for (const member of [false,true]) {
    h.member = member; const tree = nodes(await layout({ children: null }));
    assert.ok(tree.some(node => node.type === "FilthyShell" || node.type === "InnerSanctumLocalNav" || node.props?.className === "contributor-shell"));
    assert.equal(tree.some(node => node.props?.href === "/inner-sanctum"), false);
  }
  h.member = false;
  const boundary = await load("app/inner-sanctum/you/page.tsx").default();
  assert.ok(nodes(boundary).some(node => node.props?.children === "Inner Sanctum membership is required to enter."));
});
test("reset request uses native recovery and existing callback returns to update-password", async () => {
  const { h, load, actions } = harness();
  const result = await actions.requestPasswordReset({},fields()); assert.match(result.message,/If an account/);
  const [email, options] = h.resetCalls[0]; assert.equal(email,"person@example.test");
  const nextUrl = new URL(options.redirectTo); assert.equal(nextUrl.origin,"https://private.example");
  assert.equal(nextUrl.pathname,"/auth/callback"); assert.equal(nextUrl.searchParams.get("returnTo"),"/update-password");
  nextUrl.searchParams.set("code","recovery-code");
  const response = await load("app/auth/callback/route.ts").GET({ url: nextUrl.toString(), nextUrl });
  assert.equal(response.headers.get("location"),"https://private.example/update-password");
});
test("recovery page shows form only for a verified email identity", async () => {
  const { h, load } = harness(); const page=load("app/update-password/page.tsx").default;
  assert.ok(nodes(await page()).some(node=>node.type==="PasswordChangeForm"));
  h.user=null; assert.ok(!nodes(await page()).some(node=>node.type==="PasswordChangeForm"));
  h.user={identities:[{provider:"google"}]}; assert.ok(!nodes(await page()).some(node=>node.type==="PasswordChangeForm"));
});
test("password update verifies user, validates matching signup-length passwords and never updates Google-only accounts", async () => {
  const { h, actions }=harness();
  for (const data of [fields("short"),fields("password","different")]) assert.ok((await actions.updatePassword({},data)).error);
  assert.equal(h.updates.length,0);
  h.user=null; assert.match((await actions.updatePassword({},fields())).error,/session has expired/);
  h.user={identities:[{provider:"google"}]}; assert.match((await actions.updatePassword({},fields())).error,/linked sign-in provider/);
  assert.equal(h.updates.length,0);
  h.user={identities:[{provider:"email"}]}; assert.match((await actions.updatePassword({},fields())).message,/updated/);
  assert.equal(h.updates[0].password,"password"); assert.deepEqual(Object.keys(h.updates[0]),["password"]);
});
test("unconfirmed email has useful messaging; other errors stay generic", async () => {
  const {h,actions}=harness(); h.error={code:"email_not_confirmed",message:"internal"};
  assert.match((await actions.signIn({},fields())).error,/confirm your email address/);
  h.error={code:"invalid_credentials",message:"internal"}; assert.equal((await actions.signIn({},fields())).error,"The email or password is incorrect.");
});
test("reset and password update failures do not expose provider errors", async () => {
  const {h,actions}=harness(); const invalid=fields(); invalid.set("email","bad");
  assert.ok((await actions.requestPasswordReset({},invalid)).error); assert.equal(h.resetCalls.length,0);
  h.error={message:"private internal error"};
  assert.doesNotMatch((await actions.requestPasswordReset({},fields())).error,/private internal/);
  assert.doesNotMatch((await actions.updatePassword({},fields())).error,/private internal/);
});
