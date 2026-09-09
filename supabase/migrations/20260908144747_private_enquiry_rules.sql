-- Enquiries remain non-reserving, but validate the requested private combination server-side.
create or replace function retreat_private.validate_private_enquiry_shape()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.retreat_event_id is not null then return new; end if;
  if new.retreat_format = 'solo' and new.guest_count <> 1 then raise exception 'Solo retreats require 1 guest'; end if;
  if new.retreat_format = 'couples' and new.guest_count <> 2 then raise exception 'Couples retreats require 2 guests'; end if;
  if new.retreat_format = 'join_a_group' then raise exception 'Choose a published event for Join a Group'; end if;
  return new;
end; $$;
drop trigger if exists validate_private_enquiry_shape on public.retreat_enquiries;
create trigger validate_private_enquiry_shape before insert on public.retreat_enquiries for each row execute function retreat_private.validate_private_enquiry_shape();

create or replace function public.submit_retreat_enquiry_with_dates(
  p_full_name text,p_email text,p_phone text,p_country text,p_retreat_product_id uuid,p_retreat_format public.retreat_format,p_guest_count smallint,p_selected_date date,p_selected_end_date date,p_alternative_date date,p_event_id uuid,p_message text,p_referral_code text,p_referral_source text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare enquiry_id uuid; requested_end date;
begin
  if p_event_id is null and p_selected_date is not null and p_selected_end_date is not null and p_selected_end_date < p_selected_date then raise exception 'Checkout must be after arrival'; end if;
  enquiry_id := public.submit_retreat_enquiry(p_full_name,p_email,p_phone,p_country,p_retreat_product_id,p_retreat_format,p_guest_count,p_selected_date,p_alternative_date,p_event_id,p_message,p_referral_code,p_referral_source);
  if p_event_id is null then
    requested_end := coalesce(p_selected_end_date,p_selected_date);
    update public.retreat_enquiries set requested_end_date = requested_end where id = enquiry_id;
    perform pg_catalog.pg_advisory_xact_lock(735391);
    if exists (select 1 from public.retreat_events e where e.status = 'published' and e.start_date <= requested_end and e.end_date >= p_selected_date) then raise exception 'These dates are reserved for a published event'; end if;
    if exists (select 1 from public.retreat_bookings b where b.retreat_event_id is null and b.booking_status in ('confirmed','completed') and b.start_date <= requested_end and coalesce(b.end_date,b.start_date) >= p_selected_date) then raise exception 'These dates are already occupied'; end if;
    if exists (select 1 from public.retreat_holds h where h.retreat_event_id is null and h.status = 'active' and h.expires_at > now() and h.start_date <= requested_end and coalesce(h.end_date,h.start_date) >= p_selected_date) then raise exception 'These dates are currently reserved'; end if;
    if exists (select 1 from generate_series(p_selected_date::timestamp, requested_end::timestamp, interval '1 day') d where not exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id = p_retreat_product_id) and (a.retreat_format is null or a.retreat_format = p_retreat_format) and a.state='available' and a.start_date <= d::date and a.end_date >= d::date and (a.capacity is null or a.capacity >= p_guest_count)) or exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id = p_retreat_product_id) and (a.retreat_format is null or a.retreat_format = p_retreat_format) and a.state='blocked' and a.start_date <= d::date and a.end_date >= d::date)) then raise exception 'Selected date is unavailable'; end if;
  end if;
  return enquiry_id;
end; $$;
revoke all on function public.submit_retreat_enquiry_with_dates(text,text,text,text,uuid,public.retreat_format,smallint,date,date,date,uuid,text,text,text) from public;
grant execute on function public.submit_retreat_enquiry_with_dates(text,text,text,text,uuid,public.retreat_format,smallint,date,date,date,uuid,text,text,text) to anon, authenticated;
