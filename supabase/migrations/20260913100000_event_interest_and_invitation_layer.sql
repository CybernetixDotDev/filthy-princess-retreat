alter table public.retreat_events
  add column invitation_only boolean not null default false,
  add column interest_enabled boolean not null default false;

drop function if exists public.create_retreat_event(text, uuid, date, date, smallint, public.event_status, text);
drop function if exists public.update_retreat_event(uuid, text, date, date, smallint, public.event_status, text);

create function public.create_retreat_event(
  p_title text, p_product_id uuid, p_start_date date, p_end_date date,
  p_capacity smallint, p_status public.event_status, p_description text,
  p_invitation_only boolean default false, p_interest_enabled boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare event_id uuid;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  if p_capacity <= 0 or p_end_date < p_start_date then raise exception 'Invalid event details'; end if;
  perform pg_catalog.pg_advisory_xact_lock(735391);
  if p_status = 'published' and exists (select 1 from public.retreat_events e where e.status = 'published' and e.start_date <= p_end_date and e.end_date >= p_start_date) then raise exception 'These dates overlap another published event.'; end if;
  if p_status = 'published' and exists (select 1 from public.retreat_bookings b where b.retreat_event_id is null and b.booking_status in ('confirmed', 'completed') and b.start_date <= p_end_date and coalesce(b.end_date, b.start_date) >= p_start_date) then raise exception 'These dates are already occupied by a private retreat.'; end if;
  insert into public.retreat_events(title, retreat_product_id, retreat_format, start_date, end_date, capacity, available_places, status, description, invitation_only, interest_enabled)
  values (p_title, p_product_id, 'join_a_group', p_start_date, p_end_date, p_capacity, p_capacity, p_status, nullif(p_description, ''), p_invitation_only, p_interest_enabled)
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function public.create_retreat_event(text, uuid, date, date, smallint, public.event_status, text, boolean, boolean) from public, anon;
grant execute on function public.create_retreat_event(text, uuid, date, date, smallint, public.event_status, text, boolean, boolean) to authenticated;

create function public.update_retreat_event(
  p_event_id uuid, p_title text, p_start_date date, p_end_date date,
  p_capacity smallint, p_status public.event_status, p_description text,
  p_invitation_only boolean default false, p_interest_enabled boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.retreat_events%rowtype; confirmed smallint; held smallint;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  select * into event_row from public.retreat_events where id = p_event_id for update;
  if event_row.id is null then raise exception 'Event not found'; end if;
  select coalesce(sum(guest_count), 0)::smallint into confirmed from public.retreat_bookings where retreat_event_id = event_row.id and booking_status in ('confirmed', 'completed');
  select coalesce(sum(guest_count), 0)::smallint into held from public.retreat_holds where retreat_event_id = event_row.id and status = 'active' and expires_at > now();
  if p_capacity < confirmed + held then raise exception 'Capacity cannot be lower than committed or held places'; end if;
  perform pg_catalog.pg_advisory_xact_lock(735391);
  if event_row.status = 'published' and (p_start_date <> event_row.start_date or p_end_date <> event_row.end_date) and confirmed + held > 0 then raise exception 'Event dates cannot change while guest commitments exist'; end if;
  if event_row.status = 'published' and p_status = 'draft' and confirmed + held > 0 then raise exception 'Committed events cannot be unpublished'; end if;
  if p_status = 'published' and exists (select 1 from public.retreat_events e where e.id <> event_row.id and e.status = 'published' and e.start_date <= p_end_date and e.end_date >= p_start_date) then raise exception 'These dates overlap another published event.'; end if;
  if p_status = 'published' and exists (select 1 from public.retreat_bookings b where b.retreat_event_id is null and b.booking_status in ('confirmed', 'completed') and b.start_date <= p_end_date and coalesce(b.end_date, b.start_date) >= p_start_date) then raise exception 'These dates are already occupied by a private retreat.'; end if;
  update public.retreat_events set title = p_title, start_date = p_start_date, end_date = p_end_date, capacity = p_capacity, available_places = greatest(0, p_capacity - confirmed), status = p_status, description = nullif(p_description, ''), invitation_only = p_invitation_only, interest_enabled = p_interest_enabled where id = p_event_id;
end;
$$;
revoke all on function public.update_retreat_event(uuid, text, date, date, smallint, public.event_status, text, boolean, boolean) from public, anon;
grant execute on function public.update_retreat_event(uuid, text, date, date, smallint, public.event_status, text, boolean, boolean) to authenticated;

alter table public.inner_sanctum_benefits
  add column retreat_event_id uuid references public.retreat_events(id) on delete set null;

create index inner_sanctum_benefits_event_idx
  on public.inner_sanctum_benefits(retreat_event_id)
  where retreat_event_id is not null;

create unique index inner_sanctum_benefits_event_invitation_uidx
  on public.inner_sanctum_benefits(retreat_event_id, user_id)
  where retreat_event_id is not null and type in ('invitation', 'event', 'retreat');

create table public.retreat_event_interests (
  id uuid primary key default gen_random_uuid(),
  retreat_event_id uuid not null references public.retreat_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text,
  status text not null default 'interested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text,
  constraint retreat_event_interests_status check (status in ('interested', 'selected', 'not_selected', 'withdrawn')),
  constraint retreat_event_interests_message_length check (message is null or char_length(message) <= 2000),
  constraint retreat_event_interests_admin_notes_length check (admin_notes is null or char_length(admin_notes) <= 10000),
  unique (retreat_event_id, user_id)
);

create index retreat_event_interests_event_idx
  on public.retreat_event_interests(retreat_event_id, status, created_at);
create index retreat_event_interests_user_idx
  on public.retreat_event_interests(user_id, created_at desc);

create trigger retreat_event_interests_updated_at
before update on public.retreat_event_interests
for each row execute function public.retreat_set_updated_at();

alter table public.retreat_event_interests enable row level security;
revoke all on public.retreat_event_interests from anon, authenticated;
grant select on public.retreat_event_interests to authenticated;

create policy "members read own event interests"
on public.retreat_event_interests for select to authenticated
using (((user_id = (select auth.uid())) and (select public.has_inner_sanctum_access())) or (select retreat_private.is_retreat_admin()));

create or replace function public.express_interest_in_retreat_event(
  p_event_id uuid,
  p_message text default null
)
returns table (interest_id uuid, interest_status text)
language plpgsql security definer set search_path = ''
as $$
declare
  event_row public.retreat_events%rowtype;
  existing public.retreat_event_interests%rowtype;
  member_id uuid := auth.uid();
begin
  if member_id is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'event_interest_unavailable' using errcode = '42501';
  end if;
  if p_message is not null and char_length(trim(p_message)) > 2000 then
    raise exception 'event_interest_unavailable' using errcode = '22023';
  end if;

  select * into event_row
  from public.retreat_events
  where id = p_event_id
    and status = 'published'
    and start_date >= current_date
    and invitation_only = true
    and interest_enabled = true;
  if event_row.id is null then
    raise exception 'event_interest_unavailable' using errcode = '22023';
  end if;

  select * into existing
  from public.retreat_event_interests
  where retreat_event_id = p_event_id and user_id = member_id
  for update;

  if existing.id is not null then
    if existing.status = 'withdrawn' then
      update public.retreat_event_interests
      set status = 'interested', message = nullif(trim(p_message), ''), reviewed_at = null, reviewed_by = null, admin_notes = null, updated_at = now()
      where id = existing.id;
      return query select existing.id, 'interested'::text;
    end if;
    return query select existing.id, existing.status;
    return;
  end if;

  insert into public.retreat_event_interests(retreat_event_id, user_id, message)
  values (p_event_id, member_id, nullif(trim(p_message), ''))
  returning id, status into interest_id, interest_status;
  return next;
end;
$$;
revoke all on function public.express_interest_in_retreat_event(uuid, text) from public, anon;
grant execute on function public.express_interest_in_retreat_event(uuid, text) to authenticated;

create or replace function public.admin_list_retreat_event_interests(p_event_id uuid)
returns table (
  id uuid,
  retreat_event_id uuid,
  user_id uuid,
  member_email text,
  message text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  admin_notes text,
  invitation_id uuid,
  invitation_status public.inner_sanctum_benefit_status,
  invitation_response public.inner_sanctum_benefit_response
)
language sql security definer set search_path = ''
as $$
  select i.id, i.retreat_event_id, i.user_id, u.email, i.message, i.status,
    i.created_at, i.updated_at, i.reviewed_at, i.reviewed_by, i.admin_notes,
    b.id, b.status, b.response
  from public.retreat_event_interests i
  join auth.users u on u.id = i.user_id
  left join public.inner_sanctum_benefits b
    on b.retreat_event_id = i.retreat_event_id
   and b.user_id = i.user_id
   and b.type in ('invitation', 'event', 'retreat')
  where i.retreat_event_id = p_event_id
    and (select retreat_private.is_retreat_admin())
  order by i.created_at asc;
$$;
revoke all on function public.admin_list_retreat_event_interests(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_retreat_event_interests(uuid) to authenticated;

create or replace function public.admin_set_retreat_event_interest_status(
  p_interest_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
begin
  if admin_id is null or not (select retreat_private.is_retreat_admin()) then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('interested', 'selected', 'not_selected', 'withdrawn') then
    raise exception 'Invalid interest status';
  end if;
  if p_admin_notes is not null and char_length(trim(p_admin_notes)) > 10000 then
    raise exception 'Admin notes are too long';
  end if;
  update public.retreat_event_interests
  set status = p_status,
      admin_notes = nullif(trim(p_admin_notes), ''),
      reviewed_at = case when p_status = 'interested' then null else now() end,
      reviewed_by = case when p_status = 'interested' then null else admin_id end,
      updated_at = now()
  where id = p_interest_id;
  if not found then raise exception 'Interest not found'; end if;
  return p_status;
end;
$$;
revoke all on function public.admin_set_retreat_event_interest_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_retreat_event_interest_status(uuid, text, text) to authenticated;

create or replace function public.admin_create_retreat_event_invitation(p_interest_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  interest_row public.retreat_event_interests%rowtype;
  event_row public.retreat_events%rowtype;
  benefit_id uuid;
begin
  if admin_id is null or not (select retreat_private.is_retreat_admin()) then
    raise exception 'Not authorized';
  end if;
  select * into interest_row from public.retreat_event_interests where id = p_interest_id for update;
  if interest_row.id is null or interest_row.status <> 'selected' then
    raise exception 'Only selected interests can receive an invitation';
  end if;
  select * into event_row from public.retreat_events where id = interest_row.retreat_event_id;
  if event_row.id is null then raise exception 'Event not found'; end if;

  select id into benefit_id
  from public.inner_sanctum_benefits
  where retreat_event_id = interest_row.retreat_event_id
    and user_id = interest_row.user_id
    and type in ('invitation', 'event', 'retreat')
  limit 1;
  if benefit_id is not null then return benefit_id; end if;

  insert into public.inner_sanctum_benefits (
    user_id, type, eyebrow, title, body, cta_label, cta_href, status,
    available_from, expires_at, retreat_event_id, created_by
  ) values (
    interest_row.user_id,
    'invitation',
    'A personal invitation',
    'You may come to ' || event_row.title,
    'Cally would like to invite you to ' || event_row.title || '. The invitation is personal, and accepting it does not confirm a booking. The next step will be arranged with you directly.' || E'\n\n' || 'Dates: ' || event_row.start_date::text || ' to ' || event_row.end_date::text || '.',
    'Respond to this invitation',
    '/inner-sanctum/benefits',
    'available',
    now(),
    null,
    event_row.id,
    admin_id
  ) returning id into benefit_id;
  return benefit_id;
end;
$$;
revoke all on function public.admin_create_retreat_event_invitation(uuid) from public, anon;
grant execute on function public.admin_create_retreat_event_invitation(uuid) to authenticated;

drop function if exists public.get_public_event_by_slug(text);
create or replace function public.get_public_event_by_slug(p_slug text)
returns table (
  id uuid, slug text, title text, retreat_product_id uuid, start_date date, end_date date,
  capacity smallint, available_places smallint, effective_places_remaining smallint,
  description text, invitation_only boolean, interest_enabled boolean
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.slug, e.title, e.retreat_product_id, e.start_date, e.end_date,
    e.capacity, e.available_places,
    greatest(0, e.available_places - coalesce((select sum(h.guest_count)::smallint from public.retreat_holds h
      where h.retreat_event_id = e.id and h.status = 'active' and h.expires_at > now()), 0))::smallint,
    e.description, e.invitation_only, e.interest_enabled
  from public.retreat_events e
  where e.slug = p_slug and e.status = 'published' and e.end_date >= current_date;
$$;
grant execute on function public.get_public_event_by_slug(text) to anon, authenticated;

drop function if exists public.list_public_retreat_events();
create or replace function public.list_public_retreat_events()
returns table (
  id uuid, slug text, title text, retreat_product_id uuid, start_date date, end_date date,
  capacity smallint, available_places smallint, effective_places_remaining smallint,
  description text, invitation_only boolean, interest_enabled boolean
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.slug, e.title, e.retreat_product_id, e.start_date, e.end_date,
    e.capacity, e.available_places,
    greatest(0, e.available_places - coalesce((select sum(h.guest_count)::smallint from public.retreat_holds h
      where h.retreat_event_id = e.id and h.status = 'active' and h.expires_at > now()), 0))::smallint,
    e.description, e.invitation_only, e.interest_enabled
  from public.retreat_events e
  where e.status = 'published' and e.end_date >= current_date
  order by e.start_date;
$$;
grant execute on function public.list_public_retreat_events() to anon, authenticated;
