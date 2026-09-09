alter table public.retreat_availability
  alter column retreat_product_id drop not null,
  alter column retreat_format drop not null;

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
  if exists (select 1 from generate_series(p_start_date::timestamp, requested_end_date::timestamp, interval '1 day') d where
    not exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id = p_retreat_product_id) and (a.retreat_format is null or a.retreat_format = p_retreat_format) and a.state = 'available' and a.start_date <= d::date and a.end_date >= d::date and (a.capacity is null or a.capacity >= p_guest_count))
    or exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id = p_retreat_product_id) and (a.retreat_format is null or a.retreat_format = p_retreat_format) and a.state = 'blocked' and a.start_date <= d::date and a.end_date >= d::date)
  ) then raise exception 'The configured availability no longer permits these private retreat dates.'; end if;
  if exists (select 1 from public.retreat_bookings b where (p_exclude_booking_id is null or b.id <> p_exclude_booking_id) and b.retreat_event_id is null and b.booking_status in ('confirmed','completed') and b.start_date <= requested_end_date and coalesce(b.end_date,b.start_date) >= p_start_date) then raise exception 'These dates are already occupied by another confirmed retreat.'; end if;
end; $$;
revoke all on function retreat_private.validate_private_booking(uuid, public.retreat_format, date, date, smallint, uuid) from public, anon, authenticated;

create or replace function public.submit_retreat_enquiry(
  p_full_name text, p_email text, p_phone text, p_country text, p_retreat_product_id uuid,
  p_retreat_format public.retreat_format, p_guest_count smallint, p_selected_date date,
  p_alternative_date date, p_event_id uuid, p_message text, p_referral_code text, p_referral_source text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_product public.retreat_products%rowtype; selected_event public.retreat_events%rowtype; new_enquiry_id uuid; requested_start date; requested_end date;
begin
  if char_length(trim(p_full_name)) not between 2 and 200 or char_length(trim(p_phone)) not between 3 and 100 or char_length(trim(p_country)) not between 2 and 100 or char_length(trim(p_email)) > 320 or position('@' in trim(p_email)) <= 1 or p_guest_count not between 1 and 50 or (p_message is not null and char_length(p_message) > 2000) or (p_referral_code is not null and p_referral_code !~ '^[A-Za-z0-9_-]{1,100}$') or (p_referral_source is not null and p_referral_source <> 'url') then raise exception 'Invalid enquiry details'; end if;
  select * into selected_product from public.retreat_products where id = p_retreat_product_id and is_published and p_retreat_format = any(allowed_formats);
  if selected_product.id is null then raise exception 'Retreat selection is unavailable'; end if;
  if p_event_id is not null then
    if p_retreat_format <> 'join_a_group' then raise exception 'Group events require the Join a Group format'; end if;
    select * into selected_event from public.retreat_events where id = p_event_id and retreat_product_id = p_retreat_product_id and retreat_format = 'join_a_group' and status = 'published' and start_date >= current_date and available_places >= p_guest_count;
    if selected_event.id is null then raise exception 'Group event is unavailable'; end if;
    requested_start := selected_event.start_date; requested_end := selected_event.end_date;
  else
    if p_retreat_format = 'join_a_group' or p_selected_date is null or p_selected_date < current_date then raise exception 'An available date or group event is required'; end if;
    if not exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id = p_retreat_product_id) and (a.retreat_format is null or a.retreat_format = p_retreat_format) and a.state = 'available' and a.start_date <= p_selected_date and a.end_date >= p_selected_date and (a.capacity is null or a.capacity >= p_guest_count)) or exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id = p_retreat_product_id) and (a.retreat_format is null or a.retreat_format = p_retreat_format) and a.state = 'blocked' and a.start_date <= p_selected_date and a.end_date >= p_selected_date) then raise exception 'Selected date is unavailable'; end if;
    requested_start := p_selected_date; requested_end := null;
  end if;
  insert into public.retreat_enquiries (full_name,email,phone,country,retreat_product_id,retreat_type_name,retreat_format,guest_count,requested_start_date,requested_end_date,alternative_date,retreat_event_id,message,referral_code,referral_source) values (trim(p_full_name),lower(trim(p_email)),trim(p_phone),trim(p_country),selected_product.id,selected_product.name,p_retreat_format,p_guest_count,requested_start,requested_end,p_alternative_date,p_event_id,nullif(trim(p_message),''),p_referral_code,p_referral_source) returning id into new_enquiry_id;
  return new_enquiry_id;
end; $$;
revoke all on function public.submit_retreat_enquiry(text,text,text,text,uuid,public.retreat_format,smallint,date,date,uuid,text,text,text) from public;
grant execute on function public.submit_retreat_enquiry(text,text,text,text,uuid,public.retreat_format,smallint,date,date,uuid,text,text,text) to anon, authenticated;
