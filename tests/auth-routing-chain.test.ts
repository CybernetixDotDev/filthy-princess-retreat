/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function harness(member = false, confirmation = false) {
  const state = { authenticated: false, rpcCalls: 0, callback: "", failExchange: false };
  const client = {
    auth: {
      async signInWithPassword() { state.authenticated = true; return { error: null }; },
      async signUp(args: any) {
        state.callback = args.options.emailRedirectTo;
        state.authenticated = !confirmation;
        return { data: { session: confirmation ? null : {} }, error: null };
      },
      async signInWithOAuth(args: any) {
        state.callback = args.options.redirectTo;
        return { data: { url: "https://provider.example/authorize" }, error: null };
      },
      async exchangeCodeForSession() {
        state.authenticated = !state.failExchange;
        return { error: state.failExchange ? {} : null };
      },
    },
    async rpc(name: string) {
      assert.equal(name, "has_inner_sanctum_access");
      assert.equal(state.authenticated, true, "entitlement checked after authentication completes");
      state.rpcCalls++;
      return { data: member, error: null };
    },
  };
  const mocks: Record<string, any> = {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/auth": { getAuthState: async () => ({ user: state.authenticated ? { id: "user" } : null, isAdmin: false }) },
    "next/navigation": { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } },
    "next/headers": { cookies: async () => ({ get: () => ({ value: "yes" }) }) },
    "@/app/actions/entrance": {},
    "@/components/signin-form": { SignInForm: "SignInForm" },
    "./submit-button": { SubmitButton: "button" },
    react: { useState: (mode: string) => [mode, () => {}], useActionState: (action: unknown) => [{}, action] },
  };
  function load(path: string): any {
    const exports = {};
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { exports, require: (name: string) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/")) return mocks[name] = load(`${name.slice(2)}.ts`);
      return require(name);
    }, URL, process: { env: { NEXT_PUBLIC_SITE_URL: "https://site.example" } }, console });
    return exports;
  }
  const actions = load("app/actions/auth.ts");
  mocks["@/app/actions/auth"] = actions;
  const page = load("app/signin/page.tsx").default;
  const form = load("components/signin-form.tsx").SignInForm;
  const callback = load("app/auth/callback/route.ts").GET;
  async function complete(url = state.callback) {
    const nextUrl = new URL(url); nextUrl.searchParams.set("code", "code");
    const response = await callback({ url: nextUrl.toString(), nextUrl });
    return new URL(response.headers.get("location"));
  }
  return { state, actions, page, form, complete, entrance: load("app/page.tsx").default };
}
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
async function submit(h: ReturnType<typeof harness>, query: Record<string, string>, method: string) {
  const page = await h.page({ searchParams: Promise.resolve(query) });
  const props = nodes(page).find(node => node.type === "SignInForm").props;
  const formTree = h.form({ ...props, initialMode: method === "signUp" ? "signup" : "signin" });
  const form = nodes(formTree).find(node => node.type === "form" && node.props.action === h.actions[method]);
  assert.ok(form, "real sign-in form wires the requested auth action");
  const data = new FormData();
  for (const input of nodes(form).filter(node => node.type === "input" && node.props.type === "hidden")) {
    data.set(input.props.name, input.props.value);
  }
  data.set("email", "person@example.com"); data.set("password", "password"); data.set("confirm_password", "password");
  return form.props.action({}, data);
}
for (const member of [false, true]) {
  const expected = member ? "/inner-sanctum" : "/contribute";
  for (const method of ["signIn", "signUp", "signInWithGoogle"]) {
    for (const legacy of [false, true]) test(`${method}: member=${member}, legacy entrance=${legacy}`, async () => {
      const h = harness(member);
      await assert.rejects(submit(h, legacy ? { next: "/inner-sanctum" } : {}, method), {
        message: `REDIRECT:${method === "signInWithGoogle" ? "https://provider.example/authorize" : expected}`,
      });
      if (method === "signInWithGoogle") assert.equal((await h.complete()).pathname, expected);
      assert.equal(h.state.rpcCalls, 1);
    });
  }
  test(`existing-session signin and entrance: member=${member}`, async () => {
    const h = harness(member); h.state.authenticated = true;
    await assert.rejects(h.page({ searchParams: Promise.resolve({ next: "/inner-sanctum" }) }), { message: `REDIRECT:${expected}` });
    await assert.rejects(h.entrance(), { message: `REDIRECT:${expected}` });
  });
}
for (const target of ["", "/contribute", "/checkout/start?product=uuid", "/checkout/FP-reference", "/claim/token", "/invite/token", "/inner-sanctum", "/inner-sanctum/benefits"]) {
  for (const method of ["signIn", "signUp", "signInWithGoogle", "confirmation"]) test(`${method} preserves intentional return: ${target || "ordinary"}`, async () => {
    const h = harness(false, method === "confirmation");
    const query: Record<string, string> = target === "/inner-sanctum" ? { returnTo: target } : { next: target };
    if (method === "confirmation") {
      assert.ok((await submit(h, query, "signUp")).message);
      assert.equal(h.state.rpcCalls, 0);
    } else await assert.rejects(submit(h, query, method), { message: `REDIRECT:${method === "signInWithGoogle" ? "https://provider.example/authorize" : target || "/contribute"}` });
    if (method === "confirmation" || method === "signInWithGoogle") {
      const result = await h.complete();
      assert.equal(result.pathname + result.search, target || "/contribute");
    }
    assert.equal(h.state.rpcCalls, target ? 0 : 1);
  });
}
test("generic entrance links manufacture no return destination", async () => {
  const h = harness();
  const links = nodes(await h.entrance()).filter(node => node.props?.href?.startsWith("/signin"));
  assert.deepEqual(links.map(node => node.props.href), ["/signin", "/signin?mode=signup"]);
});
test("old direct callbacks discard legacy default; intentional return survives failed exchange and retry", async () => {
  const h = harness();
  assert.equal((await h.complete("https://site.example/auth/callback?next=/inner-sanctum")).pathname, "/contribute");
  h.state.failExchange = true;
  const retry = await h.complete("https://site.example/auth/callback?returnTo=/inner-sanctum");
  assert.equal(retry.pathname, "/signin");
  h.state.failExchange = false;
  await assert.rejects(submit(h, Object.fromEntries(retry.searchParams), "signIn"), { message: "REDIRECT:/inner-sanctum" });
});

for (const method of ["signIn", "signUp", "signInWithGoogle"]) test(`stale form POST cannot restore legacy default: ${method}`, async () => {
  const h = harness();
  const data = new FormData();
  data.set("next", "/inner-sanctum"); data.set("email", "person@example.com");
  data.set("password", "password"); data.set("confirm_password", "password");
  await assert.rejects(h.actions[method]({}, data), { message: `REDIRECT:${method === "signInWithGoogle" ? "https://provider.example/authorize" : "/contribute"}` });
  if (method === "signInWithGoogle") assert.equal((await h.complete()).pathname, "/contribute");
});
