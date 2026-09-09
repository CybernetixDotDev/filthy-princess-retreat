create table public.retreat_booking_preparation (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.retreat_bookings(id) on delete cascade,
  preferred_contact_method text not null check (preferred_contact_method in ('whatsapp', 'phone', 'email')),
  contact_detail text not null check (char_length(contact_detail) between 1 and 200),
  participant_names text check (participant_names is null or char_length(participant_names) <= 1000),
  arrival_method text check (arrival_method is null or char_length(arrival_method) <= 100),
  arrival_notes text check (arrival_notes is null or char_length(arrival_notes) <= 1000),
  dietary_requirements text check (dietary_requirements is null or char_length(dietary_requirements) <= 1000),
  accessibility_requirements text check (accessibility_requirements is null or char_length(accessibility_requirements) <= 1000),
  cally_notes text check (cally_notes is null or char_length(cally_notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger retreat_booking_preparation_updated_at
before update on public.retreat_booking_preparation
for each row execute function public.retreat_set_updated_at();

alter table public.retreat_booking_preparation enable row level security;
revoke all on public.retreat_booking_preparation from public, anon, authenticated;
grant select on public.retreat_booking_preparation to authenticated;
create policy "admins read booking preparation"
  on public.retreat_booking_preparation
  for select to authenticated
  using ((select retreat_private.is_retreat_admin()));

create or replace function public.get_public_booking_preparation(p_booking_slug text)
returns table (
  preferred_contact_method text,
  contact_detail text,
  participant_names text,
  arrival_method text,
  arrival_notes text,
  dietary_requirements text,
  accessibility_requirements text,
  cally_notes text
)
language sql
security definer
set search_path = ''
as $$
  select p.preferred_contact_method, p.contact_detail, p.participant_names,
    p.arrival_method, p.arrival_notes, p.dietary_requirements,
    p.accessibility_requirements, p.cally_notes
  from public.retreat_booking_preparation p
  join public.retreat_bookings b on b.id = p.booking_id
  where b.public_slug = p_booking_slug
    and b.booking_status = 'confirmed'
  limit 1;
$$;

create or replace function public.save_public_booking_preparation(
  p_booking_slug text,
  p_preferred_contact_method text,
  p_contact_detail text,
  p_participant_names text default null,
  p_arrival_method text default null,
  p_arrival_notes text default null,
  p_dietary_requirements text default null,
  p_accessibility_requirements text default null,
  p_cally_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare booking_id_value uuid;
begin
  if p_booking_slug is null or length(trim(p_booking_slug)) not between 20 and 100
    or p_preferred_contact_method not in ('whatsapp', 'phone', 'email')
    or char_length(trim(coalesce(p_contact_detail, ''))) not between 1 and 200
    or char_length(coalesce(p_participant_names, '')) > 1000
    or char_length(coalesce(p_arrival_method, '')) > 100
    or char_length(coalesce(p_arrival_notes, '')) > 1000
    or char_length(coalesce(p_dietary_requirements, '')) > 1000
    or char_length(coalesce(p_accessibility_requirements, '')) > 1000
    or char_length(coalesce(p_cally_notes, '')) > 1000 then
    raise exception 'Invalid preparation details';
  end if;

  select b.id into booking_id_value
  from public.retreat_bookings b
  where b.public_slug = trim(p_booking_slug)
    and b.booking_status = 'confirmed';
  if booking_id_value is null then raise exception 'Booking unavailable'; end if;

  insert into public.retreat_booking_preparation(
    booking_id, preferred_contact_method, contact_detail, participant_names,
    arrival_method, arrival_notes, dietary_requirements,
    accessibility_requirements, cally_notes
  ) values (
    booking_id_value, p_preferred_contact_method, trim(p_contact_detail),
    nullif(trim(p_participant_names), ''), nullif(trim(p_arrival_method), ''),
    nullif(trim(p_arrival_notes), ''), nullif(trim(p_dietary_requirements), ''),
    nullif(trim(p_accessibility_requirements), ''), nullif(trim(p_cally_notes), '')
  )
  on conflict (booking_id) do update set
    preferred_contact_method = excluded.preferred_contact_method,
    contact_detail = excluded.contact_detail,
    participant_names = excluded.participant_names,
    arrival_method = excluded.arrival_method,
    arrival_notes = excluded.arrival_notes,
    dietary_requirements = excluded.dietary_requirements,
    accessibility_requirements = excluded.accessibility_requirements,
    cally_notes = excluded.cally_notes,
    updated_at = now();
  return true;
end;
$$;

revoke all on function public.get_public_booking_preparation(text) from public, anon, authenticated;
revoke all on function public.save_public_booking_preparation(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_public_booking_preparation(text) to anon, authenticated;
grant execute on function public.save_public_booking_preparation(text, text, text, text, text, text, text, text, text) to anon, authenticated;
