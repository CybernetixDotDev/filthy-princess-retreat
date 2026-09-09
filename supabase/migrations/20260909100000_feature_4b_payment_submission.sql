alter table public.retreat_invoices
  drop constraint if exists retreat_invoices_status_check;

alter table public.retreat_invoices
  add constraint retreat_invoices_status_check
  check (status in ('awaiting_payment', 'payment_submitted', 'paid', 'cancelled'));

create table public.retreat_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.retreat_invoices(id) on delete restrict,
  quote_id uuid not null references public.retreat_quotes(id) on delete restrict,
  enquiry_id uuid not null references public.retreat_enquiries(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status = 'submitted'),
  created_at timestamptz not null default now()
);

alter table public.retreat_payment_submissions enable row level security;
revoke all on public.retreat_payment_submissions from public, anon, authenticated;
grant select on public.retreat_payment_submissions to authenticated;
create policy "admins read payment submissions"
  on public.retreat_payment_submissions
  for select
  to authenticated
  using ((select retreat_private.is_retreat_admin()));

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

  select ps.submitted_at into existing_submission
  from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id;

  if existing_submission.submitted_at is not null then
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

  select ps.submitted_at into existing_submission
  from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.invoice_id;
  if existing_submission.submitted_at is not null then
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
    invoice_row.retreat_product_id,
    invoice_row.retreat_format,
    invoice_row.start_date,
    nights,
    invoice_row.guest_count
  );
  if not availability_row.available then
    raise exception 'Requested stay is no longer available';
  end if;

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

  return query select 'payment_submitted', submission_time, 'active'::public.retreat_hold_status, expiry_time;
end;
$$;

revoke all on function public.submit_invoice_payment(text) from public, anon, authenticated;
grant execute on function public.submit_invoice_payment(text) to anon, authenticated;