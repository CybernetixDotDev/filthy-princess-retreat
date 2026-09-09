alter table public.retreat_invoices
  add column if not exists retry_allowed_at timestamptz,
  add column if not exists retry_allowed_by uuid references public.admin_users(user_id) on delete restrict;

alter table public.retreat_payment_submissions
  drop constraint if exists retreat_payment_submissions_invoice_id_key;
create unique index if not exists retreat_payment_submissions_one_submitted_idx
  on public.retreat_payment_submissions(invoice_id)
  where status = 'submitted';

alter table public.retreat_holds
  drop constraint if exists retreat_holds_quote_id_key;
create unique index if not exists retreat_holds_one_active_per_quote_idx
  on public.retreat_holds(quote_id)
  where status = 'active';

drop function if exists public.get_public_invoice_by_slug(text);

create function public.get_public_invoice_by_slug(p_public_slug text)
returns table (
  invoice_reference text,
  guest_name text,
  retreat_type_name text,
  retreat_format public.retreat_format,
  guest_count smallint,
  start_date date,
  end_date date,
  amount_usd numeric(12,2),
  amount_eth numeric(18,8),
  eth_price_usd numeric(18,8),
  wallet_address text,
  status text,
  retry_allowed boolean,
  payment_issue boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    i.invoice_reference,
    e.full_name,
    q.retreat_type_name,
    q.retreat_format,
    q.guest_count,
    q.start_date,
    q.end_date,
    i.amount_usd,
    i.amount_eth,
    i.eth_price_usd,
    i.wallet_address,
    i.status,
    i.retry_allowed_at is not null,
    exists (
      select 1 from public.retreat_payment_submissions ps
      where ps.invoice_id = i.id and ps.status = 'rejected'
    ),
    i.created_at
  from public.retreat_invoices i
  join public.retreat_quotes q on q.id = i.quote_id
  join public.retreat_enquiries e on e.id = q.enquiry_id
  where i.public_slug = p_public_slug
  limit 1;
$$;

revoke all on function public.get_public_invoice_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_public_invoice_by_slug(text) to anon, authenticated;

create or replace function public.allow_invoice_payment_retry(p_invoice_id uuid)
returns table (retry_allowed_at timestamptz, retry_allowed_by uuid, invoice_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row record;
  latest_submission record;
  decision_time timestamptz;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  select i.status into invoice_row from public.retreat_invoices i where i.id = p_invoice_id for update;
  if invoice_row.status is null then raise exception 'Invoice not found'; end if;
  if invoice_row.status = 'paid' then raise exception 'Paid invoice cannot be retried'; end if;
  if invoice_row.status = 'cancelled' then raise exception 'Cancelled invoice cannot be retried'; end if;

  select ps.status into latest_submission
  from public.retreat_payment_submissions ps
  where ps.invoice_id = p_invoice_id
  order by ps.submitted_at desc
  limit 1
  for update;
  if latest_submission.status is distinct from 'rejected' then raise exception 'Only a rejected payment can be retried'; end if;

  decision_time := coalesce((select i.retry_allowed_at from public.retreat_invoices i where i.id = p_invoice_id), now());
  update public.retreat_invoices
  set retry_allowed_at = decision_time, retry_allowed_by = auth.uid(), updated_at = now()
  where id = p_invoice_id;
  return query select decision_time, auth.uid(), 'awaiting_payment'::text;
end;
$$;

revoke all on function public.allow_invoice_payment_retry(uuid) from public, anon, authenticated;
grant execute on function public.allow_invoice_payment_retry(uuid) to authenticated;

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
  expiry_time timestamptz;
  new_submission_id uuid;
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

  select ps.id, ps.status, ps.submitted_at into latest_submission
  from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id
  order by ps.submitted_at desc
  limit 1;
  if latest_submission.status = 'submitted' then
    select h.status, h.expires_at into existing_hold
    from public.retreat_holds h where h.quote_id = invoice_row.quote_id and h.status = 'active';
    return query select 'payment_submitted', latest_submission.submitted_at, existing_hold.status, existing_hold.expires_at;
    return;
  end if;
  if latest_submission.status = 'rejected' and invoice_row.retry_allowed_at is null then raise exception 'Payment submission was rejected; contact Cally'; end if;
  if invoice_row.invoice_status <> 'awaiting_payment' then raise exception 'Invoice is not awaiting payment'; end if;

  perform pg_catalog.pg_advisory_xact_lock(735391);
  select ps.id, ps.status, ps.submitted_at into latest_submission
  from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id
  order by ps.submitted_at desc
  limit 1;
  if latest_submission.status = 'submitted' then
    select h.status, h.expires_at into existing_hold from public.retreat_holds h where h.quote_id = invoice_row.quote_id and h.status = 'active';
    return query select 'payment_submitted', latest_submission.submitted_at, existing_hold.status, existing_hold.expires_at;
    return;
  end if;
  if latest_submission.status = 'rejected' and invoice_row.retry_allowed_at is null then raise exception 'Payment submission was rejected; contact Cally'; end if;

  nights := coalesce(invoice_row.duration_days, case when invoice_row.end_date is null then 1 else (invoice_row.end_date - invoice_row.start_date + 1)::smallint end);
  select * into availability_row from public.check_stay_availability(invoice_row.retreat_product_id, invoice_row.retreat_format, invoice_row.start_date, nights, invoice_row.guest_count);
  if not availability_row.available then raise exception 'Requested stay is no longer available'; end if;

  submission_time := now(); expiry_time := submission_time + interval '24 hours';
  insert into public.retreat_payment_submissions(invoice_id, quote_id, enquiry_id, submitted_at)
  values (invoice_row.invoice_id, invoice_row.quote_id, invoice_row.enquiry_id, submission_time)
  returning id into new_submission_id;
  update public.retreat_invoices set status = 'payment_submitted', retry_allowed_at = null, retry_allowed_by = null, updated_at = now() where id = invoice_row.invoice_id;
  insert into public.retreat_holds(quote_id, enquiry_id, retreat_product_id, retreat_format, start_date, end_date, guest_count, retreat_event_id, expires_at)
  values (invoice_row.quote_id, invoice_row.enquiry_id, invoice_row.retreat_product_id, invoice_row.retreat_format, invoice_row.start_date, invoice_row.start_date + nights - 1, invoice_row.guest_count, null, expiry_time);
  return query select 'payment_submitted', submission_time, 'active'::public.retreat_hold_status, expiry_time;
end;
$$;

revoke all on function public.submit_invoice_payment(text) from public, anon, authenticated;
grant execute on function public.submit_invoice_payment(text) to anon, authenticated;

create or replace function public.verify_invoice_payment(p_invoice_id uuid, p_review_note text default null)
returns table (submission_status text, invoice_status text, reviewed_at timestamptz, reviewed_by uuid, hold_status public.retreat_hold_status, hold_expires_at timestamptz, review_note text)
language plpgsql security definer set search_path = ''
as $$
declare s record; i record; h record; t timestamptz; n text;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  n := nullif(left(trim(coalesce(p_review_note, '')), 500), '');
  select * into i from public.retreat_invoices where id = p_invoice_id for update;
  if i.id is null then raise exception 'Invoice not found'; end if;
  select * into s from public.retreat_payment_submissions where invoice_id = p_invoice_id order by submitted_at desc limit 1 for update;
  if s.id is null then raise exception 'Payment submission not found'; end if;
  select * into h from public.retreat_holds where quote_id = i.quote_id and status = 'active' order by created_at desc limit 1 for update;
  if s.status in ('verified','rejected') then return query select s.status::text, i.status::text, s.reviewed_at, s.reviewed_by, h.status, h.expires_at, s.review_note; return; end if;
  if s.status <> 'submitted' then raise exception 'Payment submission is not awaiting review'; end if;
  if h.status is null or (h.expires_at is not null and h.expires_at <= now()) then raise exception 'Payment hold has expired'; end if;
  t := now();
  update public.retreat_payment_submissions set status = 'verified', reviewed_at = t, reviewed_by = auth.uid(), review_note = n where id = s.id;
  update public.retreat_invoices set status = 'paid', updated_at = now() where id = p_invoice_id;
  update public.retreat_holds set expires_at = null, updated_at = now() where id = h.id and status = 'active';
  return query select 'verified'::text, 'paid'::text, t, auth.uid(), 'active'::public.retreat_hold_status, null::timestamptz, n;
end;
$$;

create or replace function public.reject_invoice_payment(p_invoice_id uuid, p_review_note text default null)
returns table (submission_status text, invoice_status text, reviewed_at timestamptz, reviewed_by uuid, hold_status public.retreat_hold_status, hold_expires_at timestamptz, review_note text)
language plpgsql security definer set search_path = ''
as $$
declare s record; i record; h record; t timestamptz; n text;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  n := nullif(left(trim(coalesce(p_review_note, '')), 500), '');
  select * into i from public.retreat_invoices where id = p_invoice_id for update;
  if i.id is null then raise exception 'Invoice not found'; end if;
  select * into s from public.retreat_payment_submissions where invoice_id = p_invoice_id order by submitted_at desc limit 1 for update;
  if s.id is null then raise exception 'Payment submission not found'; end if;
  select * into h from public.retreat_holds where quote_id = i.quote_id and status = 'active' order by created_at desc limit 1 for update;
  if s.status in ('verified','rejected') then return query select s.status::text, i.status::text, s.reviewed_at, s.reviewed_by, h.status, h.expires_at, s.review_note; return; end if;
  if s.status <> 'submitted' then raise exception 'Payment submission is not awaiting review'; end if;
  t := now();
  update public.retreat_payment_submissions set status = 'rejected', reviewed_at = t, reviewed_by = auth.uid(), review_note = n where id = s.id;
  update public.retreat_invoices set status = 'awaiting_payment', updated_at = now() where id = p_invoice_id;
  update public.retreat_holds set status = 'released', updated_at = now() where id = h.id and status = 'active';
  return query select 'rejected'::text, 'awaiting_payment'::text, t, auth.uid(), 'released'::public.retreat_hold_status, h.expires_at, n;
end;
$$;

revoke all on function public.verify_invoice_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.reject_invoice_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_invoice_payment(uuid, text) to authenticated;
grant execute on function public.reject_invoice_payment(uuid, text) to authenticated;

create or replace function public.get_public_event_by_slug(p_slug text)
returns table (id uuid, slug text, title text, retreat_product_id uuid, start_date date, end_date date, capacity smallint, available_places smallint, effective_places_remaining smallint, description text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.slug, e.title, e.retreat_product_id, e.start_date, e.end_date, e.capacity, e.available_places,
    greatest(0, e.available_places - coalesce((select sum(h.guest_count)::smallint from public.retreat_holds h
      where h.retreat_event_id = e.id and h.status = 'active' and (h.expires_at is null or h.expires_at > now())), 0))::smallint,
    e.description
  from public.retreat_events e
  where e.slug = p_slug and e.status = 'published' and e.end_date >= current_date;
$$;

create or replace function public.list_public_retreat_events()
returns table (id uuid, slug text, title text, retreat_product_id uuid, start_date date, end_date date, capacity smallint, available_places smallint, effective_places_remaining smallint, description text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.slug, e.title, e.retreat_product_id, e.start_date, e.end_date, e.capacity, e.available_places,
    greatest(0, e.available_places - coalesce((select sum(h.guest_count)::smallint from public.retreat_holds h
      where h.retreat_event_id = e.id and h.status = 'active' and (h.expires_at is null or h.expires_at > now())), 0))::smallint,
    e.description
  from public.retreat_events e
  where e.status = 'published' and e.end_date >= current_date
  order by e.start_date;
$$;
