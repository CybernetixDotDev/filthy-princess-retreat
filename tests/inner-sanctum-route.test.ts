import assert from "node:assert/strict";
import test from "node:test";
import { resolveInnerSanctumRouteState } from "../lib/inner-sanctum-route.ts";

test("logged-out visitors are sent to sign in", () => {
  assert.equal(resolveInnerSanctumRouteState(false, false), "sign_in");
});

test("authenticated non-members see the access boundary", () => {
  assert.equal(resolveInnerSanctumRouteState(true, false), "access_boundary");
});

test("active members see the Inner Sanctum shell", () => {
  assert.equal(resolveInnerSanctumRouteState(true, true), "member");
});
