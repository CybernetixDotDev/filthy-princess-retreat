alter table public.retreat_holds
  alter column expires_at drop not null;

alter table public.retreat_payment_submissions
  drop constraint if exists retreat_payment_submissions_status_check;

alter table public.retreat_payment_submissions
  add constraint retreat_payment_submissions_status_check
  check (status in ('submitted', 'verified', 'rejected'));

alter table public.retreat_payment_submissions
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.admin_users(user_id) on delete restrict,
  add column if not exists review_note text;

create or replace function public.get_private_arrival_availability(
  p_product_id uuid,
  p_format public.retreat_format,
  p_guest_count smallint,
  p_nights smallint,
  p_month_start date,
  p_month_end date
)
returns table (arrival_date date)
language sql
security definer
set search_path = ''
as $$
  select d::date
  from generate_series(greatest(p_month_start, current_date)::timestamp, p_month_end::timestamp, interval '1 day') d
  where p_format <> 'join_a_group'
    and p_nights between 1 and 31
    and not exists (
      select 1
      from generate_series(d::date, d::date + (p_nights - 1), interval '1 day') stay
      where not exists (
        select 1
        from public.retreat_availability a
        where (a.retreat_product_id is null or a.retreat_product_id = p_product_id)
          and (a.retreat_format is null or a.retreat_format = p_format)
          and a.state = 'available'
          and a.start_date <= stay::date and a.end_date >= stay::date
          and (a.capacity is null or a.capacity >= p_guest_count)
      )
      or exists (
        select 1 from public.retreat_availability a
        where (a.retreat_product_id is null or a.retreat_product_id = p_product_id)
          and (a.retreat_format is null or a.retreat_format = p_format)
          and a.state = 'blocked'
          and a.start_date <= stay::date and a.end_date >= stay::date
      )
      or exists (
        select 1 from public.retreat_bookings b
        where b.retreat_event_id is null and b.booking_status in ('confirmed', 'completed')
          and b.start_date <= stay::date and coalesce(b.end_date, b.start_date) >= stay::date
      )
      or exists (
        select 1 from public.retreat_holds h
        where h.retreat_event_id is null and h.status = 'active'
          and (h.expires_at is null or h.expires_at > now())
          and h.start_date <= stay::date and coalesce(h.end_date, h.start_date) >= stay::date
      )
      or exists (
        select 1 from public.retreat_events e
        where e.status = 'published' and e.start_date <= stay::date and e.end_date >= stay::date
      )
    )
  order by d;
$$;

revoke all on function public.get_private_arrival_availability(uuid, public.retreat_format, smallint, smallint, date, date) from public, anon, authenticated;
grant execute on function public.get_private_arrival_availability(uuid, public.retreat_format, smallint, smallint, date, date) to anon, authenticated;

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
    where h.retreat_event_id is null and h.status = 'active'
      and (h.expires_at is null or h.expires_at > now())
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
      select 1
      from public.retreat_availability a
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

create or replace function public.verify_invoice_payment(
  p_invoice_id uuid,
  p_review_note text default null
)
returns table (
  submission_status text,
  invoice_status text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  hold_status public.retreat_hold_status,
  hold_expires_at timestamptz,
  review_note text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission_row record;
  invoice_row record;
  hold_row record;
  review_time timestamptz;
  note_value text;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  note_value := nullif(left(trim(coalesce(p_review_note, '')), 500), '');

  select i.status as invoice_status
  into invoice_row
  from public.retreat_invoices i
  where i.id = p_invoice_id
  for update;
  if invoice_row.invoice_status is null then raise exception 'Invoice not found'; end if;

  select ps.status, ps.reviewed_at, ps.reviewed_by, ps.review_note
  into submission_row
  from public.retreat_payment_submissions ps
  where ps.invoice_id = p_invoice_id
  for update;
  if submission_row.status is null then raise exception 'Payment submission not found'; end if;

  select h.status, h.expires_at
  into hold_row
  from public.retreat_holds h
  join public.retreat_invoices i on i.quote_id = h.quote_id
  where i.id = p_invoice_id
  for update of h;
  if hold_row.status is null then raise exception 'Payment hold not found'; end if;

  if submission_row.status = 'verified' or submission_row.status = 'rejected' then
    return query select submission_row.status::text, invoice_row.invoice_status::text,
      submission_row.reviewed_at, submission_row.reviewed_by, hold_row.status,
      hold_row.expires_at, submission_row.review_note;
    return;
  end if;

  if submission_row.status <> 'submitted' then raise exception 'Payment submission is not awaiting review'; end if;
  if hold_row.status <> 'active' then raise exception 'Payment hold is no longer active'; end if;
  if hold_row.expires_at is not null and hold_row.expires_at <= now() then raise exception 'Payment hold has expired'; end if;

  review_time := now();
  update public.retreat_payment_submissions
  set status = 'verified', reviewed_at = review_time, reviewed_by = auth.uid(), review_note = note_value
  where invoice_id = p_invoice_id;
  update public.retreat_invoices set status = 'paid', updated_at = now()
  where id = p_invoice_id;
  update public.retreat_holds set expires_at = null, updated_at = now()
  where quote_id = (select i.quote_id from public.retreat_invoices i where i.id = p_invoice_id)
    and status = 'active';

  return query select 'verified'::text, 'paid'::text, review_time, auth.uid(),
    'active'::public.retreat_hold_status, null::timestamptz, note_value;
end;
$$;

create or replace function public.reject_invoice_payment(
  p_invoice_id uuid,
  p_review_note text default null
)
returns table (
  submission_status text,
  invoice_status text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  hold_status public.retreat_hold_status,
  hold_expires_at timestamptz,
  review_note text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission_row record;
  invoice_row record;
  hold_row record;
  review_time timestamptz;
  note_value text;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  note_value := nullif(left(trim(coalesce(p_review_note, '')), 500), '');

  select i.status as invoice_status
  into invoice_row
  from public.retreat_invoices i
  where i.id = p_invoice_id
  for update;
  if invoice_row.invoice_status is null then raise exception 'Invoice not found'; end if;

  select ps.status, ps.reviewed_at, ps.reviewed_by, ps.review_note
  into submission_row
  from public.retreat_payment_submissions ps
  where ps.invoice_id = p_invoice_id
  for update;
  if submission_row.status is null then raise exception 'Payment submission not found'; end if;

  select h.status, h.expires_at
  into hold_row
  from public.retreat_holds h
  join public.retreat_invoices i on i.quote_id = h.quote_id
  where i.id = p_invoice_id
  for update of h;
  if hold_row.status is null then raise exception 'Payment hold not found'; end if;

  if submission_row.status = 'verified' or submission_row.status = 'rejected' then
    return query select submission_row.status::text, invoice_row.invoice_status::text,
      submission_row.reviewed_at, submission_row.reviewed_by, hold_row.status,
      hold_row.expires_at, submission_row.review_note;
    return;
  end if;

  if submission_row.status <> 'submitted' then raise exception 'Payment submission is not awaiting review'; end if;

  review_time := now();
  update public.retreat_payment_submissions
  set status = 'rejected', reviewed_at = review_time, reviewed_by = auth.uid(), review_note = note_value
  where invoice_id = p_invoice_id;
  update public.retreat_invoices set status = 'awaiting_payment', updated_at = now()
  where id = p_invoice_id;
  update public.retreat_holds set status = 'released', updated_at = now()
  where quote_id = (select i.quote_id from public.retreat_invoices i where i.id = p_invoice_id)
    and status = 'active';

  return query select 'rejected'::text, 'awaiting_payment'::text, review_time, auth.uid(),
    'released'::public.retreat_hold_status, hold_row.expires_at, note_value;
end;
$$;

revoke all on function public.verify_invoice_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.reject_invoice_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_invoice_payment(uuid, text) to authenticated;
grant execute on function public.reject_invoice_payment(uuid, text) to authenticated;

-- A rejected submission remains the one historical submission for this invoice.
-- Keep the one-submission constraint and make a later public retry explicit.
create or replace function public.submit_invoice_payment(p_public_slug text)
returns table (
  submission_status text,
  submitted_at timestamptz,
  hold_status public.retreat_hold_status,
  hold_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row record;
  existing_submission record;
  existing_hold record;
  availability_row record;
  nights smallint;
  submission_time timestamptz;
  expiry_time timestamptz;
begin
  if p_public_slug is null or length(trim(p_public_slug)) not between 20 and 100 then
    raise exception 'Invalid invoice link';
  end if;

  select i.id as invoice_id, i.status as invoice_status, q.id as quote_id,
    q.enquiry_id, q.retreat_product_id, q.retreat_format, q.start_date,
    q.end_date, q.duration_days, q.guest_count
  into invoice_row
  from public.retreat_invoices i
  join public.retreat_quotes q on q.id = i.quote_id
  where i.public_slug = trim(p_public_slug)
  for update of i;

  if invoice_row.invoice_id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.invoice_status = 'cancelled' then raise exception 'Invoice is cancelled'; end if;

  select ps.status, ps.submitted_at into existing_submission
  from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id;

  if existing_submission.status = 'rejected' then raise exception 'Payment submission was rejected'; end if;
  if existing_submission.status = 'verified' then raise exception 'Payment has already been verified'; end if;
  if existing_submission.status = 'submitted' then
    select h.status, h.expires_at into existing_hold
    from public.retreat_holds h where h.quote_id = invoice_row.quote_id;
    return query select 'payment_submitted', existing_submission.submitted_at,
      existing_hold.status, existing_hold.expires_at;
    return;
  end if;

  if invoice_row.invoice_status <> 'awaiting_payment' then
    raise exception 'Invoice is not awaiting payment';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(735391);

  select ps.status, ps.submitted_at into existing_submission
  from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id;
  if existing_submission.status = 'rejected' then raise exception 'Payment submission was rejected'; end if;
  if existing_submission.status = 'verified' then raise exception 'Payment has already been verified'; end if;
  if existing_submission.status = 'submitted' then
    select h.status, h.expires_at into existing_hold
    from public.retreat_holds h where h.quote_id = invoice_row.quote_id;
    return query select 'payment_submitted', existing_submission.submitted_at,
      existing_hold.status, existing_hold.expires_at;
    return;
  end if;

  nights := coalesce(invoice_row.duration_days,
    case when invoice_row.end_date is null then 1
      else (invoice_row.end_date - invoice_row.start_date + 1)::smallint end);
  select * into availability_row
  from public.check_stay_availability(
    invoice_row.retreat_product_id, invoice_row.retreat_format,
    invoice_row.start_date, nights, invoice_row.guest_count
  );
  if not availability_row.available then raise exception 'Requested stay is no longer available'; end if;

  submission_time := now();
  expiry_time := submission_time + interval '24 hours';
  insert into public.retreat_payment_submissions(invoice_id, quote_id, enquiry_id, submitted_at)
  values (invoice_row.invoice_id, invoice_row.quote_id, invoice_row.enquiry_id, submission_time);
  update public.retreat_invoices set status = 'payment_submitted', updated_at = now()
  where id = invoice_row.invoice_id;
  insert into public.retreat_holds(
    quote_id, enquiry_id, retreat_product_id, retreat_format,
    start_date, end_date, guest_count, retreat_event_id, expires_at
  ) values (
    invoice_row.quote_id, invoice_row.enquiry_id, invoice_row.retreat_product_id,
    invoice_row.retreat_format, invoice_row.start_date,
    invoice_row.start_date + nights - 1, invoice_row.guest_count, null, expiry_time
  );

  return query select 'payment_submitted', submission_time,
    'active'::public.retreat_hold_status, expiry_time;
end;
$$;

revoke all on function public.submit_invoice_payment(text) from public, anon, authenticated;
grant execute on function public.submit_invoice_payment(text) to anon, authenticated;
