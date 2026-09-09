create type public.booking_source as enum ('enquiry', 'manual');

alter table public.retreat_bookings
  alter column enquiry_id drop not null,
  alter column quote_id drop not null,
  add column booking_source public.booking_source not null default 'enquiry',
  add column created_by uuid references auth.users(id) on delete set null;

alter table public.retreat_bookings
  add constraint retreat_bookings_provenance_valid check (
    (booking_source = 'enquiry' and enquiry_id is not null and quote_id is not null)
    or (booking_source = 'manual' and enquiry_id is null and quote_id is null)
  );

create function retreat_private.validate_private_booking(
  p_retreat_product_id uuid,
  p_retreat_format public.retreat_format,
  p_start_date date,
  p_end_date date,
  p_guest_count smallint,
  p_exclude_booking_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_end_date date;
begin
  if not (select retreat_private.is_retreat_admin()) then
    raise exception 'Not authorized';
  end if;
  if p_start_date is null or p_guest_count not between 1 and 50 or p_retreat_format = 'join_a_group' then
    raise exception 'Invalid private booking details';
  end if;
  requested_end_date := coalesce(p_end_date, p_start_date);
  if requested_end_date < p_start_date then
    raise exception 'Private booking end date must be on or after the start date';
  end if;

  if not exists (
    select 1 from public.retreat_products p
    where p.id = p_retreat_product_id
      and p.is_published
      and p_retreat_format = any(p.allowed_formats)
  ) then
    raise exception 'The selected retreat is no longer available.';
  end if;

  if exists (
    select 1
    from generate_series(p_start_date::timestamp, requested_end_date::timestamp, interval '1 day') as requested_day
    where not exists (
      select 1 from public.retreat_availability a
      where a.retreat_product_id = p_retreat_product_id
        and a.retreat_format = p_retreat_format
        and a.state = 'available'
        and a.start_date <= requested_day::date
        and a.end_date >= requested_day::date
        and (a.capacity is null or a.capacity >= p_guest_count)
    )
    or exists (
      select 1 from public.retreat_availability a
      where a.retreat_product_id = p_retreat_product_id
        and a.retreat_format = p_retreat_format
        and a.state = 'blocked'
        and a.start_date <= requested_day::date
        and a.end_date >= requested_day::date
    )
  ) then
    raise exception 'The configured availability no longer permits these private retreat dates.';
  end if;

  if exists (
    select 1 from public.retreat_bookings b
    where (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and b.retreat_event_id is null
      and b.booking_status in ('confirmed', 'completed')
      and b.start_date <= requested_end_date
      and coalesce(b.end_date, b.start_date) >= p_start_date
  ) then
    raise exception 'These dates are already occupied by another confirmed retreat.';
  end if;
end;
$$;
revoke all on function retreat_private.validate_private_booking(uuid, public.retreat_format, date, date, smallint, uuid) from public, anon, authenticated;

create or replace function public.confirm_retreat_booking(target_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_quote public.retreat_quotes%rowtype;
  selected_enquiry public.retreat_enquiries%rowtype;
  selected_event public.retreat_events%rowtype;
  new_booking_id uuid;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  select * into selected_quote from public.retreat_quotes where id = target_quote_id for update;
  if selected_quote.id is null then raise exception 'Quote not found'; end if;
  if selected_quote.payment_status not in ('deposit_received', 'paid') then raise exception 'Payment must be verified before confirmation'; end if;
  select * into selected_enquiry from public.retreat_enquiries where id = selected_quote.enquiry_id for update;

  if selected_enquiry.retreat_event_id is not null then
    select * into selected_event from public.retreat_events where id = selected_enquiry.retreat_event_id for update;
    if selected_event.id is null or selected_event.available_places < selected_quote.guest_count or selected_event.status <> 'published' or selected_event.start_date <> selected_quote.start_date or selected_event.end_date <> selected_quote.end_date then
      raise exception 'Group event no longer has enough places or the quote dates do not match';
    end if;
  else
    perform retreat_private.validate_private_booking(selected_quote.retreat_product_id, selected_quote.retreat_format, selected_quote.start_date, selected_quote.end_date, selected_quote.guest_count);
  end if;

  insert into public.retreat_bookings (enquiry_id, retreat_product_id, retreat_type_name, retreat_format, start_date, end_date, guest_count, retreat_event_id, quote_id, booking_status, payment_status, booking_source)
  values (selected_enquiry.id, selected_quote.retreat_product_id, selected_quote.retreat_type_name, selected_quote.retreat_format, selected_quote.start_date, selected_quote.end_date, selected_quote.guest_count, selected_enquiry.retreat_event_id, selected_quote.id, 'confirmed', selected_quote.payment_status, 'enquiry')
  on conflict (enquiry_id) do nothing
  returning id into new_booking_id;

  if new_booking_id is not null and selected_event.id is not null then
    update public.retreat_events
    set available_places = available_places - selected_quote.guest_count,
        status = case when available_places - selected_quote.guest_count <= 0 then 'full'::public.event_status else status end
    where id = selected_event.id;
  end if;
  update public.retreat_enquiries set status = 'confirmed' where id = selected_enquiry.id;
  if new_booking_id is null then select id into new_booking_id from public.retreat_bookings where enquiry_id = selected_enquiry.id; end if;
  return new_booking_id;
end;
$$;
revoke all on function public.confirm_retreat_booking(uuid) from public, anon;
grant execute on function public.confirm_retreat_booking(uuid) to authenticated;

create function public.create_manual_retreat_booking(
  p_retreat_product_id uuid,
  p_retreat_format public.retreat_format,
  p_start_date date,
  p_end_date date,
  p_guest_count smallint,
  p_booking_status public.booking_status default 'confirmed',
  p_payment_status public.payment_status default 'unpaid',
  p_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_product public.retreat_products%rowtype;
  selected_event public.retreat_events%rowtype;
  new_booking_id uuid;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  select * into selected_product from public.retreat_products where id = p_retreat_product_id and is_published and p_retreat_format = any(allowed_formats);
  if selected_product.id is null then raise exception 'The selected retreat is no longer available.'; end if;
  if p_start_date is null or p_guest_count not between 1 and 50 or (p_end_date is not null and p_end_date < p_start_date) then raise exception 'Invalid booking details'; end if;

  if p_event_id is not null then
    if p_retreat_format <> 'join_a_group' then raise exception 'Group events require the Join a Group format'; end if;
    select * into selected_event from public.retreat_events where id = p_event_id for update;
    if selected_event.id is null or selected_event.retreat_product_id <> p_retreat_product_id or selected_event.retreat_format <> 'join_a_group' or selected_event.start_date <> p_start_date or selected_event.end_date <> p_end_date then
      raise exception 'The selected group event does not match this booking';
    end if;
    if p_booking_status <> 'cancelled' and (selected_event.status <> 'published' or selected_event.available_places < p_guest_count) then
      raise exception 'Group event no longer has enough places';
    end if;
  else
    if p_retreat_format = 'join_a_group' then raise exception 'Join a Group bookings require an event'; end if;
    if p_booking_status <> 'cancelled' then
      perform retreat_private.validate_private_booking(p_retreat_product_id, p_retreat_format, p_start_date, p_end_date, p_guest_count);
    end if;
  end if;

  insert into public.retreat_bookings (retreat_product_id, retreat_type_name, retreat_format, start_date, end_date, guest_count, retreat_event_id, booking_status, payment_status, booking_source, created_by)
  values (p_retreat_product_id, selected_product.name, p_retreat_format, p_start_date, p_end_date, p_guest_count, p_event_id, p_booking_status, p_payment_status, 'manual', (select auth.uid()))
  returning id into new_booking_id;

  if p_event_id is not null and p_booking_status <> 'cancelled' then
    update public.retreat_events
    set available_places = available_places - p_guest_count,
        status = case when available_places - p_guest_count <= 0 then 'full'::public.event_status else status end
    where id = p_event_id;
  end if;
  return new_booking_id;
end;
$$;
revoke all on function public.create_manual_retreat_booking(uuid, public.retreat_format, date, date, smallint, public.booking_status, public.payment_status, uuid) from public, anon;
grant execute on function public.create_manual_retreat_booking(uuid, public.retreat_format, date, date, smallint, public.booking_status, public.payment_status, uuid) to authenticated;

create or replace function public.update_retreat_booking(
  target_booking_id uuid,
  target_booking_status public.booking_status,
  target_payment_status public.payment_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_booking public.retreat_bookings%rowtype;
  selected_event public.retreat_events%rowtype;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  select * into selected_booking from public.retreat_bookings where id = target_booking_id for update;
  if selected_booking.id is null then raise exception 'Booking not found'; end if;

  if selected_booking.retreat_event_id is not null and selected_booking.booking_status <> target_booking_status then
    select * into selected_event from public.retreat_events where id = selected_booking.retreat_event_id for update;
    if target_booking_status = 'cancelled' and selected_booking.booking_status <> 'cancelled' then
      update public.retreat_events set available_places = least(capacity, available_places + selected_booking.guest_count), status = case when status = 'full' and end_date >= current_date then 'published'::public.event_status else status end where id = selected_event.id;
    elsif selected_booking.booking_status = 'cancelled' and target_booking_status <> 'cancelled' then
      if selected_event.status not in ('published', 'full') or selected_event.available_places < selected_booking.guest_count then raise exception 'Group event no longer has enough places'; end if;
      update public.retreat_events set available_places = available_places - selected_booking.guest_count, status = case when available_places - selected_booking.guest_count <= 0 then 'full'::public.event_status else status end where id = selected_event.id;
    end if;
  elsif selected_booking.retreat_event_id is null and selected_booking.booking_status = 'cancelled' and target_booking_status <> 'cancelled' then
    perform retreat_private.validate_private_booking(selected_booking.retreat_product_id, selected_booking.retreat_format, selected_booking.start_date, selected_booking.end_date, selected_booking.guest_count, selected_booking.id);
  end if;

  update public.retreat_bookings set booking_status = target_booking_status, payment_status = target_payment_status where id = selected_booking.id;
  update public.retreat_quotes set payment_status = target_payment_status, payment_received_at = case when target_payment_status in ('deposit_received', 'paid') then coalesce(payment_received_at, now()) else payment_received_at end where id = selected_booking.quote_id;
  update public.retreat_enquiries set status = case target_booking_status when 'confirmed' then 'confirmed'::public.enquiry_status when 'completed' then 'completed'::public.enquiry_status when 'cancelled' then 'cancelled'::public.enquiry_status end where id = selected_booking.enquiry_id;
end;
$$;
revoke all on function public.update_retreat_booking(uuid, public.booking_status, public.payment_status) from public, anon, authenticated;
grant execute on function public.update_retreat_booking(uuid, public.booking_status, public.payment_status) to authenticated;
