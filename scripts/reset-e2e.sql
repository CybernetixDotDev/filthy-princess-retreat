-- Local/pre-production E2E reset only.
-- Before running this file in Supabase SQL Editor, run these two statements
-- in the same database session:
--   SELECT set_config('app.e2e_environment', 'local', false);
--   SELECT set_config('app.e2e_reset_confirm', 'RESET_LOCAL_E2E', false);
--
-- With psql, run those statements first with -c, then execute this file:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -c "SELECT set_config('app.e2e_environment','local',false); SELECT set_config('app.e2e_reset_confirm','RESET_LOCAL_E2E',false);" \
--     -f scripts/reset-e2e.sql
--
-- This script preserves Admin users, catalogue/configuration, and schema. It does
-- not disable triggers or change normal application deletion behavior.

DO $$
BEGIN
  IF coalesce(current_setting('app.e2e_environment', true), '') <> 'local'
     OR coalesce(current_setting('app.e2e_reset_confirm', true), '') <> 'RESET_LOCAL_E2E' THEN
    RAISE EXCEPTION 'E2E reset refused: set app.e2e_environment=local and app.e2e_reset_confirm=RESET_LOCAL_E2E in this database session';
  END IF;
END
$$;

BEGIN;

-- Keep the Admin identity and Admin configuration intact. Membership rows are
-- the one user-owned table that cannot be truncated without touching Admin state.
DELETE FROM public.inner_sanctum_memberships
WHERE user_id NOT IN (SELECT user_id FROM public.admin_users);

-- TRUNCATE is intentional here: it removes test snapshots without firing the
-- normal row DELETE trigger store_private.protect_order_item_snapshot(). The
-- production immutability trigger itself is left unchanged and remains active
-- for all normal application operations.
TRUNCATE TABLE
  public.store_inventory_holds,
  public.retreat_booking_preparation,
  public.retreat_payment_submissions,
  public.retreat_invoices,
  public.retreat_holds,
  public.retreat_bookings,
  public.retreat_quotes,
  public.retreat_enquiries,
  public.retreat_event_interests,
  public.affiliate_commissions,
  public.affiliate_accounts,
  public.contribution_submissions,
  public.inner_sanctum_benefits,
  public.inner_sanctum_task_responses,
  public.inner_sanctum_member_collectibles,
  public.inner_sanctum_referral_conversions,
  public.store_order_referrals,
  public.inner_sanctum_filth_events,
  public.inner_sanctum_member_filth_milestones,
  public.inner_sanctum_referrals,
  public.store_claims,
  public.store_fulfillment_authorizations,
  public.store_order_items,
  public.store_orders
CASCADE;

-- Remove ordinary test identities only after their application rows are gone.
-- public.admin_users is the preservation allow-list; Admin users survive.
DELETE FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.admin_users);

DO $$
DECLARE
  remaining_non_admin_users integer;
  remaining_non_admin_memberships integer;
  expected_admin_users integer;
  remaining_admin_users integer;
  remaining_store_holds integer;
  remaining_store_orders integer;
  remaining_filth_events integer;
BEGIN
  SELECT count(*)::integer INTO remaining_non_admin_users
  FROM auth.users
  WHERE id NOT IN (SELECT user_id FROM public.admin_users);
  IF remaining_non_admin_users <> 0 THEN
    RAISE EXCEPTION 'E2E reset incomplete: % non-Admin auth users remain', remaining_non_admin_users;
  END IF;

  SELECT count(*)::integer INTO expected_admin_users
  FROM public.admin_users;
  SELECT count(*)::integer INTO remaining_admin_users
  FROM auth.users
  WHERE id IN (SELECT user_id FROM public.admin_users);
  IF remaining_admin_users <> expected_admin_users THEN
    RAISE EXCEPTION 'E2E reset incomplete: expected % Admin auth users, found %', expected_admin_users, remaining_admin_users;
  END IF;

  SELECT count(*)::integer INTO remaining_non_admin_memberships
  FROM public.inner_sanctum_memberships
  WHERE user_id NOT IN (SELECT user_id FROM public.admin_users);
  IF remaining_non_admin_memberships <> 0 THEN
    RAISE EXCEPTION 'E2E reset incomplete: % non-Admin membership rows remain', remaining_non_admin_memberships;
  END IF;

  SELECT count(*)::integer INTO remaining_store_holds
  FROM public.store_inventory_holds;
  IF remaining_store_holds <> 0 THEN
    RAISE EXCEPTION 'E2E reset incomplete: % Store inventory holds remain', remaining_store_holds;
  END IF;

  SELECT count(*)::integer INTO remaining_store_orders
  FROM public.store_orders;
  IF remaining_store_orders <> 0 THEN
    RAISE EXCEPTION 'E2E reset incomplete: % Store orders remain', remaining_store_orders;
  END IF;

  SELECT count(*)::integer INTO remaining_filth_events
  FROM public.inner_sanctum_filth_events;
  IF remaining_filth_events <> 0 THEN
    RAISE EXCEPTION 'E2E reset incomplete: % Filth ledger events remain', remaining_filth_events;
  END IF;
END
$$;

SELECT 'E2E reset complete; Admin users and catalogue/configuration preserved.' AS result;

COMMIT;
