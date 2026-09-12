create type public.store_fulfillment_authorization_source as enum ('admin', 'payfast');
create type public.store_claim_status as enum ('available', 'claimed', 'revoked');

create table public.store_fulfillment_authorizations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.store_orders(id) on delete restrict,
  source public.store_fulfillment_authorization_source not null,
  source_reference text,
  authorized_by uuid references auth.users(id) on delete set null,
  authorized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint store_fulfillment_authorizations_source_reference_length check (
    source_reference is null or length(trim(source_reference)) between 1 and 200
  ),
  constraint store_fulfillment_authorizations_admin_actor check (
    source <> 'admin' or authorized_by is not null
  ),
  constraint store_fulfillment_authorizations_id_order_unique unique (id, order_id)
);

create table public.store_claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete restrict,
  authorization_id uuid not null,
  token_hash text not null unique,
  status public.store_claim_status not null default 'available',
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint store_claims_token_hash_format check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint store_claims_authorization_order_fkey foreign key (authorization_id, order_id)
    references public.store_fulfillment_authorizations(id, order_id) on delete restrict,
  constraint store_claims_state_consistency check (
    (status = 'available' and claimed_by is null and claimed_at is null and revoked_at is null)
    or (status = 'claimed' and claimed_by is not null and claimed_at is not null and revoked_at is null)
    or (status = 'revoked' and claimed_by is null and claimed_at is null and revoked_at is not null)
  )
);

create unique index store_claims_one_available_per_order_idx
  on public.store_claims (order_id) where status = 'available';
create unique index store_claims_one_claimed_per_order_idx
  on public.store_claims (order_id) where status = 'claimed';
create index store_claims_authorization_id_idx on public.store_claims (authorization_id);
create index store_claims_claimed_by_idx on public.store_claims (claimed_by);

alter table public.store_fulfillment_authorizations enable row level security;
alter table public.store_claims enable row level security;
revoke all on table public.store_fulfillment_authorizations, public.store_claims
  from public, anon, authenticated;

-- Shared, non-exposed canonical membership mutation core. Its callers own authorization.
create function inner_sanctum_private.apply_membership_transition(
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

  return membership;
end;
$$;
revoke all on function inner_sanctum_private.apply_membership_transition(
  uuid, text, public.inner_sanctum_membership_source, text, uuid
) from public, anon, authenticated;

create or replace function inner_sanctum_private.transition_membership(
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
begin
  if actor_user_id is null
    or actor_user_id is distinct from auth.uid()
    or not (select retreat_private.is_retreat_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return inner_sanctum_private.apply_membership_transition(
    target_user_id, requested_action, requested_source,
    requested_source_reference, actor_user_id
  );
end;
$$;
revoke all on function inner_sanctum_private.transition_membership(
  uuid, text, public.inner_sanctum_membership_source, text, uuid
) from public, anon, authenticated;

create function store_private.validate_claim_hash(p_token_hash text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_claim_hash' using errcode = '22023';
  end if;
end;
$$;
revoke all on function store_private.validate_claim_hash(text) from public, anon, authenticated;

create function store_private.assert_supported_order(p_order_id uuid)
returns public.store_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_order public.store_orders%rowtype;
begin
  select * into selected_order from public.store_orders where id = p_order_id for update;
  if selected_order.id is null then raise exception 'store_order_not_found' using errcode = 'P0002'; end if;
  if selected_order.status in ('cancelled', 'failed') then raise exception 'store_order_ineligible' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.store_order_items i
    where i.order_id = selected_order.id
      and i.fulfillment_type = 'inner_sanctum_membership'
      and i.fulfillment_reference = 'lifetime'
  ) then raise exception 'unsupported_store_fulfillment' using errcode = '22023'; end if;
  return selected_order;
end;
$$;
revoke all on function store_private.assert_supported_order(uuid) from public, anon, authenticated;

create function public.admin_authorize_store_fulfillment(
  p_order_id uuid,
  p_token_hash text,
  p_source_reference text default null
)
returns table (authorization_id uuid, claim_id uuid, claim_status public.store_claim_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_row public.store_fulfillment_authorizations%rowtype;
  claim_row public.store_claims%rowtype;
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform store_private.validate_claim_hash(p_token_hash);
  perform store_private.assert_supported_order(p_order_id);

  insert into public.store_fulfillment_authorizations (
    order_id, source, source_reference, authorized_by
  ) values (p_order_id, 'admin', nullif(trim(p_source_reference), ''), auth.uid())
  on conflict (order_id) do nothing
  returning * into auth_row;

  if auth_row.id is null then
    select * into auth_row from public.store_fulfillment_authorizations
      where order_id = p_order_id for update;
  end if;
  if exists (select 1 from public.store_claims where order_id = p_order_id and status = 'claimed') then
    raise exception 'store_order_already_claimed' using errcode = '22023';
  end if;
  if exists (select 1 from public.store_claims where order_id = p_order_id and status = 'available') then
    raise exception 'store_claim_already_available' using errcode = '22023';
  end if;

  insert into public.store_claims (order_id, authorization_id, token_hash)
  values (p_order_id, auth_row.id, p_token_hash)
  returning * into claim_row;
  return query select auth_row.id, claim_row.id, claim_row.status;
end;
$$;

create function public.admin_reissue_store_claim(p_order_id uuid, p_token_hash text)
returns table (claim_id uuid, claim_status public.store_claim_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_row public.store_fulfillment_authorizations%rowtype;
  claim_row public.store_claims%rowtype;
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform store_private.validate_claim_hash(p_token_hash);
  select * into auth_row from public.store_fulfillment_authorizations
    where order_id = p_order_id for update;
  if auth_row.id is null then raise exception 'fulfillment_not_authorized' using errcode = '22023'; end if;
  perform store_private.assert_supported_order(p_order_id);
  if exists (select 1 from public.store_claims where order_id = p_order_id and status = 'claimed') then
    raise exception 'store_order_already_claimed' using errcode = '22023';
  end if;
  update public.store_claims set status = 'revoked', revoked_at = now()
    where order_id = p_order_id and status = 'available';
  insert into public.store_claims (order_id, authorization_id, token_hash)
    values (p_order_id, auth_row.id, p_token_hash) returning * into claim_row;
  return query select claim_row.id, claim_row.status;
end;
$$;

create function public.admin_revoke_store_claim(p_order_id uuid)
returns public.store_claim_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_id uuid;
  changed_status public.store_claim_status;
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select id into auth_id from public.store_fulfillment_authorizations
    where order_id = p_order_id for update;
  if auth_id is null then raise exception 'fulfillment_not_authorized' using errcode = '22023'; end if;
  update public.store_claims set status = 'revoked', revoked_at = now()
    where order_id = p_order_id and status = 'available'
    returning status into changed_status;
  if changed_status is null then raise exception 'available_claim_not_found' using errcode = 'P0002'; end if;
  return changed_status;
end;
$$;

create function public.admin_get_store_fulfillment(p_order_id uuid)
returns table (
  authorization_id uuid, authorization_source public.store_fulfillment_authorization_source,
  source_reference text, authorized_at timestamptz, authorized_by uuid,
  claim_id uuid, claim_status public.store_claim_status, claim_created_at timestamptz,
  claimed_by uuid, claimed_email text, claimed_at timestamptz, revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select a.id, a.source, a.source_reference, a.authorized_at, a.authorized_by,
      c.id, c.status, c.created_at, c.claimed_by, u.email::text, c.claimed_at, c.revoked_at
    from public.store_fulfillment_authorizations a
    left join public.store_claims c on c.authorization_id = a.id
    left join auth.users u on u.id = c.claimed_by
    where a.order_id = p_order_id
    order by c.created_at desc nulls last;
end;
$$;

create function public.get_store_claim_state(p_token text)
returns table (claim_state text, product_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claim_row public.store_claims%rowtype;
  order_row public.store_orders%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return query select 'invalid'::text, null::text; return;
  end if;
  select * into claim_row from public.store_claims
    where token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
  if claim_row.id is null then return query select 'invalid'::text, null::text; return; end if;
  if claim_row.status = 'revoked' then return query select 'revoked'::text, null::text; return; end if;
  if claim_row.status = 'claimed' then return query select 'claimed'::text, null::text; return; end if;
  if claim_row.expires_at is not null and claim_row.expires_at <= now() then
    return query select 'invalid'::text, null::text; return;
  end if;
  select * into order_row from public.store_orders where id = claim_row.order_id;
  if order_row.id is null or order_row.status in ('cancelled', 'failed')
    or not exists (
      select 1 from public.store_fulfillment_authorizations a
      where a.id = claim_row.authorization_id and a.order_id = claim_row.order_id
    ) then
    return query select 'invalid'::text, null::text; return;
  end if;
  return query
    select 'available'::text, i.product_name
    from public.store_order_items i where i.order_id = claim_row.order_id;
end;
$$;

create function public.redeem_store_claim(p_token text)
returns table (redemption_state text, order_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  token_digest text;
  initial_claim public.store_claims%rowtype;
  claim_row public.store_claims%rowtype;
  auth_row public.store_fulfillment_authorizations%rowtype;
  order_row public.store_orders%rowtype;
  membership_row public.inner_sanctum_memberships%rowtype;
begin
  if target_user is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return query select 'invalid'::text, null::text; return;
  end if;
  token_digest := encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
  select * into initial_claim from public.store_claims where token_hash = token_digest;
  if initial_claim.id is null then return query select 'invalid'::text, null::text; return; end if;

  select * into auth_row from public.store_fulfillment_authorizations
    where id = initial_claim.authorization_id for update;
  select * into claim_row from public.store_claims where id = initial_claim.id for update;
  if claim_row.status = 'revoked' then return query select 'revoked'::text, null::text; return; end if;
  if claim_row.status = 'claimed' then return query select 'claimed'::text, null::text; return; end if;
  if claim_row.expires_at is not null and claim_row.expires_at <= now() then
    return query select 'invalid'::text, null::text; return;
  end if;
  if auth_row.id is null or auth_row.order_id <> claim_row.order_id then
    raise exception 'fulfillment_not_authorized' using errcode = '22023';
  end if;

  order_row := store_private.assert_supported_order(claim_row.order_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user::text, 0));

  select * into membership_row from public.inner_sanctum_memberships
    where user_id = target_user for update;
  if membership_row.id is not null and membership_row.status = 'active'
    and (membership_row.expires_at is null or membership_row.expires_at > now()) then
    return query select 'already_member'::text, order_row.order_reference; return;
  end if;
  if order_row.user_id is not null and order_row.user_id <> target_user then
    raise exception 'store_order_owned_by_another_user' using errcode = '42501';
  end if;

  membership_row := inner_sanctum_private.apply_membership_transition(
    target_user, 'grant', 'store', order_row.order_reference, target_user
  );
  update public.store_orders set user_id = target_user where id = order_row.id;
  update public.store_claims set status = 'claimed', claimed_by = target_user, claimed_at = now()
    where id = claim_row.id;
  return query select 'success'::text, order_row.order_reference;
end;
$$;

revoke all on function public.admin_authorize_store_fulfillment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_reissue_store_claim(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_revoke_store_claim(uuid) from public, anon, authenticated;
revoke all on function public.admin_get_store_fulfillment(uuid) from public, anon, authenticated;
revoke all on function public.get_store_claim_state(text) from public, anon, authenticated;
revoke all on function public.redeem_store_claim(text) from public, anon, authenticated;
grant execute on function public.admin_authorize_store_fulfillment(uuid, text, text) to authenticated;
grant execute on function public.admin_reissue_store_claim(uuid, text) to authenticated;
grant execute on function public.admin_revoke_store_claim(uuid) to authenticated;
grant execute on function public.admin_get_store_fulfillment(uuid) to authenticated;
grant execute on function public.get_store_claim_state(text) to anon, authenticated;
grant execute on function public.redeem_store_claim(text) to authenticated;
