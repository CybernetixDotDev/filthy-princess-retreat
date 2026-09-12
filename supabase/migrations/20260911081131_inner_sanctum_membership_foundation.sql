-- FP-2: Inner Sanctum membership foundation.
create type public.inner_sanctum_membership_status as enum (
  'active',
  'suspended',
  'cancelled'
);

create type public.inner_sanctum_membership_type as enum ('lifetime');

create type public.inner_sanctum_membership_source as enum (
  'admin',
  'store',
  'promotion',
  'migration'
);

create table public.inner_sanctum_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status public.inner_sanctum_membership_status not null default 'active',
  membership_type public.inner_sanctum_membership_type not null default 'lifetime',
  source public.inner_sanctum_membership_source not null,
  source_reference text,
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  last_changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inner_sanctum_memberships_source_reference_length
    check (source_reference is null or length(source_reference) between 1 and 200),
  constraint inner_sanctum_memberships_lifetime_expiry
    check (membership_type <> 'lifetime' or expires_at is null),
  constraint inner_sanctum_memberships_status_timestamps
    check (
      (status = 'active' and suspended_at is null and cancelled_at is null)
      or (status = 'suspended' and suspended_at is not null and cancelled_at is null)
      or (status = 'cancelled' and cancelled_at is not null)
    )
);

create index inner_sanctum_memberships_status_idx
  on public.inner_sanctum_memberships (status);
create index inner_sanctum_memberships_last_changed_by_idx
  on public.inner_sanctum_memberships (last_changed_by);
create unique index inner_sanctum_memberships_source_reference_uidx
  on public.inner_sanctum_memberships (source, source_reference)
  where source_reference is not null;

alter table public.inner_sanctum_memberships enable row level security;
revoke all on table public.inner_sanctum_memberships from anon, authenticated;
grant select on table public.inner_sanctum_memberships to authenticated;

create policy "members read their own Inner Sanctum membership"
  on public.inner_sanctum_memberships
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create schema if not exists inner_sanctum_private;
revoke all on schema inner_sanctum_private from public, anon, authenticated;

create function inner_sanctum_private.transition_membership(
  target_user_id uuid,
  requested_action text,
  requested_source public.inner_sanctum_membership_source,
  requested_source_reference text,
  actor_user_id uuid
)
returns public.inner_sanctum_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.inner_sanctum_memberships%rowtype;
begin
  if actor_user_id is null
    or actor_user_id is distinct from auth.uid()
    or not (select retreat_private.is_retreat_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if target_user_id is null
    or not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if requested_source_reference is not null
    and length(trim(requested_source_reference)) not between 1 and 200 then
    raise exception 'invalid_source_reference' using errcode = '22023';
  end if;

  select * into membership
  from public.inner_sanctum_memberships
  where user_id = target_user_id
  for update;

  if requested_action = 'grant' then
    if membership.id is not null and membership.status = 'active'
      and (membership.expires_at is null or membership.expires_at > now()) then
      return membership;
    end if;

    insert into public.inner_sanctum_memberships (
      user_id,
      status,
      membership_type,
      source,
      source_reference,
      started_at,
      expires_at,
      suspended_at,
      cancelled_at,
      last_changed_by
    ) values (
      target_user_id,
      'active',
      'lifetime',
      requested_source,
      nullif(trim(requested_source_reference), ''),
      now(),
      null,
      null,
      null,
      actor_user_id
    )
    on conflict (user_id) do update set
      status = 'active',
      membership_type = 'lifetime',
      source = excluded.source,
      source_reference = excluded.source_reference,
      started_at = now(),
      expires_at = null,
      suspended_at = null,
      cancelled_at = null,
      last_changed_by = actor_user_id,
      updated_at = now()
    returning * into membership;
  elsif requested_action = 'suspend' then
    if membership.id is null then
      raise exception 'membership_not_found' using errcode = 'P0002';
    end if;
    if membership.status <> 'suspended' then
      update public.inner_sanctum_memberships set
        status = 'suspended',
        suspended_at = now(),
        cancelled_at = null,
        last_changed_by = actor_user_id,
        updated_at = now()
      where id = membership.id
      returning * into membership;
    end if;
  elsif requested_action = 'restore' then
    if membership.id is null then
      raise exception 'membership_not_found' using errcode = 'P0002';
    end if;
    if membership.status = 'cancelled' then
      raise exception 'cancelled_membership_requires_grant' using errcode = '22023';
    end if;
    if membership.status <> 'active' then
      update public.inner_sanctum_memberships set
        status = 'active',
        suspended_at = null,
        cancelled_at = null,
        last_changed_by = actor_user_id,
        updated_at = now()
      where id = membership.id
      returning * into membership;
    end if;
  elsif requested_action = 'cancel' then
    if membership.id is null then
      raise exception 'membership_not_found' using errcode = 'P0002';
    end if;
    if membership.status <> 'cancelled' then
      update public.inner_sanctum_memberships set
        status = 'cancelled',
        cancelled_at = now(),
        suspended_at = null,
        last_changed_by = actor_user_id,
        updated_at = now()
      where id = membership.id
      returning * into membership;
    end if;
  else
    raise exception 'invalid_membership_action' using errcode = '22023';
  end if;

  return membership;
end;
$$;

revoke all on function inner_sanctum_private.transition_membership(
  uuid,
  text,
  public.inner_sanctum_membership_source,
  text,
  uuid
) from public, anon, authenticated;

create function public.admin_transition_inner_sanctum_membership(
  p_user_id uuid,
  p_action text,
  p_source public.inner_sanctum_membership_source default 'admin',
  p_source_reference text default null
)
returns public.inner_sanctum_memberships
language sql
security definer
set search_path = ''
as $$
  select inner_sanctum_private.transition_membership(
    p_user_id,
    p_action,
    p_source,
    p_source_reference,
    auth.uid()
  );
$$;

revoke all on function public.admin_transition_inner_sanctum_membership(
  uuid,
  text,
  public.inner_sanctum_membership_source,
  text
) from public, anon, authenticated;
grant execute on function public.admin_transition_inner_sanctum_membership(
  uuid,
  text,
  public.inner_sanctum_membership_source,
  text
) to authenticated;

create function public.has_inner_sanctum_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.inner_sanctum_memberships
    where user_id = (select auth.uid())
      and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.has_inner_sanctum_access() from public, anon, authenticated;
grant execute on function public.has_inner_sanctum_access() to authenticated;

create function public.get_my_inner_sanctum_access()
returns table (
  has_access boolean,
  membership_status public.inner_sanctum_membership_status,
  membership_type public.inner_sanctum_membership_type,
  started_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.status = 'active' and (m.expires_at is null or m.expires_at > now()),
    m.status,
    m.membership_type,
    m.started_at,
    m.expires_at
  from public.inner_sanctum_memberships m
  where m.user_id = (select auth.uid());
$$;

revoke all on function public.get_my_inner_sanctum_access() from public, anon, authenticated;
grant execute on function public.get_my_inner_sanctum_access() to authenticated;

create function public.admin_list_inner_sanctum_members()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  membership_id uuid,
  membership_status public.inner_sanctum_membership_status,
  membership_type public.inner_sanctum_membership_type,
  membership_source public.inner_sanctum_membership_source,
  source_reference text,
  started_at timestamptz,
  expires_at timestamptz,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select retreat_private.is_retreat_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.created_at,
    m.id,
    m.status,
    m.membership_type,
    m.source,
    m.source_reference,
    m.started_at,
    m.expires_at,
    m.suspended_at,
    m.cancelled_at,
    m.updated_at
  from auth.users u
  left join public.inner_sanctum_memberships m on m.user_id = u.id
  order by lower(coalesce(u.email, '')), u.created_at;
end;
$$;

revoke all on function public.admin_list_inner_sanctum_members()
  from public, anon, authenticated;
grant execute on function public.admin_list_inner_sanctum_members()
  to authenticated;
