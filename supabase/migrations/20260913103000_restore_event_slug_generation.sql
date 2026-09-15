create or replace function public.create_retreat_event(
  p_title text, p_product_id uuid, p_start_date date, p_end_date date,
  p_capacity smallint, p_status public.event_status, p_description text,
  p_invitation_only boolean default false, p_interest_enabled boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  event_id uuid;
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  if p_capacity <= 0 or p_end_date < p_start_date then raise exception 'Invalid event details'; end if;

  perform pg_catalog.pg_advisory_xact_lock(735391);
  base_slug := public.retreat_event_slug(p_title);
  candidate_slug := base_slug;
  while exists (select 1 from public.retreat_events where slug = candidate_slug) loop
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix;
  end loop;

  if p_status = 'published' and exists (select 1 from public.retreat_events e where e.status = 'published' and e.start_date <= p_end_date and e.end_date >= p_start_date) then raise exception 'These dates overlap another published event.'; end if;
  if p_status = 'published' and exists (select 1 from public.retreat_bookings b where b.retreat_event_id is null and b.booking_status in ('confirmed', 'completed') and b.start_date <= p_end_date and coalesce(b.end_date, b.start_date) >= p_start_date) then raise exception 'These dates are already occupied by a private retreat.'; end if;

  insert into public.retreat_events(
    title, slug, retreat_product_id, retreat_format, start_date, end_date,
    capacity, available_places, status, description, invitation_only, interest_enabled
  ) values (
    p_title, candidate_slug, p_product_id, 'join_a_group', p_start_date, p_end_date,
    p_capacity, p_capacity, p_status, nullif(p_description, ''), p_invitation_only, p_interest_enabled
  ) returning id into event_id;
  return event_id;
end;
$$;

revoke all on function public.create_retreat_event(text, uuid, date, date, smallint, public.event_status, text, boolean, boolean) from public, anon;
grant execute on function public.create_retreat_event(text, uuid, date, date, smallint, public.event_status, text, boolean, boolean) to authenticated;
