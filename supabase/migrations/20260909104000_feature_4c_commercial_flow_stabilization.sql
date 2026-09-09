-- Payment-review holds are commercial commitments, not timed availability holds.
update public.retreat_holds h
set expires_at = null, updated_at = now()
where h.status = 'active'
  and exists (
    select 1
    from public.retreat_payment_submissions ps
    where ps.quote_id = h.quote_id
      and ps.status in ('submitted', 'verified')
  );

drop function if exists public.get_public_quote_by_slug(text);

create function public.get_public_quote_by_slug(p_public_slug text)
returns table (
  id uuid,
  guest_name text,
  retreat_type_name text,
  retreat_format public.retreat_format,
  guest_count smallint,
  start_date date,
  end_date date,
  nights integer,
  total_price numeric(12,2),
  rate_usd_per_person_per_night numeric(12,2),
  currency text,
  invoice_public_slug text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select q.id, e.full_name, q.retreat_type_name, q.retreat_format, q.guest_count,
    q.start_date, q.end_date,
    case when q.end_date is not null then 1 + (q.end_date - q.start_date) else 1 end::integer,
    q.total_price, q.rate_usd_per_person_per_night, q.currency,
    i.public_slug, q.created_at
  from public.retreat_quotes q
  join public.retreat_enquiries e on e.id = q.enquiry_id
  left join public.retreat_invoices i on i.quote_id = q.id
  where q.public_slug = p_public_slug
  limit 1;
$$;

revoke all on function public.get_public_quote_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_public_quote_by_slug(text) to anon, authenticated;

create or replace function public.submit_invoice_payment(p_public_slug text)
returns table (submission_status text, submitted_at timestamptz, hold_status public.retreat_hold_status, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row record;
  latest_submission record;
  existing_hold record;
  availability_row record;
  nights smallint;
  submission_time timestamptz;
begin
  if p_public_slug is null or length(trim(p_public_slug)) not between 20 and 100 then raise exception 'Invalid invoice link'; end if;
  select i.id as invoice_id, i.status as invoice_status, i.retry_allowed_at,
    q.id as quote_id, q.enquiry_id, q.retreat_product_id, q.retreat_format,
    q.start_date, q.end_date, q.duration_days, q.guest_count
  into invoice_row
  from public.retreat_invoices i
  join public.retreat_quotes q on q.id = i.quote_id
  where i.public_slug = trim(p_public_slug)
  for update of i;
  if invoice_row.invoice_id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.invoice_status = 'cancelled' then raise exception 'Invoice is cancelled'; end if;
  if invoice_row.invoice_status = 'paid' then raise exception 'Payment has already been verified'; end if;

  select ps.status, ps.submitted_at into latest_submission
  from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id
  order by ps.submitted_at desc limit 1;
  if latest_submission.status = 'submitted' then
    select h.status, h.expires_at into existing_hold from public.retreat_holds h where h.quote_id = invoice_row.quote_id and h.status = 'active';
    return query select 'payment_submitted', latest_submission.submitted_at, existing_hold.status, existing_hold.expires_at;
    return;
  end if;
  if latest_submission.status = 'rejected' and invoice_row.retry_allowed_at is null then raise exception 'Payment submission was rejected; contact Cally'; end if;
  if invoice_row.invoice_status <> 'awaiting_payment' then raise exception 'Invoice is not awaiting payment'; end if;

  perform pg_catalog.pg_advisory_xact_lock(735391);
  select ps.status, ps.submitted_at into latest_submission
  from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id
  order by ps.submitted_at desc limit 1;
  if latest_submission.status = 'submitted' then
    select h.status, h.expires_at into existing_hold from public.retreat_holds h where h.quote_id = invoice_row.quote_id and h.status = 'active';
    return query select 'payment_submitted', latest_submission.submitted_at, existing_hold.status, existing_hold.expires_at;
    return;
  end if;
  if latest_submission.status = 'rejected' and invoice_row.retry_allowed_at is null then raise exception 'Payment submission was rejected; contact Cally'; end if;

  nights := coalesce(invoice_row.duration_days, case when invoice_row.end_date is null then 1 else (invoice_row.end_date - invoice_row.start_date + 1)::smallint end);
  select * into availability_row from public.check_stay_availability(invoice_row.retreat_product_id, invoice_row.retreat_format, invoice_row.start_date, nights, invoice_row.guest_count);
  if not availability_row.available then raise exception 'Requested stay is no longer available'; end if;

  submission_time := now();
  insert into public.retreat_payment_submissions(invoice_id, quote_id, enquiry_id, submitted_at)
  values (invoice_row.invoice_id, invoice_row.quote_id, invoice_row.enquiry_id, submission_time);
  update public.retreat_invoices set status = 'payment_submitted', retry_allowed_at = null, retry_allowed_by = null, updated_at = now() where id = invoice_row.invoice_id;
  insert into public.retreat_holds(quote_id, enquiry_id, retreat_product_id, retreat_format, start_date, end_date, guest_count, retreat_event_id, expires_at)
  values (invoice_row.quote_id, invoice_row.enquiry_id, invoice_row.retreat_product_id, invoice_row.retreat_format, invoice_row.start_date, invoice_row.start_date + nights - 1, invoice_row.guest_count, null, null);
  return query select 'payment_submitted', submission_time, 'active'::public.retreat_hold_status, null::timestamptz;
end;
$$;

revoke all on function public.submit_invoice_payment(text) from public, anon, authenticated;
grant execute on function public.submit_invoice_payment(text) to anon, authenticated;

create or replace function public.get_public_invoice_by_quote_slug(p_public_quote_slug text)
returns table (public_slug text)
language sql
security definer
set search_path = ''
as $$
  select i.public_slug
  from public.retreat_invoices i
  join public.retreat_quotes q on q.id = i.quote_id
  where q.public_slug = p_public_quote_slug
  limit 1;
$$;

revoke all on function public.get_public_invoice_by_quote_slug(text) from public, anon, authenticated;
grant execute on function public.get_public_invoice_by_quote_slug(text) to anon, authenticated;

create or replace function public.create_public_invoice(
  p_public_quote_slug text,
  p_amount_usd numeric,
  p_eth_price_usd numeric,
  p_amount_eth numeric,
  p_wallet_address text,
  p_invoice_reference text,
  p_public_slug text
)
returns table (public_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_row record;
  existing_slug text;
begin
  if p_public_quote_slug is null or length(trim(p_public_quote_slug)) not between 20 and 100 then raise exception 'Invalid quote link'; end if;
  select i.public_slug into existing_slug
  from public.retreat_invoices i
  join public.retreat_quotes q on q.id = i.quote_id
  where q.public_slug = trim(p_public_quote_slug)
  limit 1;
  if existing_slug is not null then return query select existing_slug; return; end if;

  select q.id, q.enquiry_id, q.total_price into quote_row
  from public.retreat_quotes q
  where q.public_slug = trim(p_public_quote_slug)
  for update;
  if quote_row.id is null then raise exception 'Quote not found'; end if;
  if p_amount_usd <> quote_row.total_price or p_amount_usd < 0 or p_eth_price_usd <= 0 or p_amount_eth <= 0
    or nullif(trim(p_wallet_address), '') is null or nullif(trim(p_invoice_reference), '') is null
    or nullif(trim(p_public_slug), '') is null then raise exception 'Invalid invoice snapshot'; end if;

  insert into public.retreat_invoices(
    quote_id, enquiry_id, invoice_reference, amount_usd, eth_price_usd, amount_eth,
    wallet_address, public_slug, status, retry_allowed_at, retry_allowed_by
  ) values (
    quote_row.id, quote_row.enquiry_id, p_invoice_reference, p_amount_usd, p_eth_price_usd, p_amount_eth,
    trim(p_wallet_address), p_public_slug, 'awaiting_payment', null, null
  ) returning public.retreat_invoices.public_slug into existing_slug;
  return query select existing_slug;
end;
$$;

revoke all on function public.create_public_invoice(text, numeric, numeric, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_invoice(text, numeric, numeric, numeric, text, text, text) to anon, authenticated;
