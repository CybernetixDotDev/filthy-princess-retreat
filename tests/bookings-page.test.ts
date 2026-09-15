import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("public bookings discovery is not exposed by this app", () => {
  assert.equal(existsSync(new URL("../app/(public)/bookings/page.tsx", import.meta.url)), false);
});
