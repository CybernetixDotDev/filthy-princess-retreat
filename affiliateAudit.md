# Filthy Princess — Referral, Filth Meter & Identity Architecture Audit

## Purpose

This document is a read-only audit of the existing implementation as it exists in the codebase and database migrations. It is not a design brief and does not propose a replacement architecture.

This audit records what is currently implemented, how it is coupled, and how the current admin and member experiences work.

---

# 1. Identity and access

## 1.1 Current account architecture

The app uses Supabase Auth as the source of identity.

Relevant implementation:
- app/actions/auth.ts
  - signIn() calls supabase.auth.signInWithPassword()
  - signUp() calls supabase.auth.signUp()
  - signOut() calls supabase.auth.signOut()
- lib/auth.ts
  - getAuthState() fetches auth.user and checks public.admin_users for admin status
  - requireAdmin() redirects unauthenticated users to /signin?next=/admin and returns null for authenticated non-admin users
- app/page.tsx
  - if a user is logged in, redirect to /admin for admins or /inner-sanctum for everyone else
- app/signin/page.tsx
  - if a user is already signed in, redirect to /admin if admin else the requested next route (default /inner-sanctum)

Relevant tables:
- auth.users
  - base authentication identity
- public.admin_users
  - a simple admin allowlist with a single column: user_id uuid primary key references auth.users(id)
- public.inner_sanctum_memberships
  - one membership row per user_id unique

Relevant admin authorization function:
- supabase/migrations/20260908080833_retreat_launch_foundation.sql
  - retreat_private.is_retreat_admin() checks auth.uid() exists and matches a row in public.admin_users

Current admin authorization is therefore a boolean capability check, not a role table or capability matrix.

## 1.2 How users sign up

The user-facing sign-up path is:
- app/page.tsx: landing page / prompts sign-up at /signin?mode=signup&next=/inner-sanctum
- app/signin/page.tsx: if user exists, redirect; else render SignInForm with initialMode based on mode query param
- app/actions/auth.ts: signUp() validates email/password, calls supabase.auth.signUp(parsed.data)

Observed behavior:
- Password minimum is 6 characters.
- If supabase.auth.signUp() returns a session, the app redirects to next.
- If no session is returned, the app displays a message telling the user to confirm email before signing in.
- There is no separate profile table for user metadata beyond auth.users and admin_users.

## 1.3 Authentication flow

The app uses Next.js server actions and Supabase SSR via createClient().

Relevant files:
- lib/supabase/server.ts (not read in detail, but this is the shared server-side Supabase client used by auth and store/member actions)
- lib/auth.ts
- app/actions/auth.ts

The key pattern is:
- createClient()
- auth.getUser() or auth.signInWithPassword()/signUp()/signOut()
- role/access checks after authentication using admin_users or membership RPCs

## 1.4 Inner Sanctum membership/access representation

Membership is modeled as a row in public.inner_sanctum_memberships.

Schema:
- table: public.inner_sanctum_memberships
- user_id uuid not null unique
- status enum: active, suspended, cancelled
- membership_type enum: lifetime
- source: admin, store, promotion, migration
- source_reference text
- started_at, expires_at, suspended_at, cancelled_at
- last_changed_by uuid references auth.users

Relevant migration:
- supabase/migrations/20260911081131_inner_sanctum_membership_foundation.sql

Access checks:
- public.has_inner_sanctum_access() returns true only when the current auth user has an active membership and expiration is null or in the future
- public.get_my_inner_sanctum_access() returns has_access, membership_status, membership_type, started_at, expires_at
- app/lib/inner-sanctum.ts has hasInnerSanctumAccess() wrapper around rpc("has_inner_sanctum_access")
- app/inner-sanctum/layout.tsx and app/inner-sanctum/page.tsx gate access using hasInnerSanctumAccess()

This means Inner Sanctum access is not a generic “identity capability” record; it is a single membership record with a binary active/inactive check.

## 1.5 How purchased membership is claimed

Membership purchase and claim are split into two phases.

1. Store order creation
- app/actions/store.ts creates a store order by calling create_public_store_order with p_referral_code captured from the cookie
- supabase/migrations/20260911085538_store_foundation_membership_product.sql creates store_products, store_orders, store_order_items
- create_public_store_order() inserts public.store_orders and a single public.store_order_items row for that product

2. Fulfillment authorization and key issuance
- supabase/migrations/20260911094905_store_claim_fulfillment_foundation.sql creates store_fulfillment_authorizations and store_claims
- admin_authorize_store_fulfillment() creates an authorization record and an available claim record for the order
- app/admin/store/claim-actions.ts exposes actions to authorize, reissue, and revoke that claim

3. Claim redemption
- app/actions/store-claims.ts calls public.redeem_store_claim(p_token)
- public.redeem_store_claim() validates token, checks claim status, ensures order is supported and not cancelled/failed, and then calls inner_sanctum_private.apply_membership_transition(..., 'grant', 'store', order_reference, target_user)
- It also updates public.store_orders.user_id = target_user and marks store_claims.status = 'claimed'

The membership grant is therefore tied to the claim redemption flow, not to payment status.

## 1.6 How entitlement is granted

Current entitlement grant logic is membership-centric.

Relevant implementation:
- inner_sanctum_private.apply_membership_transition() in the membership migration and in store_claim_fulfillment_foundation.sql
- public.admin_transition_inner_sanctum_membership() for admin actions
- public.redeem_store_claim() for claim redemption

Grant conditions:
- A user receives an active membership row via a grant operation
- If a membership exists and is already active, the grant operation is a no-op
- The membership_type is always lifetime for current implementation

There is no generic entitlement row for multiple future capabilities; entitlement is encoded as membership records, plus separate admin_users and referral code ownership.

## 1.7 How entitlement is checked

Current checks are direct DB predicates.

- public.has_inner_sanctum_access()
  - returns true only if current user has row in inner_sanctum_memberships with status='active' and not expired
- public.get_my_inner_sanctum_access()
  - returns access state for the authenticated user
- app/lib/inner-sanctum.ts has a wrapper function
- app/server pages and layouts gate content based on hasInnerSanctumAccess()
- migration policies on inner_sanctum_posts, inner_sanctum_collectibles, inner_sanctum_benefits, inner_sanctum_tasks all check public.has_inner_sanctum_access()

This design supports a single membership gate, not a general capability union.

## 1.8 Current post-signup routing

- app/page.tsx: if user is logged in, redirect to /admin if admin, else /inner-sanctum
- app/signin/page.tsx: if user exists, redirect likewise
- app/inner-sanctum/layout.tsx: if not signed in, send to /signin?next=/inner-sanctum

The default route for signed-in non-admin users is /inner-sanctum.

## 1.9 Current post-login routing

The checked routes are:
- landing page / redirects to /inner-sanctum for non-admin users
- sign-in page redirects to next param, default /inner-sanctum
- admin requires /admin and checks admin_users

There is no multi-role redirect pipeline. Authenticated users are treated as either admin or non-admin member candidate.

## 1.10 Current post-membership-claim routing

After a claim succeeds, the claim form shows a success state and links to /inner-sanctum.

Relevant files:
- components/store-claim-form.tsx
- app/(public)/claim/[token]/page.tsx
- app/actions/store-claims.ts

The UI states are:
- success -> link to /inner-sanctum
- already_member -> link to /inner-sanctum
- invalid/revoked/claimed -> informational state only

## 1.11 Preview/member/suspended/cancelled states still present

The current membership status model explicitly includes:
- active
- suspended
- cancelled

There is no separate preview state in the current code. The app checks only active vs non-active. Suspended and cancelled are administrative states that remove access via public.has_inner_sanctum_access().

## 1.12 Admin authorization and role/capability system

There is no real “role” system beyond a single admin flag.

Relevant files:
- supabase/migrations/20260908080833_retreat_launch_foundation.sql
- lib/auth.ts
- app/admin/layout.tsx

The system is effectively:
- admin_users holds allowed user IDs
- retreat_private.is_retreat_admin() checks membership in admin_users
- requireAdmin() uses that check and routes unauthorized users away from admin pages

This is not a capability system for multiple independent admin/member/affiliate states.

## 1.13 Future compatibility question, current architecture only

The current architecture permits:
- one user_id can have one membership row
- one user_id can be in admin_users
- one user_id can own one referral code row

The app does not currently model a generic capability table or a multi-role aggregate. A future “member + affiliate + admin + collaborator” model would need a new abstraction, because current identity is still effectively auth user + separate boolean/row-based feature checks.

---

# 2. Existing referral system

## 2.1 Referral lifecycle overview

The complete referral lifecycle currently in code is:

Referral URL
→ visitor arrival
→ referral identification
→ browser persistence/cookie
→ subsequent browsing
→ store order creation
→ order/payment state remains separate
→ membership claim
→ referral conversion trigger
→ referrer Filth event
→ Filth Meter update and milestone evaluation

## 2.2 Referral code model

Relevant table:
- public.inner_sanctum_referrals
- columns: id, user_id, code, status, created_at, updated_at
- user_id unique
- code unique
- status enum: active, disabled

Relevant rules:
- code pattern: ^[A-Za-z0-9_-]{16,100}$
- public.is_valid_inner_sanctum_referral_code(p_code) checks that the referral exists, is active, and belongs to an active Inner Sanctum membership

Relevant migration:
- supabase/migrations/20260911145238_referral_filth_meter_foundation.sql

## 2.3 How a member obtains a referral URL

The member-facing route is:
- app/inner-sanctum/you/page.tsx
- getInnerSanctumYouState() calls get_my_filth_meter
- It builds referralUrl = ${origin}/?ref=${encodeURIComponent(state.filth.referral_code)}

The UI is in:
- components/filth-meter.tsx
- It renders the member’s referral code and a copy button

This is the current “member referral URL” mechanism.

## 2.4 Visitor arrival and referral identification

The app reads the query string and stores the referral code in browser cookies.

Relevant files:
- components/referral-capture.tsx
- lib/supabase/proxy.ts

Observed behavior:
- client-side capture: loads window.location.search, reads ?ref, validates against /^[A-Za-z0-9_-]{1,100}$/
- if no existing booking cookie for inner_sanctum_referral or retreat_referral, it writes both cookies:
  - retreat_referral
  - inner_sanctum_referral
- The cookie value is not protected from JS because it is set by a client component and is not httpOnly in this client-side step

Server-side validation path:
- lib/supabase/proxy.ts intercepts requests and reads request.nextUrl.searchParams.get("ref")
- If valid and exists in DB, it sets inner_sanctum_referral cookie with httpOnly: true, sameSite: "lax", maxAge: 90 days
- This is the authoritative server-controlled persistence path

So there are two sets of code paths:
- temporary client-side capture for the redirect flow
- server-side cookie persistence for real validation

## 2.5 Cookie names and lifetime

Cookies currently observed:
- inner_sanctum_referral
  - persisted by proxy.ts as httpOnly, sameSite=lax, 90-day maxAge
- retreat_referral
  - set by the client component as non-httpOnly browser cookie
  - used for general enquiry tracking, not strictly restricted to membership referral logic

The current lifetime is specifically:
- 90 days for inner_sanctum_referral
- no explicit lifetime defined for retreat_referral in the server path; it is set by client code without expiry

## 2.6 Subsequent browsing and return visits

Behavior is effectively first-touch based on the browser cookie.

Relevant logic:
- ReferralCapture has hasExisting check for cookie names before new assignment
- If a valid cookie is already present, it does not overwrite it
- Proxy validation only sets the cookie if valid and code exists in DB
- create_public_store_order reads current cookie value from cookies() and passes it as p_referral_code

This means:
- a return visitor with an existing valid cookie keeps attribution unless the cookie is absent/expired
- a return visit later after expiry loses attribution because the server-side cookie is not set again unless the query string is present and valid
- if a user visits multiple referral URLs in the same browser, the first one present wins because of the existing-cookie check

## 2.7 Store purchase and order creation

Store order creation is governed by:
- app/actions/store.ts
- supabase/migrations/20260911145238_referral_filth_meter_foundation.sql

The crucial path is:
- read inner_sanctum_referral cookie from current request
- call create_public_store_order(p_product_id, p_buyer_email, p_request_key, p_referral_code)
- create_public_store_order then inserts store_orders and store_order_items
- if p_referral_code is valid, it inserts into public.store_order_referrals with unique order_id and selected referral_id/referrer_user_id using a join to inner_sanctum_referrals and active membership rows

Important implementation detail:
- This insertion is done on the moment the order is created; the order is still pending and not yet paid
- The referral attribution is stored before payment verification

## 2.8 Order/payment relationship

The referral system intentionally does not tie conversion to payment receipt.

Evidence:
- create_public_store_order() inserts store_order_referrals during order creation and does not check paid status
- store_private.assert_supported_order() accepts any store order that is not cancelled/failed and has a matching inner_sanctum_membership item
- inner_sanctum_referral_private.record_successful_referral_conversion() checks the order exists and contains a membership item, then calls it when a claim becomes claimed
- The conversion source is 'payfast' in the trigger, but there is no actual PayFast payment verification logic in this referral conversion path

This is a key architectural nuance: the code labels the conversion source as 'payfast', but the actual conversion gate is “claim became claimed,” not “payment verified.”

## 2.9 Membership claim and conversion attribution

The trigger that converts order referral into a referral conversion is:
- supabase/migrations/20260913108000_automatic_referral_conversion_on_claim.sql

It creates a trigger on public.store_claims after status update when new.status = 'claimed'.

The trigger checks:
- order has an unconverted store_order_referrals row
- then calls record_successful_referral_conversion(new.order_id, new.claimed_by, 'payfast', null)

This is the active conversion boundary in the current implementation.

## 2.10 Conversion conditions and validation

record_successful_referral_conversion() validates:
- order exists and contains an inner_sanctum_membership lifetime item
- store_order_referrals row exists for the order
- referral exists
- referrer_user_id != referred_user_id
- referred_user_id exists in auth.users
- conversion_id not already present

If all checks pass, it inserts a row into public.inner_sanctum_referral_conversions.

Relevant created row:
- referral_id
- referrer_user_id
- referred_user_id
- order_id
- order_reference
- points_awarded
- conversion_source
- converted_at

It also inserts into public.inner_sanctum_filth_events for the referrer with event_type='referral' and points=referral_points from inner_sanctum_filth_settings

This is the actual conversion event.

## 2.11 Duplicate/idempotency protections

The referral system is protected by multiple uniqueness constraints and checks:
- public.inner_sanctum_referrals.user_id unique
- public.inner_sanctum_referrals.code unique
- public.store_order_referrals.order_id unique
- public.inner_sanctum_referral_conversions.order_id unique
- public.inner_sanctum_referral_conversions.referred_user_id unique
- public.inner_sanctum_referral_conversions_not_self check referrer_user_id <> referred_user_id
- record_successful_referral_conversion() checks if conversion_id already exists and returns it rather than creating a duplicate

This is a strong idempotency pattern on the conversion side.

## 2.12 Conversion attribution rules

The current rules are:
- referral is only valid when tied to an active membership
- the cookie-based referral is stored only when the code is valid
- the order obtains a referral row if the order was created with a valid p_referral_code
- the order referral becomes permanent only after record_successful_referral_conversion runs
- if the claim is revoked or invalid, conversion does not happen

Attribution is therefore not “payment confirmed” but “membership claim converted.”

## 2.13 What happens if payment/order is cancelled or fails

If the order is cancelled or failed:
- public.get_store_claim_state() returns invalid when order_row.status in ('cancelled','failed')
- store_private.assert_supported_order() raises exception 'store_order_ineligible' if the order is cancelled or failed
- public.redeem_store_claim() also calls assert_supported_order() before allowing claim
- any referral conversion triggered from a claim cannot happen because the claim is invalid or not created

The code therefore does not award referral credit in the cancelled/failed path.

## 2.14 What happens if the visitor returns much later

The system relies on cookies and server validation.
- if the visitor returns with the same cookie, they may still match the same referral
- if the cookie is gone or expired, no attribution is re-established unless they visit with a new ref query parameter and a valid referral code
- referral codes themselves are tied to active memberships, so a member who later loses access will no longer validate as a referrer

There is no “legacy attribution” or “re-open old order to retarget” flow.

## 2.15 What happens if multiple referral links are visited

Observed behavior:
- ReferralCapture intentionally avoids overwriting an existing cookie when a cookie is already present
- create_public_store_order attaches only one referral_code to an order; there is no multi-referrer array or ranking

Therefore, the system behaves like first-touch browser attribution rather than a “latest-link wins” model.

## 2.16 Self-referrals and anti-abuse logic

Self-referral prevention is explicit:
- record_successful_referral_conversion() checks if referral.user_id = p_referred_user_id and raises self_referral
- public.inner_sanctum_referral_conversions_not_self prevents a row if the same user is referrer and referred user

Anti-abuse/authorization logic also includes:
- only active referral codes are valid
- the underlying member must have an active membership
- the system uses server-side validation rather than trusting browser request param values
- create_public_store_order uses only server-side cookies and the DB join to inner_sanctum_referrals
- store_order_referrals is unique per order to avoid duplicate attribution

## 2.17 Actual implementation vs apparent intent

Important distinction:
- The code clearly implements referral conversion on successful claim of a membership order.
- The app labels some conversion source as 'payfast', but there is no true payment verification path in the referral trigger.
- The system currently treats a “successful conversion” as claim success plus a valid attributed order, not as a commercially verified paid order.
- There are admin test conversion controls that intentionally bypass normal payment semantics, and those are explicitly marked as testing-only.

---

# 3. Filth Meter

## 3.1 Where the current Filth score is stored

The Filth score is not stored as a permanent balance row.

Current implementation is derived from events:
- table: public.inner_sanctum_filth_events
- columns include user_id, event_type, points, source_reference, created_by, created_at
- public.get_my_filth_meter() does:
  - select coalesce(sum(points),0) from public.inner_sanctum_filth_events where user_id=auth.uid()

The current “filth_total” is therefore a derived total, not a single persisted balance field.

## 3.2 Whether there is a transaction/event ledger

Yes, there is a ledger.

Relevant tables:
- public.inner_sanctum_filth_events
- public.inner_sanctum_referral_conversions
- public.inner_sanctum_member_filth_milestones

This is effectively an event-sourced model with a derived current total.

## 3.3 Every currently supported way Filth can increase or decrease

The code explicitly supports these current mutation paths:

1. Referral conversion
- public.inner_sanctum_referral_conversions inserts row
- then public.inner_sanctum_filth_events inserts a row for the referrer user with event_type='referral' and points=referral_points
- this increases the referrer’s total

2. Manual admin adjustment
- public.admin_add_filth_points(p_user_id, p_points, p_reason)
- inserts an event with event_type='admin' and arbitrary points
- allows positive or negative values as long as value != 0 and reason length valid
- this is the only current explicit decrease path in production code

3. Milestone evaluation is not direct Filth mutation; it marks earned milestones when cumulative score reaches threshold
- inner_sanctum_referral_private.evaluate_filth_milestones() inserts into inner_sanctum_member_filth_milestones when threshold is met

4. Enum fields for task, experience, special exist but no concrete production path was found in the code audited here
- event_type enum: 'referral', 'admin', 'task', 'experience', 'special'
- no current RPC or action appears to insert those variants except the enum itself and the admin/referral flow

So the actual operational Filth movement is primarily:
- referral gain
- admin gain/loss
- milestone tracking only

## 3.4 Referral-related Filth events

Specific data path:
- record_successful_referral_conversion() selects referral_points from inner_sanctum_filth_settings
- inserts into inner_sanctum_referral_conversions
- inserts into inner_sanctum_filth_events(user_id=referral.user_id, event_type='referral', points=points, source_reference='referral-conversion:'||conversion_id)

This is the only automatic referral reward path in the current implementation.

## 3.5 Manual admin adjustments

Relevant admin action:
- app/admin/referrals/actions.ts => addFilthPoints()
- calls public.admin_add_filth_points()

This is routing through the admin interface and writes a row to inner_sanctum_filth_events with event_type='admin'.

## 3.6 Fulfilment-related adjustments

There is no separate “reward fulfilment” ledger that reduces or adjusts Filth after a milestone is fulfilled.

The closest related table is:
- public.inner_sanctum_member_filth_milestones
- columns: user_id, milestone_id, earned_at, fulfilled_at, fulfillment_reference

Current usage:
- evaluate_filth_milestones() inserts earned milestone rows only
- fulfilled_at is defined but not actively used in the code inspected here
- there are no RPCs or UI actions that move a milestone from earned to fulfilled

So milestone fulfilment appears partially designed, but not fully operationalized.

## 3.7 Idempotency protections

The code has two relevant protections:
- public.inner_sanctum_filth_events.source_reference text not null unique
  - prevents duplicate source-reference rows
- public.inner_sanctum_member_filth_milestones unique(user_id, milestone_id)
  - prevents duplicate milestone awards

Along with conversion idempotency, these reduce accidental duplication.

## 3.8 History and audit rows

Relevant history tables:
- public.inner_sanctum_filth_events
- public.inner_sanctum_referral_conversions
- public.inner_sanctum_member_filth_milestones

What is available:
- who earned what
- why (source_reference)
- when
- who created the event (created_by)
- whether a milestone was earned

This is a traceable ledger, though not yet a general-purpose reward journal.

## 3.9 Thresholds, progression, and reward logic

Tables:
- public.inner_sanctum_filth_levels
- public.inner_sanctum_filth_milestones

Current data seeded in migration:
- Level 1 threshold 10 titled Level 1
- Level 2 threshold 50
- Level 3 threshold 100

Milestones seeded as threshold values 2, 4, 6, 8, 10 under level 1, each with title and reward_type='manual'

Current logic:
- get_my_filth_meter() reads the highest active level where threshold <= total
- next_level_threshold is the next threshold above total
- earned milestones are aggregated using public.inner_sanctum_member_filth_milestones joined to milestones

There is no progressive unlock engine with automatic reward issuance beyond the milestone flag.

## 3.10 UI displaying Filth Meter information

Main UI:
- components/filth-meter.tsx

What it shows:
- current level title
- total Filth
- progress bar based on current/next threshold
- successful_referrals count
- earned milestones list
- copyable referral link

This is the principal member-facing Filth/UI surface.

## 3.11 Admin controls affecting Filth

Admin controls affecting Filth include:
- app/admin/referrals/page.tsx
  - lists each referral and shows total Filth and milestone status
  - allows disable/enable referral status
  - allows manual Filth adjustment via addFilthPoints
  - allows manual synthetic referral conversion via recordTestConversion

These controls all route to RPCs defined in these migrations.

## 3.12 Classification of Filth architecture

The Filth system behaves as a combination of:
1. stored event ledger (yes)
2. derived balance (yes)
3. reward/progression engine (partially yes)
4. manual admin intervention model (yes)

It is not yet a full reward engine. It is a balance derived from a ledger, with threshold and milestone progression layered on top.

---

# 4. Referral rewards / fulfilments

## 4.1 Related concepts in the current implementation

There are several distinct notions that overlap:
- member referral codes
- referral conversion attribution
- Filth points awarded to referrer
- milestone tracks and “reward” metadata on milestone definitions
- store membership fulfillment via claim token
- admin testing conversion controls

The code does not currently separate “referral reward” from “Filth points” or “member reward fulfilment” into a distinct domain model.

## 4.2 Relevant tables

- public.inner_sanctum_referrals
- public.store_order_referrals
- public.inner_sanctum_referral_conversions
- public.inner_sanctum_filth_settings
- public.inner_sanctum_filth_levels
- public.inner_sanctum_filth_milestones
- public.inner_sanctum_member_filth_milestones
- public.store_fulfillment_authorizations
- public.store_claims

## 4.3 Reward definitions

Reward definitions are effectively milestone metadata.

Schema:
- public.inner_sanctum_filth_milestones
  - threshold
  - title
  - reward_type enum: collectible, benefit, experience, retreat, manual
  - reward_reference text
  - status active/inactive

There is no dedicated “reward issuance” table beyond the milestone assignment table.

## 4.4 Fulfilment records

The currently relevant fulfilment record is:
- public.inner_sanctum_member_filth_milestones
  - user_id
  - milestone_id
  - earned_at
  - fulfilled_at
  - fulfillment_reference

This is the only place where a milestone is marked as earned and optionally fulfilled.

No public function was found that moves a milestone into “fulfilled” automatically or post-approval. The field exists, but the lifecycle is not fully implemented.

## 4.5 Status lifecycle

Current statuses:
- referral status: active | disabled
- claim status: available | claimed | revoked
- membership status: active | suspended | cancelled
- milestone status: active | inactive
- member milestone status: effectively earned/fulfilled via rows, but not formally enumerated

This is a mixed set of statuses with partial lifecycle enforcement.

## 4.6 RPCs/functions/triggers

Relevant RPCs:
- public.is_valid_inner_sanctum_referral_code()
- public.get_my_filth_meter()
- inner_sanctum_referral_private.evaluate_filth_milestones()
- inner_sanctum_referral_private.record_successful_referral_conversion()
- public.admin_record_test_referral_conversion()
- public.admin_add_filth_points()
- public.redeem_store_claim()
- trigger: store_claim_converts_referral after update of status on public.store_claims

## 4.7 Admin actions and test controls

Admin actions:
- /admin/referrals page
  - enable/disable referral status
  - add points
  - record test conversion
- /admin/store/orders/[id]
  - authorize fulfillment
  - reissue key
  - revoke key

The “record test conversion” action is explicitly a testing/debug control, not a business process.

## 4.8 Trace one successful existing referral in actual code

One successful path in the current implementation is:

1. Member A has an active referral row in public.inner_sanctum_referrals.
2. Visitor B visits /?ref=<code> and the cookie is set (or the server validates and sets inner_sanctum_referral cookie).
3. B creates a store order with app/actions/store.ts and create_public_store_order().
4. create_public_store_order() attributes the order to A by inserting public.store_order_referrals.
5. Admin issues a membership claim link for the order.
6. The user redeems the claim via public.redeem_store_claim().
7. public.redeem_store_claim() grants the membership via inner_sanctum_private.apply_membership_transition().
8. The store_claims status update to claimed triggers store_claim_converts_referral.
9. The trigger calls inner_sanctum_referral_private.record_successful_referral_conversion().
10. record_successful_referral_conversion() inserts into public.inner_sanctum_referral_conversions and public.inner_sanctum_filth_events for A.
11. evaluate_filth_milestones() checks cumulative points and inserts any milestone rows that are newly earned.

What the admin must do afterward in the current implementation:
- No additional backend action is required to credit the referrer Filth; it happens automatically when the claim is marked claimed.
- If an admin wants to inspect or adjust the result, they can use /admin/referrals to review the conversion and Filth totals.
- There is no explicit “fulfill reward” action for milestone rewards in the inspected code. The reward is effectively represented as a row in public.inner_sanctum_member_filth_milestones; if a real non-milestone reward is needed, that is not implemented in the current code path.

---

# 5. Admin UX audit

## 5.1 Admin screens relevant to referrals and Filth

Relevant admin routes:
- /admin/members
- /admin/referrals
- /admin/store/orders/[id]
- /admin/store
- possibly /admin/store/products and /admin/store/claim-actions are supporting infrastructure

## 5.2 /admin/members workflow

What the admin sees:
- a table of all auth users with membership status, source, started_at, and action buttons
- status values are none, active, suspended, cancelled

What it actually does:
- calls app/admin/members/actions.ts -> transitionInnerSanctumMembership()
- it invokes public.admin_transition_inner_sanctum_membership(p_user_id, p_action, 'admin', null)

When used:
- grant a lifetime membership
- suspend an active membership
- restore a suspended membership
- cancel a membership

Classification:
- production functionality
- direct membership administration, not referral-specific

## 5.3 /admin/referrals workflow

What the admin sees:
- list of each referral row with member email, code, status, conversion count, Filth total, current level, milestones
- controls to enable/disable referral status
- a manual Filth adjustment form
- a test conversion form

What it actually does:
- setReferralStatus() updates public.inner_sanctum_referrals.status
- addFilthPoints() calls public.admin_add_filth_points()
- recordTestConversion() calls public.admin_record_test_referral_conversion()

When used:
- disable a referral code when a member is no longer permitted to refer
- apply manual Filth points to compensate or correct a member
- create a synthetic referral conversion for testing or debugging

Classification:
- production functionality for referral status and actual Filth adjustment
- testing/debug functionality for synthetic conversion

## 5.4 /admin/store/orders/[id] workflow

What the admin sees:
- commercial status, fulfillment state, key status, membership status
- an authorization block with source, time, key status
- actions to authorize, reissue, or revoke claim keys

What it actually does:
- authorizeStoreFulfillment() invokes public.admin_authorize_store_fulfillment()
- reissueStoreClaim() invokes public.admin_reissue_store_claim()
- revokeStoreClaim() invokes public.admin_revoke_store_claim()

When used:
- when a store order is eligible for membership fulfillment
- when the admin needs to generate a one-time claim token

Classification:
- operational but mixed with test/debug wording
- the UI itself warns that it is a “development/admin action” and does not represent payment-provider verification

## 5.5 Confusing or risky admin experience findings

The admin UX is more complicated than the business model suggests. Several issues stand out:

1. Referral and Filth management are mixed together in a single admin page
- The page contains both operational referral settings and manual Filth correction controls.
- There is no clear distinction between “actual business state” and “manual correction / test state.”

2. “Test conversion” is not clearly separated from real conversion
- The action name is “Record test conversion,” but the backend still creates a real referral_conversion row and Filth event.
- The code comments and warnings say it is synthetic, but the DB writes are normal conversion data with conversion_source='admin_test'.

3. Store claim and referral conversion are coupled through a trigger with a PayFast label
- The trigger uses conversion_source='payfast' even though there is no real PayFast payment verification in the logic.
- This is confusing because the UI and DB both imply a payment gateway relationship that the code does not actually enforce.

4. Referral and membership are coupled through active membership validity
- The system validates referral codes against an active membership and then allows conversion only when the order includes an inner_sanctum_membership lifetime item.
- This makes the referral system a member-specific feature with strong coupling to the current membership product.

5. Filth is split between event ledger and derived totals
- Administrators can see totals and derived next level, but not necessarily the exact original event sources unless they inspect the backend tables.
- The UI exposes a simple meter but not the event ledger in a user-friendly way.

6. Rewards are represented by milestone metadata but not a real reward lifecycle
- There are reward_type enum values and fulfilled_at fields, but the actual fulfilment workflow is not clearly surfaced in admin or member UX.

7. The admin experience exposes implementation details directly
- Actions show raw labels like authorization_id, claim_id, order_id, token_hash, conversion_id, source_reference, and level thresholds.
- This is operationally useful but not product-facing and can feel like database administration rather than customer-facing operations.

8. There are duplicate pathways to similar actions
- The referral page can add Filth manually.
- The store fulfillment page can authorize/reissue/revoke claims.
- Different pages operate on overlapping state without a single canonical “reward state” view.

## 5.6 Classification of admin/test functionality

Production/operational:
- admin_transition_inner_sanctum_membership
- admin_authorize_store_fulfillment
- admin_reissue_store_claim
- admin_revoke_store_claim
- setReferralStatus
- admin_add_filth_points

Testing/debugging or ambiguous:
- admin_record_test_referral_conversion
- admin_get_store_fulfillment is operational but mostly diagnostic
- the “development/admin action” text in claim controls
- explicit “testing only” copy on the referral conversion test form

---

# 6. Member referral experience

## 6.1 How members discover referrals

The primary discovery point is the Inner Sanctum “You” page:
- app/inner-sanctum/you/page.tsx
- It calls getInnerSanctumYouState() and renders <FilthMeter meter={state.filth} referralUrl={referralUrl} />

The referral URL is displayed in the Filth Meter section.

## 6.2 How members obtain their referral URL

The url is generated from:
- state.filth.referral_code from public.get_my_filth_meter()
- combined with origin and /?ref=${encodeURIComponent(code)}

The route is built in app/inner-sanctum/you/page.tsx and displayed in the FilthMeter component.

## 6.3 How they copy/share it

The UI is in components/filth-meter.tsx.

It exposes:
- a read-only code block showing the full referral URL
- a button labeled “Copy my link"
- clipboard write on click, with a temporary “Copied” state

This is the only direct member-facing referral-sharing control found.

## 6.4 How they see referral activity

The member UI currently shows:
- total successful_referrals count in the Filth Meter
- total Filth points
- current level name
- earned milestone names

What is not surfaced clearly:
- per-referral conversions
- order attribution details
- per-order store referral link status
- which referral led to which referrer conversion
- any merchant-side reward or fulfilment breakdown

## 6.5 How they see successful conversions

The only member-facing success signal is the count shown in FilthMeter:
- successful_referrals === 1 ? “One person followed you inside.” : `${successful_referrals} people followed you inside.`

This is a counter, not a detailed record.

## 6.6 How they see Filth earned from referrals

The total is displayed in the Filth Meter header:
- meter.filth_total
- also the current level and next threshold

The underlying event history is available in the DB but not surfaced in detail to members.

## 6.7 How they see rewards and fulfilments

There is no dedicated member reward dashboard found in the audited code.

The UI does show:
- earned milestone names in the FilthMeter
- membership/collectibles/benefits pages for inner-sanctum content

But it does not present a specific “referral rewards” or “fulfilment status” screen for referral rewards.

## 6.8 Backend data that is not surfaced clearly to members

The following are implemented in the DB but are not clearly surfaced to members:
- public.store_order_referrals
- public.inner_sanctum_referral_conversions
- public.inner_sanctum_filth_events
- public.inner_sanctum_member_filth_milestones.fulfilled_at
- milestone reward_type and reward_reference metadata
- direct manual admin Filth adjustments

This means the member experience is largely a summary/score view rather than a full activity ledger.

---

# 7. Store attribution boundary

## 7.1 Where referral attribution intersects the Store flow

The key intersection is:
- public.store_orders
- public.store_order_items
- public.store_order_referrals
- public.store_claims
- public.inner_sanctum_memberships
- public.inner_sanctum_referral_conversions

## 7.2 Safe boundary in the current implementation

The system currently treats a referral conversion as legitimate at the moment the order’s claim becomes claimed and the trigger runs.

This is the safest existing conversion boundary because:
- the order is already tied to a valid referral row
- the order contains a valid membership fulfillment item
- the claim exists and is in a claimed status
- the user is not the same as the referrer
- the conversion row is idempotent and unique

The relevant code is:
- supabase/migrations/20260913108000_automatic_referral_conversion_on_claim.sql
- inner_sanctum_referral_private.record_successful_referral_conversion()

This is the point where the system treats a referral conversion as real.

## 7.3 What is not the boundary

Not the boundary:
- public.create_public_store_order() order creation
- store order pending status alone
- raw payment state in public.store_orders
- payment-provider verification, because there is no actual payment-provider check in this referral logic

The “converted” boundary is not “paid,” but “membership claim completed.”

## 7.4 Why this matters for future affiliate work

This is a critical product boundary: the current referral model triggers conversion after claim, not after payment confirmation, and with a membership-specific product filter. That means future commission logic should not assume payment status is the conversion gate in this codebase without deliberate review.

---

# 8. Reuse assessment

## KEEP AS-IS

These are the most generic and useful pieces that already work without deep coupling to the current membership-specific semantics:
- public.inner_sanctum_referrals as a user-code registry
- public.store_order_referrals as attribution row on an order
- public.inner_sanctum_referral_conversions as a conversion ledger
- referral cookie validation flow in proxy.ts and referral-capture.tsx
- public.is_valid_inner_sanctum_referral_code() as a server-side validity check
- generic event ledger pattern in public.inner_sanctum_filth_events

## REUSE / EXTEND

Infrastructure that could support both member referral and future affiliate models with controlled extension:
- store_order_referrals as an attribution record
- referral cookie/value validation and first-touch browser persistence
- conversion ledger pattern keyed by order_id, referral_id, referrer_user_id, referred_user_id
- event ledger pattern for points/ledger entries

These are reusable, but they are not abstraction-complete, and they are currently embedded in the member/Filth specific business model.

## MEMBER-SPECIFIC

These are intentionally coupled to Inner Sanctum membership or Filth progression:
- public.inner_sanctum_memberships and all access checks around has_inner_sanctum_access()
- public.inner_sanctum_referrals being validated only against active Inner Sanctum memberships
- public.get_my_filth_meter()
- public.inner_sanctum_filth_levels / milestones
- public.inner_sanctum_member_filth_milestones
- conversion logic requiring the order item to be a lifetime membership item

## ADMIN / TEST TOOLING

This functionality exists primarily for testing, debugging, or manual intervention:
- public.admin_record_test_referral_conversion()
- app/admin/referrals/actions.ts -> recordTestConversion
- admin_add_filth_points()
- app/admin/store/claim-actions.ts authorize/reissue/revoke actions
- admin_get_store_fulfillment() as a diagnostic RPC

## LEGACY / POSSIBLY OBSOLETE

These appear to be partially designed or disconnected from the current primary flow:
- retreat_referral cookie in the retreat enquiries flow
- task/experience/special event_type values in inner_sanctum_filth_event_type with no current writer path in the audited code
- fulfilled_at and fulfillment_reference fields on member milestone rows without corresponding active lifecycle code
- the broad reward_type enum values for reward categories that are not yet implemented as end-to-end flows

---

# 9. Future affiliate compatibility

## 9.1 Could the existing attribution infrastructure support future affiliate capability?

Yes, part of it could support future affiliate logic, but not without separation.

Shared pieces:
- single user identity via auth.users
- browser-based attribution capture and cookie validation
- server-side order attribution via store_order_referrals
- conversion ledger via public.inner_sanctum_referral_conversions
- event ledger pattern via public.inner_sanctum_filth_events
- order-level conversion idempotency and self-referral prevention

What must remain separate:
- the current referral system is tied to one code row per member_id and active Inner Sanctum membership validation
- the current conversion logic assumes the referrer is a member and that the conversion’s reward is Filth points
- the current filth engine is member-progression specific, not a generic commission ledger
- there is no generic affiliate status or capability table
- there is no “approved affiliate” and no separate commission ledger or payout lifecycle

## 9.2 Important distinction

The existing system can likely support implementation of “affiliate identity + attribution + commission ledger” by reusing the order attribution and event ledger concepts, but it cannot represent affiliate status as a first-class capability today.

The current architecture permits only these independent dimensions as separate rows/tables:
- one membership record per user
- one admin flag row per user
- one referral code row per user

It does not currently model a multi-capability identity and a separate affiliate entity/approval model.

So the answer is:
- shared attribution mechanics: yes
- shared member-specific reward and Filth semantics: no
- generic affiliate capability model: not yet

---

# 10. Required output summary

## 10.1 Current architecture summary

The current implementation is a member-centric architecture built around:
- Supabase Auth for identity
- public.admin_users for admin allowlisting
- public.inner_sanctum_memberships for membership state
- public.inner_sanctum_referrals for referral codes
- public.store_order_referrals as order-level attribution
- public.inner_sanctum_referral_conversions as conversion ledger
- public.inner_sanctum_filth_events as Filth ledger
- store claim redemption as the operative membership grant path

The business rule in practice is:
- membership grants access
- referral code exists for a member
- sale order can be attributed
- claim redemption triggers conversion
- conversion awards Filth to the referrer
- milestone thresholds are evaluated from the cumulative event total

## 10.2 Relevant database schema

Key tables:
- public.admin_users
- public.inner_sanctum_memberships
- public.inner_sanctum_referrals
- public.store_order_referrals
- public.inner_sanctum_referral_conversions
- public.inner_sanctum_filth_events
- public.inner_sanctum_filth_settings
- public.inner_sanctum_filth_levels
- public.inner_sanctum_filth_milestones
- public.inner_sanctum_member_filth_milestones
- public.store_orders
- public.store_order_items
- public.store_fulfillment_authorizations
- public.store_claims

## 10.3 Relevant RPCs/functions/triggers

Key functions and triggers:
- retreat_private.is_retreat_admin()
- public.has_inner_sanctum_access()
- public.get_my_inner_sanctum_access()
- public.admin_transition_inner_sanctum_membership()
- public.create_public_store_order()
- public.is_valid_inner_sanctum_referral_code()
- public.get_my_filth_meter()
- public.admin_add_filth_points()
- public.admin_record_test_referral_conversion()
- inner_sanctum_referral_private.record_successful_referral_conversion()
- inner_sanctum_referral_private.evaluate_filth_milestones()
- public.redeem_store_claim()
- store_claim_converts_referral trigger

## 10.4 Relevant application routes and components

Primary relevant files:
- app/page.tsx
- app/signin/page.tsx
- app/actions/auth.ts
- app/inner-sanctum/page.tsx
- app/inner-sanctum/layout.tsx
- app/inner-sanctum/you/page.tsx
- components/filth-meter.tsx
- components/referral-capture.tsx
- app/actions/store.ts
- app/actions/store-claims.ts
- app/(public)/claim/[token]/page.tsx
- app/admin/members/page.tsx
- app/admin/members/actions.ts
- app/admin/referrals/page.tsx
- app/admin/referrals/actions.ts
- app/admin/store/orders/[id]/page.tsx
- app/admin/store/claim-actions.ts
- lib/auth.ts
- lib/inner-sanctum.ts
- lib/inner-sanctum-you.ts
- lib/supabase/proxy.ts

## 10.5 Identity and entitlement flow

Identity and entitlement flow today is:
- sign in with Supabase Auth
- determine admin eligibility via admin_users
- determine Inner Sanctum access via membership row and active check
- grant membership via store claim redemption or admin transition
- gate access through has_inner_sanctum_access() and DB policy checks

## 10.6 Complete referral lifecycle

Current referral lifecycle:
- retrieve referral code from member UI
- validate/refuse non-member or invalid codes
- store browser cookie
- order is created with referral code
- order is attributed to referrer
- claim triggers conversion
- conversion awards Filth to referrer
- milestone thresholds evaluate

## 10.7 Cookie and attribution lifecycle

Current cookie/attribution lifecycle:
- initial ref query param sets cookie if valid and not already set
- server validates and persists a 90-day httpOnly cookie
- order creation reads the cookie and creates store_order_referrals
- conversion occurs on claim, not on payment

## 10.8 Store conversion boundary

The current conversion boundary is the claimed membership claim, not commercial payment verification.

## 10.9 Filth Meter architecture

The Filth Meter is a derived score from the event ledger, layered with progress thresholds and milestone tracking.

## 10.10 Rewards/fulfilment architecture

There is no full reward/fulfilment system in the current code. The active concepts are:
- milestone definitions
- milestone award rows
- Filth points as referral reward
- membership claim as the conversion trigger

## 10.11 Current member UX

The current member UX is summary-based and centered on the Inner Sanctum “You” page and Filth Meter. It offers the referral link and a cumulative Filth score but not a detailed referral ledger or reward management view.

## 10.12 Current admin UX

The current admin UX revolves around:
- member management
- referral enable/disable
- Filth adjustment
- test conversion
- store order fulfillment and one-time claim key administration

## 10.13 Admin confusion/complexity findings

The admin experience is complicated because it mixes:
- operational state
- debugging/test state
- database-level implementation details
- a payment label on a claim-based conversion trigger
- a manual Filth ledger alongside a progression meter

## 10.14 Security and abuse protections

Current anti-abuse protections include:
- unique referral code and user_id constraints
- active membership validation on referral code
- no self-referrals
- order-unique referral attribution
- conversion unique by order and referred user
- server-side validation rather than trusting client input
- store claim validation and claim status checks

## 10.15 Classification

- KEEP AS-IS: referral code registry, order attribution, conversion ledger, cookie validation
- REUSE / EXTEND: attribution and event-ledger patterns
- MEMBER-SPECIFIC: membership access model, Filth progression, referral validation tied to active membership
- ADMIN / TEST TOOLING: test conversion, manual Filth adjustments, claim issuance/revocation
- LEGACY / POSSIBLY OBSOLETE: unimplemented task/experience/special event types, fulfillment placeholders, rewards metadata without an active fulfilment lifecycle

## 10.16 Affiliate compatibility assessment

The existing infrastructure can share the attribution and conversion mechanics, but it cannot yet model a future independent affiliate capability without a new abstraction. The code is still member-and-Filth-centric and tied to membership access and claim-triggered conversion.

## 10.17 Exact files likely involved in a future implementation

Likely input files for any future affiliate work:
- app/actions/store.ts
- app/actions/store-claims.ts
- app/admin/referrals/actions.ts
- app/admin/referrals/page.tsx
- app/admin/store/claim-actions.ts
- app/admin/store/orders/[id]/page.tsx
- app/(public)/claim/[token]/page.tsx
- components/referral-capture.tsx
- components/filth-meter.tsx
- components/store-claim-form.tsx
- lib/auth.ts
- lib/inner-sanctum.ts
- lib/inner-sanctum-you.ts
- lib/supabase/proxy.ts
- lib/database.types.ts
- supabase/migrations/20260911081131_inner_sanctum_membership_foundation.sql
- supabase/migrations/20260911085538_store_foundation_membership_product.sql
- supabase/migrations/20260911094905_store_claim_fulfillment_foundation.sql
- supabase/migrations/20260911145238_referral_filth_meter_foundation.sql
- supabase/migrations/20260913108000_automatic_referral_conversion_on_claim.sql

## Final assessment

The current system is a member referral + Filth progression feature that is layered onto a store claim and membership entitlement flow. It is working infrastructure for member attribution and member-based rewards, but it is not yet a general affiliate platform. The architecture already contains reusable attribution and ledger concepts, yet the product-specific assumptions are tightly coupled to Inner Sanctum membership access and the Filth Meter reward model.
