# Auth routing defect audit

## Confirmed code cause

The generic entrance in `app/page.tsx` emitted both `/signin?next=/inner-sanctum`
and `/signin?mode=signup&next=/inner-sanctum`. The sign-in page copied this into
all three form submissions. `authenticatedDestination(next)` returned this safe
local path immediately, before `hasInnerSanctumAccess()` could run. Thus the
previous helper was reached, but its entitlement-aware default was skipped.

A second bypass in the same entrance redirected every authenticated non-admin
to `/inner-sanctum` without calling the destination helper.

## Completion paths audited

| Path | Previous override | Corrected behavior |
| --- | --- | --- |
| Password sign-in | Entrance query -> hidden next -> signIn -> explicit branch | Normalize legacy input, then canonical default |
| Immediate signup | Entrance query -> hidden next -> signUp session branch | Resolve entitlement on first completed authentication |
| Confirmation-required signup | signUp emailRedirectTo -> callback exchange -> explicit branch | Carry intentional returnTo, resolve default after exchange |
| Google sign-in/signup | Hidden next -> OAuth redirectTo -> callback exchange -> explicit branch | Same intentional-return/default policy |
| Existing session at /signin | Query next -> explicit branch | Same normalization and canonical default |
| Existing session at / | Hardcoded non-admin /inner-sanctum | Canonical destination; existing admin /admin behavior retained |
| Failed callback retry | next forwarded back to signin | Normalized returnTo survives retry |

`lib/supabase/proxy.ts` refreshes cookies and handles referral attribution; it
selects no auth destination. Root layout and Next config add no competing auth
redirect. No other auth completion route or constructed Inner Sanctum default
was found in app/components/lib.

## Intent compatibility

`lib/auth-return.ts` accepts safe `returnTo` values and legacy `next` values,
except the exact historical generic `next=/inner-sanctum`. That ambiguous old
value now means no explicit destination. This applies to old bookmarks, form
POSTs, and callbacks as well as current links.

An intentional request for the protected Inner Sanctum entrance now emits
`returnTo=/inner-sanctum`. The sign-in form, signup email callback, Google
callback and failure retry preserve this distinct field. Other existing next
journeys (contribute, checkout, claim, invite and protected subpages) remain
compatible. This is routing intent, not authorization; access gates remain in
place.

Retained Inner Sanctum auth references: the entitled default in
`lib/auth-destination.ts`, the intentional protected-layout return, and the
legacy-value comparison in `lib/auth-return.ts`. No generic Inner Sanctum auth
default remains. Claim-success and fulfilled-checkout links are intentional
post-fulfillment navigation and remain unchanged.

## Verification

`tests/auth-routing-chain.test.ts` executes the real page/form/action/callback
and canonical destination/entitlement modules with mocked Supabase responses.
It covers new signup (immediate and email confirmation), existing members and
non-members, Google initiation/completion, explicit returns, old entrance URLs,
stale form POSTs, existing sessions and callback retries. RPC assertions require
successful authentication before checking entitlement; an authenticated user
with false entitlement lands at /contribute.

Targeted suite: auth-routing-chain, auth-destination, google-auth and
store-claim-auth-continuation. Live Google/provider and production cookie
round-trips are not exercised by these tests. No entitlement, Contribution,
Affiliate, Store or teaser rules were changed; the separate contribute render
error was not investigated.
