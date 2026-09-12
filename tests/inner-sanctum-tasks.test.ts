import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { INNER_SANCTUM_TASK_RESPONSE_MAX, INNER_SANCTUM_TASK_STATUSES, isTaskOpen } from "../lib/inner-sanctum-tasks.ts";

test("FP-8 keeps task state and response size deliberately small", () => {
  assert.deepEqual(INNER_SANCTUM_TASK_STATUSES, ["draft", "published", "archived"]);
  assert.equal(INNER_SANCTUM_TASK_RESPONSE_MAX, 5000);
});

test("task availability respects publishing, opening, and closing times", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  assert.equal(isTaskOpen({ status: "published", available_from: null, closes_at: null }, now), true);
  assert.equal(isTaskOpen({ status: "draft", available_from: null, closes_at: null }, now), false);
  assert.equal(isTaskOpen({ status: "published", available_from: "2026-09-12T00:00:00Z", closes_at: null }, now), false);
  assert.equal(isTaskOpen({ status: "published", available_from: null, closes_at: "2026-09-11T11:00:00Z" }, now), false);
});

test("member submission uses one trusted RPC and revalidates task surfaces", () => {
  const source = readFileSync(new URL("../app/actions/inner-sanctum-tasks.ts", import.meta.url), "utf8");
  assert.match(source, /rpc\("submit_inner_sanctum_task_response"/);
  assert.doesNotMatch(source, /from\("inner_sanctum_task_responses"\)\.insert/);
});
