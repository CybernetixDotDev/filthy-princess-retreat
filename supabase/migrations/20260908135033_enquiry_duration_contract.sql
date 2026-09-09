create or replace function public.submit_retreat_enquiry_with_dates(
  p_full_name text,p_email text,p_phone text,p_country text,p_retreat_product_id uuid,p_retreat_format public.retreat_format,p_guest_count smallint,p_selected_date date,p_selected_end_date date,p_alternative_date date,p_event_id uuid,p_message text,p_referral_code text,p_referral_source text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare enquiry_id uuid;
begin
  if p_event_id is null and p_selected_date is not null and p_selected_end_date is not null and p_selected_end_date < p_selected_date then raise exception 'Checkout must be after arrival'; end if;
  enquiry_id := public.submit_retreat_enquiry(p_full_name,p_email,p_phone,p_country,p_retreat_product_id,p_retreat_format,p_guest_count,p_selected_date,p_alternative_date,p_event_id,p_message,p_referral_code,p_referral_source);
  if p_event_id is null then update public.retreat_enquiries set requested_end_date = p_selected_end_date where id = enquiry_id; end if;
  return enquiry_id;
end; $$;
revoke all on function public.submit_retreat_enquiry_with_dates(text,text,text,text,uuid,public.retreat_format,smallint,date,date,date,uuid,text,text,text) from public;
grant execute on function public.submit_retreat_enquiry_with_dates(text,text,text,text,uuid,public.retreat_format,smallint,date,date,date,uuid,text,text,text) to anon, authenticated;
