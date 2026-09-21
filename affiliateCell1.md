# Affiliate Cell 1 implementation

Implemented in the repository; not applied to the hosted Supabase database.
Apply the migration through the project's normal migration deployment process
to provision existing hosted members. Cell 2 has not been started.

## Migration and database objects

`supabase/migrations/20260919084950_affiliate_identity_foundation.sql` adds:

- `public.affiliate_account_status`: `active`, `suspended`, `closed`.
- `public.affiliate_accounts`: UUID identity, unique Auth user FK, status,
  lifecycle timestamps, latest accepted Terms version and acceptance timestamp.
- Constraints enforce the status/timestamp combinations, paired Terms fields,
  nonempty bounded version strings and one account per user. The unique user
  index also supports ownership reads and idempotent provisioning.
- `affiliate_private` schema with `ensure_account(uuid)`,
  `current_terms_version()` and the `set_updated_at()` trigger function.
- `affiliate_accounts_updated_at` trigger and own-account SELECT RLS policy.

The Auth FK follows the existing membership convention (`ON DELETE CASCADE`).
Membership cancellation/suspension does not delete or change Affiliate records.
`activated_at` records initial capability provisioning, not Terms acceptance.
There are no balances, payouts, commissions or membership fields on this table.

## Public RPC contract

`get_my_affiliate_state()` returns one row, including when no account exists:
`has_account`, nullable `affiliate_status`, `current_terms_version`, nullable
`accepted_terms_version`, nullable `terms_accepted_at`, and
`has_accepted_current_terms`. It has no provisioning side effects.

`accept_current_affiliate_terms(p_terms_version text, p_accept_terms boolean)`
serves both explicit Affiliate-only activation and existing-member acceptance.
It requires `true` and the current version (`affiliate-v1`). The version argument
protects against accepting newer Terms from a stale screen; the database constant
is the authority for what gets stored. There is no user-ID or timestamp argument.
The authenticated user is obtained from `auth.uid()`; acceptance time is `now()`.

The RPC creates a missing active account, or records consent on an existing active
account. It locks the account row and rejects suspended/closed accounts with
`affiliate_account_not_active`. Repeating acceptance of the same version preserves
both the original acceptance timestamp and the account identity. No membership,
Preview access, referral identity, Store order, Filth or milestone is created.

To revise Terms, change the private version constant in a later migration. Existing
accounts retain their identity and previous acceptance until explicit reacceptance.
The fields store the latest acceptance, not an append-only legal consent ledger.
The eventual consent UI must present the actual Terms corresponding to the version;
this cell does not author legal Terms or provide that UI.

Commercial readiness requires **both** active status and acceptance of current
Terms. A provisioned active account alone is not evidence of consent.

`lib/database.types.ts` includes the table, enum, state and RPC types. Client table
insert/update types are `never` to match the database mutation restrictions.

## Existing function changed

Only `inner_sanctum_private.apply_membership_transition(...)` is replaced.
The original validation, grants, suspension, restoration and cancellation semantics
remain intact. Internal provisioning is added before the already-active grant
return and after successful active grants/restores. `ensure_account` uses
`ON CONFLICT (user_id) DO NOTHING`: it never resets suspension/closure or consent.

`public.redeem_store_claim(...)` was inspected and is unchanged. Its successful
grant already calls the canonical membership boundary, so it inherits provisioning.

## Security and backfill

RLS allows authenticated users to SELECT only their own account. All client table
mutations are revoked. Private schema/function access is revoked from PUBLIC,
anon and authenticated. No client-facing status-management operation is added.
Privileged database operations remain responsible for suspension/closure and
must supply valid lifecycle timestamps.

The two public RPCs follow the existing project's authenticated SECURITY DEFINER
pattern: empty search path, fully qualified objects, explicit `auth.uid()` guard,
PUBLIC/anon execution revoked and authenticated execution explicitly granted.
This follows Supabase's [function privilege guidance](https://supabase.com/docs/guides/database/functions)
and [ownership RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Backfill inserts only active, unexpired memberships. Both Terms fields remain NULL.
The backfill statement is idempotent and preserves any preexisting Affiliate row.
DDL follows the repository's once-only, versioned migration convention. Existing
membership, referral codes, Filth, Store and conversion rows are not updated.

## Verification

`tests/affiliate-identity.test.ts` runs real SQL in isolated PGlite PostgreSQL with
pgcrypto, using the existing membership, Store, referral, Filth and claim-conversion
migrations plus the new migration. Only Supabase-owned Auth primitives are supplied
by the harness. PGlite 0.5.8 is pinned as a development dependency.

The tests cover pre-migration active membership with a generated referral code,
existing Filth, Store order and conversion history; exact before/after domain
snapshots; actual backfill replay; grants, grant retries and restore provisioning;
Affiliate-only activation; explicit member consent; timestamp idempotency; RLS and
mutation denial; anonymous/unauthenticated denial; suspension/closure independence;
Terms revision; and database constraints.

A Store regression test verifies claim redemption provisions an Affiliate without
consent and still creates exactly one referral conversion and Filth award. It also
verifies membership-based referral validity remains unchanged when the referrer's
Affiliate is closed, and the order's existing pending payment status is preserved.

Checks: `npm test` (65 passing), `npm run lint`, `npx tsc --noEmit`, and
`git diff --check`. The local Docker daemon was unavailable, so the existing
Docker-dependent pgTAP suites and hosted Supabase advisors were not run. The
isolated tests do not exercise PostgREST/JWT transport or multi-connection races.

## Preserved scope and Cell 2 considerations

No changes to referral code generation, membership-based referral validity,
90-day cookies, first-touch attribution, Store attribution, Filth Meter,
milestones, `store_claim_converts_referral`, claim conversion, or payment/PayGate
behavior. No routes, navigation, dashboards or admin Affiliate UI were added.

Cell 2 must explicitly address the existing membership-bound referral machinery:
an Affiliate-only user has no referral code from this foundation, while an active
member whose Affiliate is suspended/closed still has a valid existing referral
code. That is intentional preservation of Cell 1's contract, verified by tests.
Conversion still occurs at claim redemption, not verified payment. No architectural
conflict requiring a change to the locked product contract was found.
