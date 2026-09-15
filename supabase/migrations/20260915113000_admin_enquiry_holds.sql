alter table public.retreat_holds
  alter column quote_id drop not null;

create or replace function retreat_private.pre_quote_hold_duration()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '72 hours' $$;

create or replace function public.get_admin_arrival_availability(
  p_product_id uuid,
  p_format public.retreat_format,
  p_nights smallint,
  p_guest_count smallint,
  p_range_start date,
  p_range_end date
) returns table (
  available boolean,
  state text,
  arrival_date date,
  nights smallint,
  checkout_date date,
  occupied_start date,
  occupied_end date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  if p_range_start is null or p_range_end is null or p_range_end < p_range_start
    or p_range_end - p_range_start > 93 or p_nights not between 1 and 31 then
    raise exception 'Invalid availability range';
  end if;

  return query
    select evaluation.evaluated_state = 'available', evaluation.evaluated_state, day_value::date, p_nights,
      day_value::date + p_nights, day_value::date, day_value::date + p_nights - 1
    from generate_series(p_range_start::timestamp, p_range_end::timestamp, interval '1 day') day_value
    cross join lateral (select retreat_private.evaluate_retreat_stay(
      p_product_id, p_format, day_value::date, day_value::date + p_nights - 1, p_guest_count
    ) as evaluated_state) evaluation
    order by day_value;
end;
$$;
revoke all on function public.get_admin_arrival_availability(uuid, public.retreat_format, smallint, smallint, date, date) from public, anon;
grant execute on function public.get_admin_arrival_availability(uuid, public.retreat_format, smallint, smallint, date, date) to authenticated;

create or replace function public.set_admin_enquiry_retreat_date(
  p_enquiry_id uuid,
  p_arrival date
) returns table (start_date date, end_date date, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  enquiry_row public.retreat_enquiries%rowtype;
  occupied_end date;
  evaluated_state text;
  hold_expiry timestamptz;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  if p_arrival is null then raise exception 'Arrival date is required'; end if;

  select * into enquiry_row from public.retreat_enquiries where id = p_enquiry_id for update;
  if enquiry_row.id is null or enquiry_row.enquiry_type <> 'stay'
    or enquiry_row.retreat_product_id is null or enquiry_row.retreat_format not in ('solo', 'couples', 'private_group')
    or enquiry_row.guest_count is null then
    raise exception 'A complete private retreat enquiry is required';
  end if;
  if exists (select 1 from public.retreat_quotes where enquiry_id = enquiry_row.id) then
    raise exception 'A quoted enquiry date cannot be changed';
  end if;

  occupied_end := p_arrival + 2;
  perform pg_catalog.pg_advisory_xact_lock(735391);
  update public.retreat_holds
  set status = 'released', updated_at = now()
  where enquiry_id = enquiry_row.id and quote_id is null and status = 'active'
    and (expires_at is null or expires_at > now());

  evaluated_state := retreat_private.evaluate_retreat_stay(
    enquiry_row.retreat_product_id, enquiry_row.retreat_format, p_arrival, occupied_end, enquiry_row.guest_count
  );
  if evaluated_state <> 'available' then raise exception 'The selected stay is no longer available'; end if;

  hold_expiry := now() + retreat_private.pre_quote_hold_duration();
  update public.retreat_enquiries
  set requested_start_date = p_arrival, requested_end_date = occupied_end
  where id = enquiry_row.id;
  insert into public.retreat_holds (
    quote_id, enquiry_id, retreat_product_id, retreat_format, start_date, end_date, guest_count, retreat_event_id, status, expires_at
  ) values (
    null, enquiry_row.id, enquiry_row.retreat_product_id, enquiry_row.retreat_format, p_arrival, occupied_end,
    enquiry_row.guest_count, null, 'active', hold_expiry
  );
  return query select p_arrival, occupied_end, hold_expiry;
end;
$$;
revoke all on function public.set_admin_enquiry_retreat_date(uuid, date) from public, anon;
grant execute on function public.set_admin_enquiry_retreat_date(uuid, date) to authenticated;

create or replace function public.release_admin_enquiry_hold(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  if exists (select 1 from public.retreat_quotes where enquiry_id = p_enquiry_id) then
    raise exception 'A quoted enquiry hold cannot be released here';
  end if;
  update public.retreat_holds set status = 'released', updated_at = now()
  where enquiry_id = p_enquiry_id and quote_id is null and status = 'active';
  update public.retreat_enquiries set requested_start_date = null, requested_end_date = null
  where id = p_enquiry_id;
end;
$$;
revoke all on function public.release_admin_enquiry_hold(uuid) from public, anon;
grant execute on function public.release_admin_enquiry_hold(uuid) to authenticated;

create or replace function public.adopt_enquiry_hold_for_quote(p_enquiry_id uuid, p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  update public.retreat_holds
  set quote_id = p_quote_id, expires_at = null, updated_at = now()
  where id = (
    select id from public.retreat_holds
    where enquiry_id = p_enquiry_id and quote_id is null and status = 'active' and expires_at > now()
    order by created_at desc limit 1 for update
  );
  if not found then raise exception 'An active enquiry hold is required before generating a quote'; end if;
end;
$$;
revoke all on function public.adopt_enquiry_hold_for_quote(uuid, uuid) from public, anon;
grant execute on function public.adopt_enquiry_hold_for_quote(uuid, uuid) to authenticated;

create or replace function retreat_private.adopt_enquiry_hold_on_quote_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare requires_pre_quote_hold boolean;
begin
  select estimated_nights is not null into requires_pre_quote_hold
  from public.retreat_enquiries where id = new.enquiry_id for update;
  if requires_pre_quote_hold then
    update public.retreat_holds
    set quote_id = new.id, expires_at = null, updated_at = now()
    where id = (
      select id from public.retreat_holds
      where enquiry_id = new.enquiry_id and quote_id is null and status = 'active' and expires_at > now()
      order by created_at desc limit 1 for update
    );
    if not found then raise exception 'An active enquiry hold is required before generating a quote'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists retreat_quote_adopts_enquiry_hold on public.retreat_quotes;
create trigger retreat_quote_adopts_enquiry_hold
  before insert on public.retreat_quotes
  for each row execute function retreat_private.adopt_enquiry_hold_on_quote_insert();

create or replace function public.submit_invoice_payment(p_public_slug text)
returns table (submission_status text, submitted_at timestamptz, hold_status public.retreat_hold_status, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare invoice_row record; latest_submission record; existing_hold record; availability_row record; nights smallint; submission_time timestamptz;
begin
  if p_public_slug is null or length(trim(p_public_slug)) not between 20 and 100 then raise exception 'Invalid invoice link'; end if;
  select i.id as invoice_id, i.status as invoice_status, i.retry_allowed_at, q.id as quote_id, q.enquiry_id,
    q.retreat_product_id, q.retreat_format, q.start_date, q.end_date, q.duration_days, q.guest_count
  into invoice_row from public.retreat_invoices i join public.retreat_quotes q on q.id = i.quote_id
  where i.public_slug = trim(p_public_slug) for update of i;
  if invoice_row.invoice_id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.invoice_status = 'cancelled' then raise exception 'Invoice is cancelled'; end if;
  if invoice_row.invoice_status = 'paid' then raise exception 'Payment has already been verified'; end if;

  select ps.status, ps.submitted_at into latest_submission from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id order by ps.submitted_at desc limit 1;
  if latest_submission.status = 'submitted' then
    select h.status, h.expires_at into existing_hold from public.retreat_holds h where h.quote_id = invoice_row.quote_id and h.status = 'active';
    return query select 'payment_submitted', latest_submission.submitted_at, existing_hold.status, existing_hold.expires_at; return;
  end if;
  if latest_submission.status = 'rejected' and invoice_row.retry_allowed_at is null then raise exception 'Payment submission was rejected; contact Cally'; end if;
  if invoice_row.invoice_status <> 'awaiting_payment' then raise exception 'Invoice is not awaiting payment'; end if;

  perform pg_catalog.pg_advisory_xact_lock(735391);
  select ps.status, ps.submitted_at into latest_submission from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id order by ps.submitted_at desc limit 1;
  if latest_submission.status = 'submitted' then
    select h.status, h.expires_at into existing_hold from public.retreat_holds h where h.quote_id = invoice_row.quote_id and h.status = 'active';
    return query select 'payment_submitted', latest_submission.submitted_at, existing_hold.status, existing_hold.expires_at; return;
  end if;
  if latest_submission.status = 'rejected' and invoice_row.retry_allowed_at is null then raise exception 'Payment submission was rejected; contact Cally'; end if;

  nights := coalesce(invoice_row.duration_days, case when invoice_row.end_date is null then 1 else (invoice_row.end_date - invoice_row.start_date + 1)::smallint end);
  select * into availability_row from public.check_stay_availability(invoice_row.retreat_product_id, invoice_row.retreat_format, invoice_row.start_date, nights, invoice_row.guest_count);
  if not availability_row.available and not exists (
    select 1 from public.retreat_holds h where h.quote_id = invoice_row.quote_id and h.status = 'active' and h.expires_at is null
  ) then raise exception 'Requested stay is no longer available'; end if;

  submission_time := now();
  insert into public.retreat_payment_submissions(invoice_id, quote_id, enquiry_id, submitted_at)
  values (invoice_row.invoice_id, invoice_row.quote_id, invoice_row.enquiry_id, submission_time);
  update public.retreat_invoices set status = 'payment_submitted', retry_allowed_at = null, retry_allowed_by = null, updated_at = now() where id = invoice_row.invoice_id;
  select h.status, h.expires_at into existing_hold from public.retreat_holds h
  where h.quote_id = invoice_row.quote_id and h.status = 'active' order by h.created_at desc limit 1 for update;
  if existing_hold.status is null then
    insert into public.retreat_holds(quote_id, enquiry_id, retreat_product_id, retreat_format, start_date, end_date, guest_count, retreat_event_id, expires_at)
    values (invoice_row.quote_id, invoice_row.enquiry_id, invoice_row.retreat_product_id, invoice_row.retreat_format, invoice_row.start_date, invoice_row.start_date + nights - 1, invoice_row.guest_count, null, null);
  else
    update public.retreat_holds set expires_at = null, updated_at = now() where quote_id = invoice_row.quote_id and status = 'active';
  end if;
  return query select 'payment_submitted', submission_time, 'active'::public.retreat_hold_status, null::timestamptz;
end;
$$;
revoke all on function public.submit_invoice_payment(text) from public, anon, authenticated;
grant execute on function public.submit_invoice_payment(text) to anon, authenticated;