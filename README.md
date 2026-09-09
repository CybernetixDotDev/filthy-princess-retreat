# Filthy Princess Retreat

The Retreat Launch MVP is a Next.js 16 application backed by Supabase. It includes the public retreat selection and enquiry journey, administrator-only operations, immutable quotes with private payment URLs, manual payment verification, and booking confirmation.

## Setup

1. Copy `.env.example` to `.env.local` and provide the Supabase project URL, publishable key, and deployed site URL.
2. Apply `supabase/migrations/20260908080833_retreat_launch_foundation.sql` and `supabase/migrations/20260908081729_retreat_foundation_policy_cleanup.sql` to the configured Supabase project.
3. Users may create an account through the **Sign up** mode on `/signin` when Supabase email signups are enabled. If signups are disabled, the page shows: "New account registration is currently unavailable."
4. Creating an account does not grant administrator access. To promote an administrator manually:
   - In Supabase Dashboard, open **Authentication -> Users**.
   - Copy the Auth user UUID.
   - Run this SQL in the project SQL editor:

```sql
insert into public.admin_users (user_id)
values ('AUTH-USER-UUID')
on conflict do nothing;
```

5. The promoted user can sign in normally and access `/admin`. Run `npm run dev` and add availability or group events from `/admin`.

The service-role key is intentionally not required. Browser and server requests use the publishable key, with authorization enforced by Supabase Auth, grants, and RLS.

## Commands

```bash
npm run lint
npx tsc --noEmit
npm run build
npx supabase test db
```

Local database tests require a running Docker engine and Supabase local stack.
