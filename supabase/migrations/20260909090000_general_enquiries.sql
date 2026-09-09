-- Allow a protected public enquiry without inventing retreat or date details.
alter table public.retreat_enquiries
  add column enquiry_type text not null default 'stay',
  alter column retreat_product_id drop not null,
  alter column retreat_type_name drop not null,
  alter column retreat_format drop not null,
  alter column guest_count drop not null;

alter table public.retreat_enquiries
  add constraint retreat_enquiries_type_valid
    check (enquiry_type in ('stay', 'general')),
  drop constraint retreat_enquiries_requested_date_present,
  add constraint retreat_enquiries_type_shape check (
    (
      enquiry_type = 'stay'
      and retreat_product_id is not null
      and retreat_type_name is not null
      and retreat_format is not null
      and guest_count is not null
      and (requested_start_date is not null or retreat_event_id is not null)
    )
    or
    (
      enquiry_type = 'general'
      and retreat_product_id is null
      and retreat_type_name is null
      and retreat_format is null
      and guest_count is null
      and requested_start_date is null
      and requested_end_date is null
      and alternative_date is null
      and retreat_event_id is null
    )
  );

create or replace function public.submit_general_retreat_enquiry(
  p_full_name text,
  p_email text,
  p_phone text,
  p_country text,
  p_message text,
  p_referral_code text,
  p_referral_source text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  enquiry_id uuid;
begin
  if nullif(pg_catalog.btrim(p_full_name), '') is null
    or pg_catalog.char_length(pg_catalog.btrim(p_full_name)) < 2
    or pg_catalog.char_length(pg_catalog.btrim(p_full_name)) > 200 then
    raise exception 'A valid name is required';
  end if;
  if nullif(pg_catalog.btrim(p_email), '') is null
    or pg_catalog.strpos(pg_catalog.btrim(p_email), '@') <= 1
    or pg_catalog.char_length(pg_catalog.btrim(p_email)) > 320 then
    raise exception 'A valid email is required';
  end if;
  if nullif(pg_catalog.btrim(p_phone), '') is null
    or pg_catalog.char_length(pg_catalog.btrim(p_phone)) < 3
    or pg_catalog.char_length(pg_catalog.btrim(p_phone)) > 100 then
    raise exception 'A valid phone number is required';
  end if;
  if nullif(pg_catalog.btrim(p_country), '') is null
    or pg_catalog.char_length(pg_catalog.btrim(p_country)) < 2
    or pg_catalog.char_length(pg_catalog.btrim(p_country)) > 100 then
    raise exception 'A valid country is required';
  end if;
  if p_message is not null and pg_catalog.char_length(pg_catalog.btrim(p_message)) > 2000 then
    raise exception 'Message is too long';
  end if;
  if p_referral_code is not null and pg_catalog.char_length(p_referral_code) > 100 then
    raise exception 'Referral code is too long';
  end if;
  if p_referral_source is not null and p_referral_source <> 'url' then
    raise exception 'Invalid referral source';
  end if;

  insert into public.retreat_enquiries (
    enquiry_type,
    full_name,
    email,
    phone,
    country,
    message,
    referral_code,
    referral_source
  ) values (
    'general',
    pg_catalog.btrim(p_full_name),
    pg_catalog.lower(pg_catalog.btrim(p_email)),
    pg_catalog.btrim(p_phone),
    pg_catalog.btrim(p_country),
    nullif(pg_catalog.btrim(p_message), ''),
    nullif(p_referral_code, ''),
    p_referral_source
  )
  returning id into enquiry_id;

  return enquiry_id;
end;
$$;

revoke all on function public.submit_general_retreat_enquiry(text,text,text,text,text,text,text) from public;
revoke all on function public.submit_general_retreat_enquiry(text,text,text,text,text,text,text) from anon, authenticated;
grant execute on function public.submit_general_retreat_enquiry(text,text,text,text,text,text,text) to anon, authenticated;
