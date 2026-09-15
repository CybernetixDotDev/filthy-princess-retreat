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
    1::smallint,
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
