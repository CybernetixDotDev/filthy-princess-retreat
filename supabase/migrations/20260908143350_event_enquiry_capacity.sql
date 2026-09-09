-- Public event inventory is published-only and always subtracts effective quote holds.
drop policy if exists "published events are public" on public.retreat_events;
create policy "published events are public" on public.retreat_events for select to anon, authenticated
  using (status = 'published');

create or replace function public.get_public_event_by_slug(p_slug text)
returns table (id uuid, slug text, title text, retreat_product_id uuid, start_date date, end_date date,
  capacity smallint, available_places smallint, effective_places_remaining smallint, description text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.slug, e.title, e.retreat_product_id, e.start_date, e.end_date, e.capacity,
    e.available_places,
    greatest(0, e.available_places - coalesce((select sum(h.guest_count)::smallint from public.retreat_holds h
      where h.retreat_event_id = e.id and h.status = 'active' and h.expires_at > now()), 0))::smallint,
    e.description
  from public.retreat_events e
  where e.slug = p_slug and e.status = 'published' and e.end_date >= current_date;
$$;
grant execute on function public.get_public_event_by_slug(text) to anon, authenticated;

create or replace function public.list_public_retreat_events()
returns table (id uuid, slug text, title text, retreat_product_id uuid, start_date date, end_date date,
  capacity smallint, available_places smallint, effective_places_remaining smallint, description text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.slug, e.title, e.retreat_product_id, e.start_date, e.end_date, e.capacity, e.available_places,
    greatest(0, e.available_places - coalesce((select sum(h.guest_count)::smallint from public.retreat_holds h
      where h.retreat_event_id = e.id and h.status = 'active' and h.expires_at > now()), 0))::smallint,
    e.description
  from public.retreat_events e where e.status = 'published' and e.end_date >= current_date order by e.start_date;
$$;
grant execute on function public.list_public_retreat_events() to anon, authenticated;

-- Public event enquiries are non-reserving, but cannot request places that are already gone.
create or replace function retreat_private.validate_event_enquiry_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare remaining smallint;
begin
  if new.retreat_event_id is null then return new; end if;
  select greatest(0, e.available_places - coalesce((select sum(h.guest_count)::smallint from public.retreat_holds h
    where h.retreat_event_id = e.id and h.status = 'active' and h.expires_at > now()), 0))::smallint
    into remaining
    from public.retreat_events e where e.id = new.retreat_event_id and e.status = 'published' and e.start_date >= current_date
    for update;
  if remaining is null or new.guest_count > remaining then raise exception 'Group event is unavailable'; end if;
  return new;
end; $$;
drop trigger if exists validate_event_enquiry_capacity on public.retreat_enquiries;
create trigger validate_event_enquiry_capacity before insert on public.retreat_enquiries
for each row execute function retreat_private.validate_event_enquiry_capacity();

