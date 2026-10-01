import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const productId = "20000000-0000-4000-8000-000000000099";
const requestKey = "30000000-0000-4000-8000-000000000001";
const orderReference = "FP-AAAAAAAA-BBBBBBBB-CCCCCCCC";

function loadAction(initialUser: { id: string; email: string | null } | null, anonymousSignInError = false) {
  let currentUser = initialUser;
  const calls: string[] = [];
  const rpcRequests: Array<Record<string, unknown>> = [];
  const orders = new Map<string, { order_reference: string; user_id: string; buyer_email: string }>();
  const client = {
    auth: {
      async getUser() {
        calls.push("getUser");
        return { data: { user: currentUser }, error: currentUser ? null : { name: "AuthSessionMissingError" } };
      },
      async signInAnonymously() {
        calls.push("signInAnonymously");
        if (anonymousSignInError) return { data: { user: null, session: null }, error: new Error("anonymous sign-in disabled") };
        currentUser = { id: "anonymous-user-id", email: null };
        return { data: { user: currentUser, session: {} }, error: null };
      },
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push("rpc");
      assert.equal(name, "create_public_store_order_multi");
      assert.ok(currentUser, "order RPC runs only with an authenticated identity");
      rpcRequests.push(args);
      const existing = orders.get(String(args.p_request_key));
      if (existing) return { data: [{ order_reference: existing.order_reference }], error: null };
      orders.set(String(args.p_request_key), {
        order_reference: orderReference,
        user_id: currentUser!.id,
        buyer_email: String(args.p_buyer_email),
      });
      return { data: [{ order_reference: orderReference }], error: null };
    },
  };
  const mocks: Record<string, unknown> = {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/store-cart": { toStoreOrderRpcItems: (items: unknown) => items },
    "next/headers": { cookies: async () => ({ get: () => undefined }) },
    "next/navigation": { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
  };
  const exports = {};
  const source = readFileSync("app/actions/store.ts", "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports,
    require: (name: string) => name in mocks ? mocks[name] : require(name),
  });
  return { action: (exports as { createStoreCartOrder: (state: object, form: FormData) => Promise<unknown> }).createStoreCartOrder, calls, rpcRequests, orders };
}

function checkoutForm() {
  const form = new FormData();
  form.set("items", JSON.stringify([{ productId, quantity: 1 }]));
  form.set("buyer_email", "buyer@example.com");
  form.set("request_key", requestKey);
  return form;
}

test("visitor gets an anonymous identity before the order RPC and retains checkout email", async () => {
  const harness = loadAction(null);
  await assert.rejects(harness.action({}, checkoutForm()), { message: `REDIRECT:/checkout/${orderReference}` });
  assert.deepEqual(harness.calls, ["getUser", "signInAnonymously", "getUser", "rpc"]);
  const request = harness.rpcRequests[0];
  assert.equal(request.p_buyer_email, "buyer@example.com");
  assert.notEqual(request.p_request_key, requestKey);
  const order = [...harness.orders.values()][0];
  assert.equal(order.user_id, "anonymous-user-id");
  assert.equal(order.buyer_email, "buyer@example.com");
});

test("signed-in customer keeps the existing identity without anonymous sign-in", async () => {
  const harness = loadAction({ id: "existing-user-id", email: "account@example.com" });
  await assert.rejects(harness.action({}, checkoutForm()), { message: `REDIRECT:/checkout/${orderReference}` });
  assert.deepEqual(harness.calls, ["getUser", "rpc"]);
  assert.equal([...harness.orders.values()][0].user_id, "existing-user-id");
  assert.equal(harness.rpcRequests[0].p_buyer_email, "buyer@example.com");
});

test("same identity and request key retry the same order with the same scoped RPC key", async () => {
  const harness = loadAction(null);
  await assert.rejects(harness.action({}, checkoutForm()), { message: `REDIRECT:/checkout/${orderReference}` });
  await assert.rejects(harness.action({}, checkoutForm()), { message: `REDIRECT:/checkout/${orderReference}` });
  assert.equal(harness.rpcRequests.length, 2);
  assert.equal(harness.rpcRequests[0].p_request_key, harness.rpcRequests[1].p_request_key);
  assert.equal(harness.orders.size, 1);
});

test("anonymous-auth failure stops before order creation", async () => {
  const harness = loadAction(null, true);
  const result = await harness.action({}, checkoutForm()) as { error?: string };
  assert.equal(result.error, "A secure checkout session could not be created. Please try again.");
  assert.deepEqual(harness.calls, ["getUser", "signInAnonymously"]);
  assert.equal(harness.rpcRequests.length, 0);
});

test("forward migration requires an identity and binds retries to its owner", () => {
  const migration = readFileSync("supabase/migrations/20261001100000_store_authenticated_order_ownership.sql", "utf8");
  assert.match(migration, /if auth\.uid\(\) is null then\s+raise exception 'authentication_required'/);
  assert.match(migration, /existing_order\.user_id is distinct from auth\.uid\(\)/);
  assert.match(migration, /user_id, buyer_email, status,[\s\S]*auth\.uid\(\), normalized_email, 'pending'/);
  assert.match(migration, /currency_code, order_total, order_total, p_acquisition_method/);
});
