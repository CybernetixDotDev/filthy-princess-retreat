alter table public.retreat_bookings
  add column if not exists public_slug text;

update public.retreat_bookings
set public_slug = gen_random_uuid()::text
where public_slug is null;

alter table public.retreat_bookings
  alter column public_slug set default gen_random_uuid()::text,
  alter column public_slug set not null;

create unique index if not exists retreat_bookings_public_slug_idx
  on public.retreat_bookings(public_slug);

create or replace function public.get_public_booking_by_slug(p_public_slug text)
returns table (
  booking_reference text,
  booking_status public.booking_status,
  guest_name text,
  retreat_type_name text,
  retreat_format public.retreat_format,
  guest_count smallint,
  start_date date,
  end_date date,
  nights integer,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    b.booking_reference,
    b.booking_status,
    e.full_name,
    b.retreat_type_name,
    b.retreat_format,
    b.guest_count,
    b.start_date,
    b.end_date,
    case when b.end_date is null then 1 else (b.end_date - b.start_date + 1) end::integer,
    b.created_at
  from public.retreat_bookings b
  left join public.retreat_enquiries e on e.id = b.enquiry_id
  where b.public_slug = p_public_slug
    and b.booking_status = 'confirmed'
  limit 1;
$$;

revoke all on function public.get_public_booking_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_public_booking_by_slug(text) to anon, authenticated;
