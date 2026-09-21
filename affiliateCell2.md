# Affiliate Cell 2 completion

Implemented locally; the migration has not been applied to hosted Supabase.
Apply after Cell 1 using the normal migration deployment process.

## Files and functions

- `supabase/migrations/20260919091242_affiliate_referral_identity.sql`
  adds private `affiliate_private.is_commercially_ready(uuid)` and authenticated
  `public.get_or_create_my_referral_identity()`.
- The migration replaces `public.is_valid_inner_sanctum_referral_code(text)`,
  `public.get_my_filth_meter()` and `public.create_public_store_order(...)`.
- `lib/database.types.ts` adds the new RPC and makes the Filth Meter referral code
  nullable. `app/inner-sanctum/you/page.tsx` and `components/filth-meter.tsx` only
  guard the absent referral link to avoid rendering/copying `?ref=null`.
- `tests/affiliate-identity.test.ts` extends the existing database harness with
  three Cell 2 scenarios; no new framework or dependency was introduced.

## Identity, validity and attribution

A referral is valid exactly when its row is active and its Auth user has an
existing active Affiliate account, a non-null Terms acceptance timestamp and an
accepted version equal to `affiliate_private.current_terms_version()`. Membership
is not consulted. There is no grandfathering or duplicated version constant.

The private eligibility helper is shared by the identity RPC and referral
validator. Store attribution calls that validator instead of independently joining
memberships. All other Store ordering behavior is unchanged, including snapshots,
request-key idempotency, order references, amounts, status and attribution storage.

The identity RPC takes no arguments and uses `auth.uid()`. It requires commercial
eligibility, locks the Affiliate row to serialize provisioning, returns an existing
identity or inserts a 12-random-byte hexadecimal code. Existing user/code uniqueness
constraints remain intact; code collisions retry and user conflicts return the
existing identity. An existing disabled identity is returned unchanged and remains
invalid. Suspended/closed Affiliates cannot use the RPC; no self-reactivation exists.

New privileged functions have empty search paths and qualified object references.
Private helper execution is revoked from PUBLIC/anon/authenticated. Identity RPC
execution is revoked from PUBLIC/anon and granted only to authenticated users, with
an explicit null-auth guard. Existing referral table policies are unchanged.

## Filth and conversion preservation

The Filth Meter's referral insertion loop was removed. Its membership gate,
progression queries, totals and existing-code read remain unchanged. New referral
identities require the explicit canonical RPC; no new consent or referral UI exists.

Conversion functions, the claim trigger, Filth event creation and milestone
evaluation are unchanged. Affiliate-only users can accumulate persistent Filth and
milestones through claim-triggered conversions without receiving membership or
access to the member Filth Meter. Later membership exposes the same history without
transfers or resets. No reward fulfilment, commission, payment or PayGate changes
were made. Cell 3 has not been started.

## Verification

Focused command:

```text
node --test --experimental-strip-types tests/affiliate-identity.test.ts tests/referral-filth-meter.test.ts tests/inner-sanctum-you.test.ts
```

Result: 19 tests passed. This runs the existing Cell 1 setup once, then applies
Cell 2 and checks eligible/idempotent identities, unchanged code format, RLS and
mutation controls, anonymous rejection, Terms/status/referral gates, membership
without consent, read-only Filth Meter behavior, Affiliate-only Store attribution,
historical attribution retention, and unchanged conversion function definitions.

Actual claim redemptions for both Affiliate-only and member referrers verify one
conversion/Filth event per claim, unchanged pending payment status, Affiliate-only
milestone accumulation without access, and preservation of Filth/milestones on a
later membership grant. Lint, TypeScript and diff checks also pass.

Tests use isolated PGlite PostgreSQL with the existing migration harness; they do
not exercise live PostgREST, browser cookies or multi-connection concurrency.

## Existing behavior to carry into Cell 3

Claim redemption remains the temporary commercial conversion boundary. Conversion
still accepts only orders with a lifetime membership fulfillment item and uses the
existing `payfast` conversion-source label; neither is authoritative PayGate payment
verification. Historical attribution is not revalidated at conversion time.

Cookie and request code was left unchanged, including the 90-day httpOnly cookie
and Store action forwarding. Inspection found a pre-existing discrepancy with the
original brief: `lib/supabase/proxy.ts` overwrites an existing cookie on another valid
`?ref=` rather than enforcing first-touch non-overwrite. The client capture's
`document.cookie` check cannot see httpOnly cookies. This cell neither fixes that
behavior nor claims first-touch was verified. No second cookie/table was introduced.
