import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/inner-sanctum/page.tsx", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/inner-sanctum-event-discovery.tsx", import.meta.url), "utf8");

test("Inner Sanctum discovery uses the shared published event source and member state records", () => {
  assert.match(page, /rpc\("list_public_retreat_events"\)/);
  assert.match(page, /from\("retreat_event_interests"\)/);
  assert.match(page, /getMyInnerSanctumBenefits/);
  assert.match(page, /event\.invitation_only/);
  assert.doesNotMatch(page, /The Filthiest December/);
});

test("Inner Sanctum event discovery keeps interest, invitation, and confirmed booking states separate", () => {
  assert.match(page, /benefit\?\.confirmed_booking_id/);
  assert.match(page, /benefit\?\.response === "accepted"/);
  assert.match(page, /interestStatus === "selected"/);
  assert.match(component, /submitEventInterest/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /document\.body\.style\.overflow = "hidden"/);
  assert.match(component, /You&apos;re coming\. ♥/);
});
