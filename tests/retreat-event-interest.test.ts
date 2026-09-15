import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { RETREAT_EVENT_INTEREST_STATUSES } from "../lib/domain.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260913100000_event_interest_and_invitation_layer.sql", import.meta.url), "utf8");
const slugCorrection = readFileSync(new URL("../supabase/migrations/20260913103000_restore_event_slug_generation.sql", import.meta.url), "utf8");
const invitationCorrection = readFileSync(new URL("../supabase/migrations/20260913104000_refine_event_invitation_workflow.sql", import.meta.url), "utf8");
const confirmationMigration = readFileSync(new URL("../supabase/migrations/20260913105000_confirm_event_interest_booking.sql", import.meta.url), "utf8");
const confirmationFix = readFileSync(new URL("../supabase/migrations/20260913106000_fix_event_interest_booking_guest_count.sql", import.meta.url), "utf8");
const benefitLookupFix = readFileSync(new URL("../supabase/migrations/20260913107000_fix_member_confirmed_event_benefit_lookup.sql", import.meta.url), "utf8");
const benefitPage = readFileSync(new URL("../app/inner-sanctum/benefits/page.tsx", import.meta.url), "utf8");

test("event interest vocabulary stays separate from invitation response state", () => {
  assert.deepEqual(RETREAT_EVENT_INTEREST_STATUSES, ["interested", "selected", "not_selected", "withdrawn"]);
  assert.match(migration, /status text not null default 'interested'/);
  assert.doesNotMatch(migration, /status text not null default 'accepted'/);
});

test("member interest is authenticated, membership-gated, and idempotent", () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /public\.has_inner_sanctum_access\(\)/);
  assert.match(migration, /invitation_only = true/);
  assert.match(migration, /interest_enabled = true/);
  assert.match(migration, /unique \(retreat_event_id, user_id\)/);
  assert.match(migration, /if existing\.status = 'withdrawn' then/);
  assert.match(migration, /return query select existing\.id, existing\.status/);
  assert.doesNotMatch(migration, /grant (select, )?insert on public\.retreat_event_interests/);
  assert.doesNotMatch(migration, /create policy "members insert own event interests"/);
});

test("interest and invitation operations do not consume event capacity", () => {
  const interestFunction = migration.slice(migration.indexOf("create or replace function public.express_interest_in_retreat_event"), migration.indexOf("create or replace function public.admin_list_retreat_event_interests"));
  const invitationFunction = migration.slice(migration.indexOf("create or replace function public.admin_create_retreat_event_invitation"), migration.indexOf("create or replace function public.get_public_event_by_slug"));
  assert.doesNotMatch(interestFunction, /available_places\s*[-+]=|update public\.retreat_events/);
  assert.doesNotMatch(invitationFunction, /available_places\s*[-+]=|update public\.retreat_events/);
});

test("retreat event discovery and enquiry routes are not exposed by this app", () => {
  assert.equal(existsSync(new URL("../app/(public)/retreat/events/[slug]/page.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/(public)/retreat/events/[slug]/enquire/page.tsx", import.meta.url)), false);
});

test("event-linked benefits are unique per member and event", () => {
  assert.match(migration, /inner_sanctum_benefits_event_invitation_uidx/);
  assert.match(migration, /retreat_event_id, user_id/);
  assert.match(migration, /type in \('invitation', 'event', 'retreat'\)/);
});

test("extended event creation keeps database slug generation and collision handling", () => {
  assert.match(slugCorrection, /public\.retreat_event_slug\(p_title\)/);
  assert.match(slugCorrection, /while exists \(select 1 from public\.retreat_events where slug = candidate_slug\)/);
  assert.match(slugCorrection, /candidate_slug := base_slug \|\| '-' \|\| suffix/);
  assert.match(slugCorrection, /title, slug, retreat_product_id/);
  assert.match(slugCorrection, /p_invitation_only, p_interest_enabled/);
});

test("event invitations are created from selected interests with personal copy", () => {
  assert.match(invitationCorrection, /p_personal_note text default null/);
  assert.match(invitationCorrection, /interest_row\.status <> 'selected'/);
  assert.match(invitationCorrection, /event_row\.invitation_only/);
  assert.match(invitationCorrection, /event_row\.status <> 'published'/);
  assert.match(invitationCorrection, /event_row\.start_date < current_date/);
  assert.match(invitationCorrection, /'You''re invited\.'/);
  assert.match(invitationCorrection, /Cally would love you to join her for/);
  assert.match(invitationCorrection, /if nullif\(trim\(p_personal_note\)/);
  assert.doesNotMatch(invitationCorrection, /update public\.retreat_events/);
});

test("accepted event interests bridge to one authoritative manual event booking", () => {
  assert.match(confirmationMigration, /invitation\.response <> 'accepted'/);
  assert.match(confirmationMigration, /retreat_event_interest_id uuid references public\.retreat_event_interests/);
  assert.match(confirmationMigration, /retreat_bookings_event_interest_uidx/);
  assert.match(confirmationMigration, /public\.create_manual_retreat_booking\(/);
  assert.match(confirmationMigration, /'join_a_group'::public\.retreat_format/);
  assert.match(confirmationMigration, /event_row\.id/);
  assert.doesNotMatch(confirmationMigration, /update public\.retreat_events/);
});

test("event booking bridge passes the manual RPC's smallint guest count contract", () => {
  assert.match(confirmationFix, /1::smallint/);
  assert.match(confirmationFix, /public\.create_manual_retreat_booking\(/);
  assert.match(confirmationFix, /retreat_event_interest_id = interest_row\.id/);
});

test("member benefit lookup can see confirmed bookings without widening member data access", () => {
  assert.match(benefitLookupFix, /security definer/);
  assert.match(benefitLookupFix, /where b\.user_id = auth\.uid\(\)/);
  assert.match(benefitLookupFix, /booking\.retreat_event_interest_id = interest\.id/);
  assert.match(benefitLookupFix, /booking\.booking_status = 'confirmed'/);
  assert.match(benefitPage, /You're coming\. ♥/);
  assert.match(benefitPage, /confirmed_booking_public_slug/);
});
