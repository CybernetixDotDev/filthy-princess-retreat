import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

type MockUser = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  is_anonymous: boolean;
  identities: Array<{ provider: string }>;
};

const require = createRequire(import.meta.url);
const anonymousUser: MockUser = { id: "same-user-id", email: null, email_confirmed_at: null, is_anonymous: true, identities: [] };

function loadActions(initialUser: MockUser | null, conflict = false) {
  const user = initialUser;
  const calls: Array<{ name: string; args?: Record<string, unknown>; options?: Record<string, unknown> }> = [];
  const client = {
    auth: {
      async getUser() {
        calls.push({ name: "getUser" });
        return { data: { user }, error: user ? null : new Error("missing session") };
      },
      async updateUser(args: Record<string, unknown>, options?: Record<string, unknown>) {
        calls.push({ name: "updateUser", args, options });
        if (conflict && "email" in args) return { data: { user: null }, error: { code: "user_already_exists" } };
        return { data: { user }, error: null };
      },
      async signUp() {
        calls.push({ name: "signUp" });
        throw new Error("signUp must not be called for anonymous conversion");
      },
      async rpc() {
        calls.push({ name: "rpc" });
        throw new Error("account conversion must not mutate Store or membership data");
      },
    },
  };
  const mocks: Record<string, unknown> = {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/auth-destination": { authenticatedDestination: async (next?: string) => next || "/contribute" },
    "@/lib/account-identity": { hasEmailIdentity: (candidate: MockUser) => candidate.identities.some((identity) => identity.provider === "email") },
    "@/lib/auth-return": { authReturnPath: (_next?: string, returnTo?: string) => returnTo || "" },
    "next/navigation": { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
  };
  const exports = {};
  const source = readFileSync("app/actions/auth.ts", "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports,
    require: (name: string) => name in mocks ? mocks[name] : require(name),
    URL,
    process: { env: { NEXT_PUBLIC_SITE_URL: "https://site.example" } },
  });
  return {
    actions: exports as Record<string, (state: object, form: FormData) => Promise<unknown>>,
    calls,
    currentUser: () => user,
  };
}

function emailForm(email: string) {
  const form = new FormData();
  form.set("email", email);
  return form;
}

function passwordForm(password = "long-password") {
  const form = new FormData();
  form.set("password", password);
  form.set("confirm_password", password);
  return form;
}

test("anonymous email update retains the current UUID and returns to the verified password step", async () => {
  const harness = loadActions({ ...anonymousUser });
  const result = await harness.actions.requestAnonymousAccountEmail({}, emailForm("buyer@example.test")) as { message?: string };
  assert.match(result.message ?? "", /verification link/);
  assert.deepEqual(harness.calls.map((call) => call.name), ["getUser", "updateUser"]);
  const update = harness.calls[1];
  assert.equal(update.args?.email, "buyer@example.test");
  assert.deepEqual(Object.keys(update.args ?? {}), ["email"]);
  const verificationRedirect = new URL(String(update.options?.emailRedirectTo));
  assert.equal(verificationRedirect.pathname, "/you");
  assert.equal(verificationRedirect.searchParams.get("secure"), "password");
  assert.equal(harness.currentUser()?.id, "same-user-id");
  assert.equal(harness.calls.some((call) => call.name === "signUp" || call.name === "rpc"), false);
});

test("email already owned by another account is reported without moving the anonymous identity", async () => {
  const harness = loadActions({ ...anonymousUser }, true);
  const result = await harness.actions.requestAnonymousAccountEmail({}, emailForm("existing@example.test")) as { error?: string; accountExists?: boolean };
  assert.equal(result.accountExists, true);
  assert.match(result.error ?? "", /already exists/);
  assert.equal(harness.currentUser()?.id, "same-user-id");
  assert.deepEqual(harness.calls.map((call) => call.name), ["getUser", "updateUser"]);
});

test("password setup requires a verified email and confirms the same UUID before redirecting", async () => {
  const verifiedUser: MockUser = {
    id: "same-user-id", email: "buyer@example.test", email_confirmed_at: "2026-10-01T00:00:00Z",
    is_anonymous: false, identities: [{ provider: "email" }],
  };
  const harness = loadActions(verifiedUser);
  await assert.rejects(harness.actions.completeAnonymousAccount({}, passwordForm()), { message: "REDIRECT:/inner-sanctum" });
  assert.deepEqual(harness.calls.map((call) => call.name), ["getUser", "updateUser", "getUser"]);
  assert.equal(harness.calls[1].args?.password, "long-password");
  assert.deepEqual(Object.keys(harness.calls[1].args ?? {}), ["password"]);
  assert.equal(harness.currentUser()?.id, "same-user-id");
  assert.equal(harness.calls.some((call) => call.name === "signUp" || call.name === "rpc"), false);
});

test("password setup refuses an unverified or anonymous user", async () => {
  const harness = loadActions({ ...anonymousUser });
  const result = await harness.actions.completeAnonymousAccount({}, passwordForm()) as { error?: string };
  assert.match(result.error ?? "", /Verify your email/);
  assert.deepEqual(harness.calls.map((call) => call.name), ["getUser"]);
});

test("You branches anonymous conversion while retaining the permanent account view", () => {
  const page = readFileSync("app/you/page.tsx", "utf8");
  const forms = readFileSync("components/secure-account-forms.tsx", "utf8");
  assert.match(page, /user\.is_anonymous === true/);
  assert.match(page, /query\.secure === "password"/);
  assert.match(page, /Account &amp; settings/);
  assert.match(forms, /Send verification/);
  assert.match(forms, /Check your email/);
  assert.match(forms, /Enter the Inner Sanctum/);
});
