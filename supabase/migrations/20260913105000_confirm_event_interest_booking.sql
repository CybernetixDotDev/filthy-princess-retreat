alter table public.retreat_bookings
  add column retreat_event_interest_id uuid references public.retreat_event_interests(id) on delete set null;

create unique index retreat_bookings_event_interest_uidx
  on public.retreat_bookings(retreat_event_interest_id)
  where retreat_event_interest_id is not null;

create or replace function public.confirm_retreat_event_interest_booking(p_interest_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  interest_row public.retreat_event_interests%rowtype;
  event_row public.retreat_events%rowtype;
  invitation public.inner_sanctum_benefits%rowtype;
  existing_booking public.retreat_bookings%rowtype;
  booking_id uuid;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  select * into interest_row from public.retreat_event_interests where id = p_interest_id for update;
  if interest_row.id is null then raise exception 'Interest not found'; end if;

  select * into invitation
  from public.inner_sanctum_benefits
  where retreat_event_id = interest_row.retreat_event_id
    and user_id = interest_row.user_id
    and type in ('invitation', 'event', 'retreat')
  order by created_at desc limit 1;
  if invitation.id is null or invitation.response <> 'accepted' then
    raise exception 'The invitation must be accepted before confirmation';
  end if;

  select * into existing_booking
  from public.retreat_bookings
  where retreat_event_interest_id = interest_row.id
  for update;
  if existing_booking.id is not null then return existing_booking.id; end if;

  select * into event_row from public.retreat_events where id = interest_row.retreat_event_id;
  if event_row.id is null then raise exception 'Event not found'; end if;

  booking_id := public.create_manual_retreat_booking(
    event_row.retreat_product_id,
    'join_a_group'::public.retreat_format,
    event_row.start_date,
    event_row.end_date,
    1,
    'confirmed'::public.booking_status,
    'unpaid'::public.payment_status,
    event_row.id
  );

  update public.retreat_bookings
  set retreat_event_interest_id = interest_row.id
  where id = booking_id;
  return booking_id;
end;
$$;

revoke all on function public.confirm_retreat_event_interest_booking(uuid) from public, anon;
grant execute on function public.confirm_retreat_event_interest_booking(uuid) to authenticated;

drop function if exists public.admin_list_retreat_event_interests(uuid);
create function public.admin_list_retreat_event_interests(p_event_id uuid)
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
  invitation_response public.inner_sanctum_benefit_response,
  confirmed_booking_id uuid,
  confirmed_booking_reference text,
  confirmed_booking_status public.booking_status
)
language sql security definer set search_path = ''
as $$
  select i.id, i.retreat_event_id, i.user_id, u.email, i.message, i.status,
    i.created_at, i.updated_at, i.reviewed_at, i.reviewed_by, i.admin_notes,
    b.id, b.status, b.response,
    booking.id, booking.booking_reference, booking.booking_status
  from public.retreat_event_interests i
  join auth.users u on u.id = i.user_id
  left join public.inner_sanctum_benefits b
    on b.retreat_event_id = i.retreat_event_id
   and b.user_id = i.user_id
   and b.type in ('invitation', 'event', 'retreat')
  left join public.retreat_bookings booking on booking.retreat_event_interest_id = i.id
  where i.retreat_event_id = p_event_id
    and (select retreat_private.is_retreat_admin())
  order by i.created_at asc;
$$;

revoke all on function public.admin_list_retreat_event_interests(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_retreat_event_interests(uuid) to authenticated;

-- Expose only the member's own event-linked booking details through the existing benefit RPC.
drop function if exists public.get_my_inner_sanctum_benefits();
create or replace function public.get_my_inner_sanctum_benefits()
returns table (
  id uuid, type public.inner_sanctum_benefit_type, eyebrow text, title text, body text,
  media_path text, media_type text, cta_label text, cta_href text,
  status public.inner_sanctum_benefit_status, response public.inner_sanctum_benefit_response,
  available_from timestamptz, expires_at timestamptz, responded_at timestamptz, created_at timestamptz,
  retreat_event_id uuid, confirmed_booking_id uuid, confirmed_booking_reference text,
  confirmed_booking_public_slug text, confirmed_booking_start_date date,
  confirmed_booking_end_date date
)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'inner_sanctum_access_required' using errcode = '42501';
  end if;
  return query
  select b.id, b.type, b.eyebrow, b.title, b.body, b.media_path, b.media_type,
    b.cta_label, b.cta_href, b.status, b.response, b.available_from, b.expires_at,
    b.responded_at, b.created_at, b.retreat_event_id,
    booking.id, booking.booking_reference, booking.public_slug,
    booking.start_date, booking.end_date
  from public.inner_sanctum_benefits b
  left join public.retreat_event_interests interest
    on interest.retreat_event_id = b.retreat_event_id
   and interest.user_id = b.user_id
  left join public.retreat_bookings booking
    on booking.retreat_event_interest_id = interest.id
   and booking.booking_status = 'confirmed'
  where b.user_id = auth.uid()
    and (
      (b.status = 'available' and (b.available_from is null or b.available_from <= now()) and (b.expires_at is null or b.expires_at > now()))
      or b.status in ('completed', 'expired')
      or b.response is not null
    )
  order by (b.status = 'available' and b.response is null) desc, coalesce(b.available_from, b.created_at) desc;
end;
$$;
revoke all on function public.get_my_inner_sanctum_benefits() from public, anon, authenticated;
grant execute on function public.get_my_inner_sanctum_benefits() to authenticated;
