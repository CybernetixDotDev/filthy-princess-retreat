alter table public.retreat_bookings
  add column if not exists invoice_id uuid references public.retreat_invoices(id) on delete restrict,
  add column if not exists payment_submission_id uuid references public.retreat_payment_submissions(id) on delete restrict,
  add column if not exists booking_reference text,
  add column if not exists confirmed_at timestamptz not null default now(),
  add column if not exists confirmed_by uuid references public.admin_users(user_id) on delete set null;

create unique index if not exists retreat_bookings_booking_reference_idx
  on public.retreat_bookings(booking_reference)
  where booking_reference is not null;
create unique index if not exists retreat_bookings_invoice_idx
  on public.retreat_bookings(invoice_id)
  where invoice_id is not null;

create or replace function public.confirm_verified_retreat_booking(p_invoice_id uuid)
returns table (
  booking_id uuid,
  booking_reference text,
  booking_status public.booking_status,
  invoice_status text,
  hold_status public.retreat_hold_status,
  confirmed_at timestamptz,
  confirmed_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row record;
  quote_row record;
  enquiry_row record;
  submission_row record;
  hold_row record;
  existing_booking record;
  booking_id_value uuid;
  reference_value text;
  confirmation_time timestamptz;
  requested_end date;
begin
  if not (select retreat_private.is_retreat_admin()) then raise exception 'Not authorized'; end if;
  perform pg_catalog.pg_advisory_xact_lock(735391);

  select i.* into invoice_row from public.retreat_invoices i where i.id = p_invoice_id for update;
  if invoice_row.id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.status <> 'paid' then raise exception 'Invoice payment is not verified'; end if;

  select q.* into quote_row from public.retreat_quotes q where q.id = invoice_row.quote_id for update;
  select e.* into enquiry_row from public.retreat_enquiries e where e.id = quote_row.enquiry_id for update;
  if quote_row.id is null or enquiry_row.id is null or invoice_row.enquiry_id <> quote_row.enquiry_id then
    raise exception 'Invoice commercial chain is invalid';
  end if;

  select ps.* into submission_row
  from public.retreat_payment_submissions ps
  where ps.invoice_id = invoice_row.id and ps.quote_id = quote_row.id and ps.enquiry_id = enquiry_row.id and ps.status = 'verified'
  order by ps.submitted_at desc limit 1 for update;
  if submission_row.id is null then raise exception 'Verified payment submission not found'; end if;

  select b.* into existing_booking
  from public.retreat_bookings b
  where b.invoice_id = invoice_row.id or b.quote_id = quote_row.id
  order by b.created_at desc limit 1 for update;
  if existing_booking.id is not null then
    return query select existing_booking.id, existing_booking.booking_reference, existing_booking.booking_status,
      invoice_row.status::text, 'released'::public.retreat_hold_status,
      existing_booking.confirmed_at, existing_booking.confirmed_by;
    return;
  end if;

  select h.* into hold_row
  from public.retreat_holds h
  where h.quote_id = quote_row.id and h.enquiry_id = enquiry_row.id and h.status = 'active' and h.expires_at is null
  order by h.created_at desc limit 1 for update;
  if hold_row.id is null then raise exception 'Protected payment hold not found'; end if;

  if enquiry_row.retreat_event_id is not null or quote_row.retreat_format = 'join_a_group' then
    raise exception 'Only private paid retreat stays can be confirmed by this workflow';
  end if;
  requested_end := coalesce(quote_row.end_date, quote_row.start_date);
  if not exists (
    select 1 from public.retreat_products p
    where p.id = quote_row.retreat_product_id and p.is_published and quote_row.retreat_format = any(p.allowed_formats)
  ) then raise exception 'The selected retreat is no longer available'; end if;
  if exists (
    select 1 from generate_series(quote_row.start_date::timestamp, requested_end::timestamp, interval '1 day') d
    where not exists (
      select 1 from public.retreat_availability a
      where (a.retreat_product_id is null or a.retreat_product_id = quote_row.retreat_product_id)
        and (a.retreat_format is null or a.retreat_format = quote_row.retreat_format)
        and a.state = 'available' and a.start_date <= d::date and a.end_date >= d::date
        and (a.capacity is null or a.capacity >= quote_row.guest_count)
    ) or exists (
      select 1 from public.retreat_availability a
      where (a.retreat_product_id is null or a.retreat_product_id = quote_row.retreat_product_id)
        and (a.retreat_format is null or a.retreat_format = quote_row.retreat_format)
        and a.state = 'blocked' and a.start_date <= d::date and a.end_date >= d::date
    )
  ) then raise exception 'The configured availability no longer permits these private retreat dates'; end if;
  if exists (
    select 1 from public.retreat_bookings b
    where b.retreat_event_id is null and b.booking_status in ('confirmed', 'completed')
      and b.start_date <= requested_end and coalesce(b.end_date, b.start_date) >= quote_row.start_date
  ) then raise exception 'These dates are already occupied by another confirmed retreat'; end if;

  confirmation_time := now();
  reference_value := 'FP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.retreat_bookings (
    enquiry_id, retreat_product_id, retreat_type_name, retreat_format, start_date, end_date,
    guest_count, retreat_event_id, quote_id, invoice_id, payment_submission_id,
    booking_reference, booking_status, payment_status, booking_source, created_by, confirmed_at, confirmed_by
  ) values (
    enquiry_row.id, quote_row.retreat_product_id, quote_row.retreat_type_name, quote_row.retreat_format,
    quote_row.start_date, quote_row.end_date, quote_row.guest_count, null, quote_row.id,
    invoice_row.id, submission_row.id, reference_value, 'confirmed', 'paid', 'enquiry', auth.uid(), confirmation_time, auth.uid()
  ) returning id into booking_id_value;

  -- The legacy insert trigger may mark the hold converted; 4D's public state is released.
  update public.retreat_holds set status = 'released', updated_at = now() where id = hold_row.id;

  return query select booking_id_value, reference_value, 'confirmed'::public.booking_status,
    'paid'::text, 'released'::public.retreat_hold_status, confirmation_time, auth.uid();
end;
$$;

revoke all on function public.confirm_verified_retreat_booking(uuid) from public, anon, authenticated;
grant execute on function public.confirm_verified_retreat_booking(uuid) to authenticated;
