import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/retreat/page.tsx", "utf8");
const component = readFileSync("components/public-retreat-page.tsx", "utf8");
const enquiries = readFileSync("app/actions/enquiries.ts", "utf8");
const entrance = readFileSync("app/actions/entrance.ts", "utf8");
const root = readFileSync("app/page.tsx", "utf8");

test("public Retreat loads published products inside the shared shell", () => {
  assert.match(page, /FilthyShell/);
  assert.match(page, /retreat-page-full-bleed/);
  assert.match(page, /from\("retreat_products"\)/);
  assert.match(page, /eq\("is_published", true\)/);
  assert.match(page, /order\("sort_order"\)/);
  assert.doesNotMatch(page, /requireContributorAuth|getAuthState|hasInnerSanctumAccess/);
  assert.doesNotMatch(page, /<main/);
});

test("Retreat v1 supports only private formats and uses authoritative public pricing", () => {
  assert.match(component, /getPublicRetreatPrice/);
  assert.match(component, /"solo", "couples", "private_group"/);
  assert.doesNotMatch(component, /join_a_group/);
  assert.doesNotMatch(component, /calculateRetreatUsd|price_usd_per_person/);
  assert.match(component, /three-night|Three nights|nights/);
});

test("public Retreat enquiry uses the anonymous interest RPC without booking language", () => {
  assert.match(enquiries, /submitPublicRetreatInterest/);
  assert.match(enquiries, /submit_public_retreat_interest/);
  assert.match(enquiries, /full_name/);
  assert.match(enquiries, /product_id/);
  assert.match(enquiries, /retreat_format/);
  assert.match(enquiries, /guest_count/);
  assert.doesNotMatch(enquiries.slice(enquiries.indexOf("export async function submitPublicRetreatInterest")), /requireContributorAuth|getAuthState/);
  assert.match(component, /Nothing has been booked or charged yet/);
});

test("anonymous entrance handoff goes to Retreat while authenticated root routing remains", () => {
  assert.match(entrance, /redirect\("\/retreat"\)/);
  assert.match(root, /if \(user\) redirect\(isAdmin \? "\/admin" : await authenticatedDestination\(\)\)/);
  assert.match(root, /redirect\("\/retreat"\)/);
});

test("Cally reveal stays minimal and does not restore biography copy", () => {
  assert.match(component, /Oh\. You came\.|futanari princess/);
  for (const beat of ["come hungry.", "I have plans for you.", "some of them involve strawberries.", "some involve filthy showers.", "good girls get pampered.", "bad girls do too. ♡", "still looking?", "good."]) assert.match(component, new RegExp(beat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(component, /retreat-cally-beat-identity/);
  assert.doesNotMatch(component, /I cook with you|This Retreat exists because|Beautiful\. Indulgent\. Curious|Come curious\. Come shy/);
  assert.doesNotMatch(component, /self-appointed princess/);
});

test("Cally reveal uses one native-scroll sticky scene with responsive art direction", () => {
  assert.match(component, /retreat-cally-scroll-scene/);
  assert.match(component, /retreat-cally-sticky-stage/);
  assert.match(component, /retreat-cally-scroll-track/);
  assert.match(component, /11rainwashedCally\.png/);
  assert.match(component, /fullAttentionCally4K\.jpeg/);
  assert.doesNotMatch(component, /retreat-moon-break/);
});
