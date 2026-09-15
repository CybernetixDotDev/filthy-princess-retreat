drop function if exists public.get_my_inner_sanctum_benefits();

create function public.get_my_inner_sanctum_benefits()
returns table (
  id uuid, type public.inner_sanctum_benefit_type, eyebrow text, title text, body text,
  media_path text, media_type text, cta_label text, cta_href text,
  status public.inner_sanctum_benefit_status, response public.inner_sanctum_benefit_response,
  available_from timestamptz, expires_at timestamptz, responded_at timestamptz, created_at timestamptz,
  retreat_event_id uuid, confirmed_booking_id uuid, confirmed_booking_reference text,
  confirmed_booking_public_slug text, confirmed_booking_start_date date,
  confirmed_booking_end_date date
)
language plpgsql stable security definer set search_path = ''
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
