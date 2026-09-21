-- Cell 1: independent Affiliate identity. No referral or payment changes.
create schema if not exists affiliate_private;
revoke all on schema affiliate_private from public, anon, authenticated;

create type public.affiliate_account_status as enum ('active', 'suspended', 'closed');
create table public.affiliate_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status public.affiliate_account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  suspended_at timestamptz,
  closed_at timestamptz,
  accepted_terms_version text,
  terms_accepted_at timestamptz,
  constraint affiliate_accounts_terms_pair check (
    (accepted_terms_version is null and terms_accepted_at is null)
    or (accepted_terms_version is not null and terms_accepted_at is not null
      and length(trim(accepted_terms_version)) between 1 and 100)
  ),
  constraint affiliate_accounts_status_timestamps check (
    (status = 'active' and suspended_at is null and closed_at is null)
    or (status = 'suspended' and suspended_at is not null and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  )
);
alter table public.affiliate_accounts enable row level security;
revoke all on public.affiliate_accounts from public, anon, authenticated;
grant select on public.affiliate_accounts to authenticated;
create policy "Affiliates read their own account"
  on public.affiliate_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

create function affiliate_private.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function affiliate_private.set_updated_at() from public, anon, authenticated;
create trigger affiliate_accounts_updated_at before update on public.affiliate_accounts
  for each row execute function affiliate_private.set_updated_at();

-- A future migration replaces this constant; accounts retain their identity.
create function affiliate_private.current_terms_version()
returns text language sql immutable security invoker set search_path = '' as $$
  select 'affiliate-v1'::text;
$$;
revoke all on function affiliate_private.current_terms_version() from public, anon, authenticated;

-- Internal only. Never changes existing status or records Terms acceptance.
create function affiliate_private.ensure_account(target_user_id uuid)
returns void language sql security invoker set search_path = '' as $$
  insert into public.affiliate_accounts (user_id) values (target_user_id)
  on conflict (user_id) do nothing;
$$;
revoke all on function affiliate_private.ensure_account(uuid) from public, anon, authenticated;

-- Explicit acceptance is also automatic Affiliate-only activation. The supplied
-- version is a stale-screen guard, never the authority for the stored version.
create function public.accept_current_affiliate_terms(p_terms_version text, p_accept_terms boolean)
returns public.affiliate_accounts
language plpgsql security definer set search_path = '' as $$
declare
  target_user_id uuid := auth.uid();
  current_version text := affiliate_private.current_terms_version();
  account public.affiliate_accounts%rowtype;
begin
  if target_user_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_accept_terms is distinct from true then
    raise exception 'affiliate_terms_acceptance_required' using errcode = '22023';
  end if;
  if p_terms_version is distinct from current_version then
    raise exception 'affiliate_terms_version_mismatch' using errcode = '22023';
  end if;

  perform affiliate_private.ensure_account(target_user_id);
  select * into account from public.affiliate_accounts
    where user_id = target_user_id for update;
  if account.status <> 'active' then
    raise exception 'affiliate_account_not_active' using errcode = '42501';
  end if;
  if account.accepted_terms_version is distinct from current_version then
    update public.affiliate_accounts set
      accepted_terms_version = current_version, terms_accepted_at = now()
    where id = account.id returning * into account;
  end if;
  return account;
end;
$$;
revoke all on function public.accept_current_affiliate_terms(text, boolean) from public, anon, authenticated;
grant execute on function public.accept_current_affiliate_terms(text, boolean) to authenticated;

create function public.get_my_affiliate_state()
returns table (
  has_account boolean, affiliate_status public.affiliate_account_status,
  current_terms_version text, accepted_terms_version text,
  terms_accepted_at timestamptz, has_accepted_current_terms boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query select a.id is not null, a.status,
    affiliate_private.current_terms_version(), a.accepted_terms_version,
    a.terms_accepted_at,
    coalesce(a.accepted_terms_version = affiliate_private.current_terms_version()
      and a.terms_accepted_at is not null, false)
  from (select 1) as singleton
  left join public.affiliate_accounts a on a.user_id = auth.uid();
end;
$$;
revoke all on function public.get_my_affiliate_state() from public, anon, authenticated;
grant execute on function public.get_my_affiliate_state() to authenticated;

-- Existing active membership grants capability, never consent. Conflicts retain
-- all existing Affiliate state, including suspension/closure and acceptance.
insert into public.affiliate_accounts (user_id)
select user_id from public.inner_sanctum_memberships
where status = 'active' and (expires_at is null or expires_at > now())
on conflict (user_id) do nothing;

-- Canonical membership boundary; preserve all original transition semantics.
create or replace function inner_sanctum_private.apply_membership_transition(
  target_user_id uuid,
  requested_action text,
  requested_source public.inner_sanctum_membership_source,
  requested_source_reference text,
  actor_user_id uuid
)
returns public.inner_sanctum_memberships
language plpgsql
security invoker
set search_path = ''
as $$
declare
  membership public.inner_sanctum_memberships%rowtype;
begin
  if target_user_id is null
    or not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if actor_user_id is null or (
    requested_source_reference is not null
    and length(trim(requested_source_reference)) not between 1 and 200
  ) then
    raise exception 'invalid_membership_transition' using errcode = '22023';
  end if;

  select * into membership
  from public.inner_sanctum_memberships
  where user_id = target_user_id
  for update;

  if requested_action = 'grant' then
    if membership.id is not null and membership.status = 'active'
      and (membership.expires_at is null or membership.expires_at > now()) then
      perform affiliate_private.ensure_account(target_user_id);
      return membership;
    end if;

    insert into public.inner_sanctum_memberships (
      user_id, status, membership_type, source, source_reference, started_at,
      expires_at, suspended_at, cancelled_at, last_changed_by
    ) values (
      target_user_id, 'active', 'lifetime', requested_source,
      nullif(trim(requested_source_reference), ''), now(), null, null, null, actor_user_id
    )
    on conflict (user_id) do update set
      status = 'active', membership_type = 'lifetime', source = excluded.source,
      source_reference = excluded.source_reference, started_at = now(), expires_at = null,
      suspended_at = null, cancelled_at = null, last_changed_by = actor_user_id,
      updated_at = now()
    returning * into membership;
  elsif requested_action = 'suspend' then
    if membership.id is null then raise exception 'membership_not_found' using errcode = 'P0002'; end if;
    if membership.status <> 'suspended' then
      update public.inner_sanctum_memberships set
        status = 'suspended', suspended_at = now(), cancelled_at = null,
        last_changed_by = actor_user_id, updated_at = now()
      where id = membership.id returning * into membership;
    end if;
  elsif requested_action = 'restore' then
    if membership.id is null then raise exception 'membership_not_found' using errcode = 'P0002'; end if;
    if membership.status = 'cancelled' then raise exception 'cancelled_membership_requires_grant' using errcode = '22023'; end if;
    if membership.status <> 'active' then
      update public.inner_sanctum_memberships set
        status = 'active', suspended_at = null, cancelled_at = null,
        last_changed_by = actor_user_id, updated_at = now()
      where id = membership.id returning * into membership;
    end if;
  elsif requested_action = 'cancel' then
    if membership.id is null then raise exception 'membership_not_found' using errcode = 'P0002'; end if;
    if membership.status <> 'cancelled' then
      update public.inner_sanctum_memberships set
        status = 'cancelled', cancelled_at = now(), suspended_at = null,
        last_changed_by = actor_user_id, updated_at = now()
      where id = membership.id returning * into membership;
    end if;
  else
    raise exception 'invalid_membership_action' using errcode = '22023';
  end if;

  if requested_action in ('grant', 'restore') and membership.status = 'active'
    and (membership.expires_at is null or membership.expires_at > now()) then
    perform affiliate_private.ensure_account(target_user_id);
  end if;
  return membership;
end;
$$;
revoke all on function inner_sanctum_private.apply_membership_transition(
  uuid, text, public.inner_sanctum_membership_source, text, uuid
) from public, anon, authenticated;


