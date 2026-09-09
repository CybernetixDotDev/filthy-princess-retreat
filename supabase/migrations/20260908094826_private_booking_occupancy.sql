-- Make private booking occupancy authoritative at confirmation time.
-- A transaction advisory lock serializes all private confirmations so the
-- overlap check cannot race between concurrent admin confirmations.
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
  requested_end_date date;
begin
  if not (select retreat_private.is_retreat_admin()) then
    raise exception 'Not authorized';
  end if;

  select * into selected_quote
  from public.retreat_quotes
  where id = target_quote_id
  for update;
  if selected_quote.id is null then raise exception 'Quote not found'; end if;
  if selected_quote.payment_status not in ('deposit_received', 'paid') then
    raise exception 'Payment must be verified before confirmation';
  end if;

  select * into selected_enquiry
  from public.retreat_enquiries
  where id = selected_quote.enquiry_id
  for update;

  if selected_enquiry.retreat_event_id is not null then
    select * into selected_event
    from public.retreat_events
    where id = selected_enquiry.retreat_event_id
    for update;
    if selected_event.id is null
      or selected_event.available_places < selected_quote.guest_count
      or selected_event.status <> 'published'
      or selected_event.start_date <> selected_quote.start_date
      or selected_event.end_date <> selected_quote.end_date then
      raise exception 'Group event no longer has enough places or the quote dates do not match';
    end if;
  elsif selected_quote.retreat_format <> 'join_a_group' then
    -- Serialize the global private occupancy check. Private retreats occupy
    -- Cally regardless of product or private format.
    perform pg_catalog.pg_advisory_xact_lock(735391);
    requested_end_date := coalesce(selected_quote.end_date, selected_quote.start_date);

    if not exists (
      select 1
      from public.retreat_products p
      where p.id = selected_quote.retreat_product_id
        and p.is_published
        and selected_quote.retreat_format = any(p.allowed_formats)
    ) then
      raise exception 'The selected retreat is no longer available.';
    end if;

    -- Every day in a multi-day private booking must remain sellable, and any
    -- explicit block invalidates the requested range.
    if exists (
      select 1
      from generate_series(
        selected_quote.start_date::timestamp,
        requested_end_date::timestamp,
        interval '1 day'
      ) as requested_day
      where not exists (
        select 1
        from public.retreat_availability a
        where a.retreat_product_id = selected_quote.retreat_product_id
          and a.retreat_format = selected_quote.retreat_format
          and a.state = 'available'
          and a.start_date <= requested_day::date
          and a.end_date >= requested_day::date
          and (a.capacity is null or a.capacity >= selected_quote.guest_count)
      )
      or exists (
        select 1
        from public.retreat_availability a
        where a.retreat_product_id = selected_quote.retreat_product_id
          and a.retreat_format = selected_quote.retreat_format
          and a.state = 'blocked'
          and a.start_date <= requested_day::date
          and a.end_date >= requested_day::date
      )
    ) then
      raise exception 'The selected private retreat dates are no longer available.';
    end if;

    if exists (
      select 1
      from public.retreat_bookings b
      where b.retreat_event_id is null
        and b.booking_status in ('confirmed', 'completed')
        and b.start_date <= requested_end_date
        and coalesce(b.end_date, b.start_date) >= selected_quote.start_date
    ) then
      raise exception 'These dates are already occupied by another confirmed retreat.';
    end if;
  end if;

  insert into public.retreat_bookings (
    enquiry_id, retreat_product_id, retreat_type_name, retreat_format,
    start_date, end_date, guest_count, retreat_event_id, quote_id, payment_status
  ) values (
    selected_enquiry.id, selected_quote.retreat_product_id, selected_quote.retreat_type_name,
    selected_quote.retreat_format, selected_quote.start_date, selected_quote.end_date,
    selected_quote.guest_count, selected_enquiry.retreat_event_id, selected_quote.id,
    selected_quote.payment_status
  )
  on conflict (enquiry_id) do nothing
  returning id into new_booking_id;

  if new_booking_id is not null and selected_event.id is not null then
    update public.retreat_events
    set available_places = available_places - selected_quote.guest_count,
        status = case when available_places - selected_quote.guest_count <= 0 then 'full'::public.event_status else status end
    where id = selected_event.id;
  end if;

  update public.retreat_enquiries set status = 'confirmed' where id = selected_enquiry.id;
  if new_booking_id is null then
    select id into new_booking_id from public.retreat_bookings where enquiry_id = selected_enquiry.id;
  end if;
  return new_booking_id;
end;
$$;

revoke all on function public.confirm_retreat_booking(uuid) from public, anon;
grant execute on function public.confirm_retreat_booking(uuid) to authenticated;
