alter table public.retreat_enquiries
  add column estimated_total numeric(12,2),
  add column estimated_currency text,
  add column estimated_nights smallint;

alter table public.retreat_enquiries
  add constraint retreat_enquiries_estimate_complete check (
    (estimated_total is null and estimated_currency is null and estimated_nights is null)
    or
    (
      estimated_total >= 0
      and estimated_currency ~ '^[A-Z]{3}$'
      and estimated_nights > 0
    )
  );

-- Product-aware public interest is still a stay enquiry, but a date is intentionally
-- established later through Cally's correspondence rather than in the public form.
alter table public.retreat_enquiries
  drop constraint retreat_enquiries_type_shape,
  add constraint retreat_enquiries_type_shape check (
    (
      enquiry_type = 'stay'
      and retreat_product_id is not null
      and retreat_type_name is not null
      and retreat_format is not null
      and guest_count is not null
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
      and estimated_total is null
      and estimated_currency is null
      and estimated_nights is null
    )
  );

create function public.submit_public_retreat_interest(
  p_full_name text,
  p_email text,
  p_retreat_product_id uuid,
  p_retreat_format public.retreat_format,
  p_guest_count smallint,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_product public.retreat_products%rowtype;
  authoritative_price record;
  canonical_guest_count smallint;
  new_enquiry_id uuid;
begin
  if nullif(pg_catalog.btrim(p_full_name), '') is null
    or pg_catalog.char_length(pg_catalog.btrim(p_full_name)) not between 2 and 200
    or nullif(pg_catalog.btrim(p_email), '') is null
    or pg_catalog.strpos(pg_catalog.btrim(p_email), '@') <= 1
    or pg_catalog.char_length(pg_catalog.btrim(p_email)) > 320
    or (p_message is not null and pg_catalog.char_length(pg_catalog.btrim(p_message)) > 2000) then
    raise exception 'Invalid enquiry details';
  end if;

  if p_retreat_format not in ('solo', 'couples', 'private_group') then
    raise exception 'Private retreat format required';
  end if;

  canonical_guest_count := case
    when p_retreat_format = 'solo' then 1
    when p_retreat_format = 'couples' then 2
    else p_guest_count
  end;

  if canonical_guest_count is null or canonical_guest_count not between 1 and 50 then
    raise exception 'Guest count must be between 1 and 50';
  end if;

  select * into selected_product
  from public.retreat_products
  where id = p_retreat_product_id
    and is_published = true
    and p_retreat_format = any(allowed_formats);

  if selected_product.id is null then
    raise exception 'Retreat selection is unavailable';
  end if;

  select * into authoritative_price
  from public.get_public_retreat_price(
    selected_product.id,
    p_retreat_format,
    canonical_guest_count
  );

  if authoritative_price.total_usd is null then
    raise exception 'Retreat price is unavailable';
  end if;

  insert into public.retreat_enquiries (
    enquiry_type,
    full_name,
    email,
    phone,
    country,
    retreat_product_id,
    retreat_type_name,
    retreat_format,
    guest_count,
    message,
    estimated_total,
    estimated_currency,
    estimated_nights
  ) values (
    'stay',
    pg_catalog.btrim(p_full_name),
    pg_catalog.lower(pg_catalog.btrim(p_email)),
    'Not provided',
    'Not provided',
    selected_product.id,
    selected_product.name,
    p_retreat_format,
    authoritative_price.guest_count,
    nullif(pg_catalog.btrim(p_message), ''),
    authoritative_price.total_usd,
    authoritative_price.currency,
    authoritative_price.nights
  )
  returning id into new_enquiry_id;

  return new_enquiry_id;
end;
$$;

revoke all on function public.submit_public_retreat_interest(text, text, uuid, public.retreat_format, smallint, text) from public;
revoke all on function public.submit_public_retreat_interest(text, text, uuid, public.retreat_format, smallint, text) from anon, authenticated;
grant execute on function public.submit_public_retreat_interest(text, text, uuid, public.retreat_format, smallint, text) to anon, authenticated;
