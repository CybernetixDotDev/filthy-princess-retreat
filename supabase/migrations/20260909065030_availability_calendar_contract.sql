-- One evaluator owns private-retreat availability semantics. Public RPCs add
-- the public lead-time policy while transactional booking functions retain
-- their existing admin authorization and locking behavior.
create or replace function retreat_private.evaluate_retreat_stay(
  p_product_id uuid,
  p_format public.retreat_format,
  p_arrival date,
  p_occupied_end date,
  p_guest_count smallint
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_arrival is null or p_occupied_end is null or p_occupied_end < p_arrival
    or p_guest_count not between 1 and 50 or p_format = 'join_a_group' then
    return 'invalid_request';
  end if;

  if not exists (
    select 1 from public.retreat_products p
    where p.id = p_product_id and p.is_published and p_format = any(p.allowed_formats)
  ) then return 'invalid_request'; end if;

  if exists (
    select 1 from public.retreat_bookings b
    where b.retreat_event_id is null and b.booking_status in ('confirmed', 'completed')
      and b.start_date <= p_occupied_end and coalesce(b.end_date, b.start_date) >= p_arrival
  ) then return 'booked'; end if;

  if exists (
    select 1 from public.retreat_events e
    where e.status = 'published' and e.start_date <= p_occupied_end and e.end_date >= p_arrival
  ) then return 'event'; end if;

  if exists (
    select 1 from public.retreat_holds h
    where h.retreat_event_id is null and h.status = 'active' and h.expires_at > now()
      and h.start_date <= p_occupied_end and coalesce(h.end_date, h.start_date) >= p_arrival
  ) then return 'held'; end if;

  if exists (
    select 1
    from generate_series(p_arrival::timestamp, p_occupied_end::timestamp, interval '1 day') requested_day
    where exists (
      select 1 from public.retreat_availability a
      where (a.retreat_product_id is null or a.retreat_product_id = p_product_id)
        and (a.retreat_format is null or a.retreat_format = p_format)
        and a.state = 'blocked'
        and a.start_date <= requested_day::date and a.end_date >= requested_day::date
    )
  ) then return 'blocked'; end if;

  if exists (
    select 1
    from generate_series(p_arrival::timestamp, p_occupied_end::timestamp, interval '1 day') requested_day
    where not exists (
      select 1 from public.retreat_availability a
      where (a.retreat_product_id is null or a.retreat_product_id = p_product_id)
        and (a.retreat_format is null or a.retreat_format = p_format)
        and a.state = 'available'
        and a.start_date <= requested_day::date and a.end_date >= requested_day::date
        and (a.capacity is null or a.capacity >= p_guest_count)
    )
  ) then return 'not_configured'; end if;

  return 'available';
end;
$$;
revoke all on function retreat_private.evaluate_retreat_stay(uuid, public.retreat_format, date, date, smallint) from public, anon, authenticated;

create or replace function public.check_stay_availability(
  p_product_id uuid,
  p_format public.retreat_format,
  p_arrival date,
  p_nights smallint,
  p_guest_count smallint default 1
) returns table (
  available boolean,
  state text,
  arrival_date date,
  nights smallint,
  checkout_date date,
  occupied_start date,
  occupied_end date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare evaluated_state text; requested_end date;
begin
  requested_end := p_arrival + greatest(coalesce(p_nights, 1) - 1, 0);
  if p_nights is null or p_nights not between 1 and 31 then
    evaluated_state := 'invalid_request';
  elsif p_arrival < (now() at time zone 'Africa/Johannesburg')::date + 14 then
    evaluated_state := 'lead_time';
  else
    evaluated_state := retreat_private.evaluate_retreat_stay(p_product_id, p_format, p_arrival, requested_end, p_guest_count);
  end if;
  return query select evaluated_state = 'available', evaluated_state, p_arrival, p_nights,
    p_arrival + p_nights, p_arrival, requested_end;
end;
$$;
revoke all on function public.check_stay_availability(uuid, public.retreat_format, date, smallint, smallint) from public;
grant execute on function public.check_stay_availability(uuid, public.retreat_format, date, smallint, smallint) to anon, authenticated;

create or replace function public.get_arrival_availability(
  p_product_id uuid,
  p_format public.retreat_format,
  p_nights smallint,
  p_guest_count smallint,
  p_range_start date,
  p_range_end date
) returns table (
  available boolean,
  state text,
  arrival_date date,
  nights smallint,
  checkout_date date,
  occupied_start date,
  occupied_end date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_range_start is null or p_range_end is null or p_range_end < p_range_start
    or p_range_end - p_range_start > 93 then raise exception 'Invalid availability range'; end if;
  return query
    select c.available, c.state, c.arrival_date, c.nights, c.checkout_date, c.occupied_start, c.occupied_end
    from generate_series(p_range_start::timestamp, p_range_end::timestamp, interval '1 day') d
    cross join lateral public.check_stay_availability(p_product_id, p_format, d::date, p_nights, p_guest_count) c
    order by c.arrival_date;
end;
$$;
revoke all on function public.get_arrival_availability(uuid, public.retreat_format, smallint, smallint, date, date) from public;
grant execute on function public.get_arrival_availability(uuid, public.retreat_format, smallint, smallint, date, date) to anon, authenticated;

-- Compatibility for the existing consumer. It now delegates to the canonical
-- range contract and also observes the 14-day public lead time.
create or replace function public.get_private_arrival_availability(
  p_product_id uuid,
  p_format public.retreat_format,
  p_guest_count smallint,
  p_nights smallint,
  p_month_start date,
  p_month_end date
) returns table (arrival_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select a.arrival_date
  from public.get_arrival_availability(p_product_id, p_format, p_nights, p_guest_count, p_month_start, p_month_end) a
  where a.available
  order by a.arrival_date;
$$;
revoke all on function public.get_private_arrival_availability(uuid, public.retreat_format, smallint, smallint, date, date) from public;
grant execute on function public.get_private_arrival_availability(uuid, public.retreat_format, smallint, smallint, date, date) to anon, authenticated;
