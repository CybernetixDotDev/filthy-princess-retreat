create type public.retreat_hold_status as enum ('active','released','expired','converted');

create table public.retreat_holds (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.retreat_quotes(id) on delete cascade,
  enquiry_id uuid not null references public.retreat_enquiries(id) on delete cascade,
  retreat_product_id uuid not null references public.retreat_products(id) on delete restrict,
  retreat_format public.retreat_format not null,
  start_date date not null,
  end_date date,
  guest_count smallint not null check (guest_count between 1 and 50),
  retreat_event_id uuid references public.retreat_events(id) on delete set null,
  status public.retreat_hold_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retreat_holds_dates_valid check (end_date is null or end_date >= start_date)
);
create index retreat_holds_private_lookup_idx on public.retreat_holds(status, expires_at, start_date, end_date) where retreat_event_id is null;
create index retreat_holds_event_lookup_idx on public.retreat_holds(retreat_event_id, status, expires_at);
create index retreat_holds_enquiry_lookup_idx on public.retreat_holds(enquiry_id, status, expires_at);
create trigger retreat_holds_updated_at before update on public.retreat_holds for each row execute function public.retreat_set_updated_at();
alter table public.retreat_holds enable row level security;
revoke all on public.retreat_holds from public, anon, authenticated;
grant select on public.retreat_holds to authenticated;
create policy "admins read holds" on public.retreat_holds for select to authenticated using ((select retreat_private.is_retreat_admin()));

create or replace function retreat_private.validate_private_booking(
  p_retreat_product_id uuid, p_retreat_format public.retreat_format, p_start_date date,
  p_end_date date, p_guest_count smallint, p_exclude_booking_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare requested_end_date date;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  if p_start_date is null or p_guest_count not between 1 and 50 or p_retreat_format = 'join_a_group' then raise exception 'Invalid private booking details'; end if;
  requested_end_date := coalesce(p_end_date, p_start_date);
  if requested_end_date < p_start_date then raise exception 'Private booking end date must be on or after the start date'; end if;
  if not exists (select 1 from public.retreat_products p where p.id = p_retreat_product_id and p.is_published and p_retreat_format = any(p.allowed_formats)) then raise exception 'The selected retreat is no longer available.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(735391);
  if exists (select 1 from generate_series(p_start_date::timestamp, requested_end_date::timestamp, interval '1 day') d where not exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id = p_retreat_product_id) and (a.retreat_format is null or a.retreat_format = p_retreat_format) and a.state = 'available' and a.start_date <= d::date and a.end_date >= d::date and (a.capacity is null or a.capacity >= p_guest_count)) or exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id = p_retreat_product_id) and (a.retreat_format is null or a.retreat_format = p_retreat_format) and a.state = 'blocked' and a.start_date <= d::date and a.end_date >= d::date)) then raise exception 'The configured availability no longer permits these private retreat dates.'; end if;
  if exists (select 1 from public.retreat_bookings b where (p_exclude_booking_id is null or b.id <> p_exclude_booking_id) and b.retreat_event_id is null and b.booking_status in ('confirmed','completed') and b.start_date <= requested_end_date and coalesce(b.end_date,b.start_date) >= p_start_date) then raise exception 'These dates are already occupied by another confirmed retreat.'; end if;
  if exists (select 1 from public.retreat_holds h where h.status = 'active' and h.expires_at > now() and h.retreat_event_id is null and h.start_date <= requested_end_date and coalesce(h.end_date,h.start_date) >= p_start_date) then raise exception 'These dates are already reserved by an active quote.'; end if;
end; $$;
revoke all on function retreat_private.validate_private_booking(uuid, public.retreat_format, date, date, smallint, uuid) from public, anon, authenticated;

create or replace function public.create_quote_with_hold(
  p_reference text, p_enquiry_id uuid, p_start_date date, p_end_date date, p_duration_days smallint,
  p_total_price numeric, p_deposit_required numeric, p_currency text, p_expiry_date date,
  p_notes text, p_payment_instructions text, p_payment_token_hash text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.retreat_enquiries%rowtype; qid uuid; ev public.retreat_events%rowtype; held smallint;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  select * into e from public.retreat_enquiries where id = p_enquiry_id for update;
  if e.id is null then raise exception 'Enquiry not found'; end if;
  if p_start_date is null or p_expiry_date < current_date or (p_end_date is not null and p_end_date < p_start_date) then raise exception 'Invalid quote dates or expiry'; end if;
  perform pg_catalog.pg_advisory_xact_lock(735391);
  if e.retreat_event_id is not null then
    select * into ev from public.retreat_events where id = e.retreat_event_id for update;
    if ev.id is null or ev.start_date <> p_start_date or ev.end_date <> p_end_date or ev.status <> 'published' then raise exception 'Group event quote dates are no longer available'; end if;
    select coalesce(sum(h.guest_count),0)::smallint into held from public.retreat_holds h where h.retreat_event_id = ev.id and h.status = 'active' and h.expires_at > now() and h.quote_id is distinct from null;
    if ev.available_places - held < e.guest_count then raise exception 'Group event no longer has enough places'; end if;
  else
    perform retreat_private.validate_private_booking(e.retreat_product_id, e.retreat_format, p_start_date, p_end_date, e.guest_count);
  end if;
  update public.retreat_holds set status = 'released' where enquiry_id = e.id and status = 'active' and expires_at > now();
  insert into public.retreat_quotes(reference,enquiry_id,retreat_product_id,retreat_type_name,retreat_format,start_date,end_date,duration_days,guest_count,total_price,deposit_required,currency,expiry_date,notes,payment_instructions,payment_token_hash,status,payment_status)
  values(p_reference,e.id,e.retreat_product_id,e.retreat_type_name,e.retreat_format,p_start_date,p_end_date,p_duration_days,e.guest_count,p_total_price,p_deposit_required,p_currency,p_expiry_date,p_notes,p_payment_instructions,p_payment_token_hash,'sent','unpaid') returning id into qid;
  insert into public.retreat_holds(quote_id,enquiry_id,retreat_product_id,retreat_format,start_date,end_date,guest_count,retreat_event_id,expires_at) values(qid,e.id,e.retreat_product_id,e.retreat_format,p_start_date,p_end_date,e.guest_count,e.retreat_event_id,p_expiry_date::timestamptz + interval '1 day' - interval '1 second');
  update public.retreat_enquiries set status = 'quoted' where id = e.id;
  return qid;
end; $$;
revoke all on function public.create_quote_with_hold(text,uuid,date,date,smallint,numeric,numeric,text,date,text,text,text) from public, anon;
grant execute on function public.create_quote_with_hold(text,uuid,date,date,smallint,numeric,numeric,text,date,text,text,text) to authenticated;

create or replace function retreat_private.convert_hold_after_booking() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.quote_id is not null then update public.retreat_holds set status = 'converted' where quote_id = new.quote_id and status = 'active'; end if;
  return new;
end; $$;
drop trigger if exists retreat_booking_converts_hold on public.retreat_bookings;
create trigger retreat_booking_converts_hold after insert on public.retreat_bookings for each row execute function retreat_private.convert_hold_after_booking();

create or replace function retreat_private.release_hold_on_quote_cancel() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' then update public.retreat_holds set status = 'released' where quote_id = new.id and status = 'active'; end if;
  return new;
end; $$;
drop trigger if exists retreat_quote_releases_hold on public.retreat_quotes;
create trigger retreat_quote_releases_hold after update of status on public.retreat_quotes for each row when (new.status = 'cancelled') execute function retreat_private.release_hold_on_quote_cancel();

create or replace function public.expire_retreat_holds() returns integer language plpgsql security definer set search_path = '' as $$ declare changed integer; begin if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if; update public.retreat_holds set status='expired' where status='active' and expires_at <= now(); get diagnostics changed = row_count; return changed; end; $$;
revoke all on function public.expire_retreat_holds() from public, anon;
grant execute on function public.expire_retreat_holds() to authenticated;

create or replace function retreat_private.validate_enquiry_hold_inventory() returns trigger language plpgsql security definer set search_path = '' as $$
declare reserved smallint;
begin
  if new.retreat_event_id is not null then
    select coalesce(sum(h.guest_count),0)::smallint into reserved from public.retreat_holds h where h.retreat_event_id = new.retreat_event_id and h.status='active' and h.expires_at > now();
    if exists (select 1 from public.retreat_events e where e.id = new.retreat_event_id and e.available_places - reserved < new.guest_count) then raise exception 'Group event is unavailable'; end if;
  elsif new.requested_start_date is not null and new.retreat_format <> 'join_a_group' then
    if exists (select 1 from public.retreat_holds h where h.status='active' and h.expires_at > now() and h.retreat_event_id is null and h.start_date <= new.requested_start_date and coalesce(h.end_date,h.start_date) >= new.requested_start_date) then raise exception 'Selected date is unavailable'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists retreat_enquiry_hold_inventory on public.retreat_enquiries;
create trigger retreat_enquiry_hold_inventory before insert on public.retreat_enquiries for each row execute function retreat_private.validate_enquiry_hold_inventory();
