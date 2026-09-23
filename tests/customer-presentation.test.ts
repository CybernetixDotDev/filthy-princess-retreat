import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { CustomerPresentationState } from "../lib/customer-presentation.ts";
import type { FilthProgression } from "../lib/database.types.ts";

const filth: FilthProgression = {
  lifetime_filth: 120, available_filth: 35, current_level: 2, current_level_title: "Level two",
  current_level_threshold: 100, next_level: 3, next_level_title: "Level three",
  next_level_threshold: 200, filth_to_next_level: 80, progress_percentage: 20, can_spend_filth: true,
};

function load({ anonymous = false, member = true, admin = false, memberError = false, filthError = false, filthThrows = false, empty = false, metadata = { full_name: " Cally " } as Record<string, unknown> } = {}) {
  const calls: string[] = [];
  const exports = {} as { getCustomerPresentationState: () => Promise<CustomerPresentationState> };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/auth": { getAuthState: async () => ({
      user: anonymous ? null : { id: "user-id", email: "person@example.com", user_metadata: metadata },
      isAdmin: admin,
      supabase: { rpc: async (name: string) => {
        calls.push(name);
        if (filthThrows) throw new Error("Unavailable");
        return { data: empty ? [] : [filth], error: filthError ? { code: "unavailable" } : null };
      } },
    }) },
    "@/lib/inner-sanctum": { hasInnerSanctumAccess: async () => {
      calls.push("membership");
      if (memberError) throw new Error("Unavailable");
      return member;
    } },
  };
  runInNewContext(ts.transpileModule(readFileSync("lib/customer-presentation.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name: string) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
    return mocks[name];
  } });
  return { read: exports.getCustomerPresentationState, calls };
}

test("anonymous presentation does not fetch membership or Filth", async () => {
  const { read, calls } = load({ anonymous: true });
  const state = await read();
  assert.equal(state.authenticated, false);
  assert.equal(state.user, null);
  assert.equal(state.filth, null);
  assert.equal(state.isAdmin, false);
  assert.equal(state.hasInnerSanctumAccess, false);
  assert.deepEqual(calls, []);
});

test("presentation preserves authoritative progression and independent Admin/member flags", async () => {
  const { read, calls } = load({ member: false, admin: true });
  const state = await read();
  assert.equal(state.authenticated, true);
  assert.equal(state.user?.displayName, "Cally");
  assert.equal(state.user?.email, "person@example.com");
  assert.equal(state.isAdmin, true);
  assert.equal(state.hasInnerSanctumAccess, false);
  assert.equal(state.filth, filth);
  assert.deepEqual(calls, ["membership", "get_my_filth_progression"]);
  assert.deepEqual(Object.keys(state.user!).sort(), ["displayName", "email", "id"]);
  assert.equal("supabase" in state, false);
});

test("optional failures keep the signed-in identity and never manufacture a Filth balance", async () => {
  for (const failure of [{ filthError: true }, { filthThrows: true }, { empty: true }]) {
    const state = await load({ ...failure, memberError: true }).read();
    assert.equal(state.authenticated, true);
    assert.equal(state.user?.id, "user-id");
    assert.equal(state.hasInnerSanctumAccess, false);
    assert.equal(state.filth, null);
  }
  assert.equal((await load({ filthError: true }).read()).hasInnerSanctumAccess, true);
  assert.equal((await load({ memberError: true }).read()).filth, filth);
});

test("display metadata is optional text and cannot grant privileges", async () => {
  const state = await load({ member: false, metadata: { full_name: {}, name: " ", isAdmin: true } }).read();
  assert.equal(state.user?.displayName, null);
  assert.equal(state.isAdmin, false);
  assert.equal(state.hasInnerSanctumAccess, false);
  assert.equal((await load({ metadata: { name: "Name" } }).read()).user?.displayName, "Name");
});
