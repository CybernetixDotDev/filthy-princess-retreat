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
  if exists (select 1 from public.retreat_quotes quote_row where quote_row.enquiry_id = enquiry_row.id) then
    raise exception 'A quoted enquiry date cannot be changed';
  end if;

  occupied_end := p_arrival + 2;
  perform pg_catalog.pg_advisory_xact_lock(735391);
  update public.retreat_holds as hold_row
  set status = 'released', updated_at = now()
  where hold_row.enquiry_id = enquiry_row.id
    and hold_row.quote_id is null
    and hold_row.status = 'active'
    and (hold_row.expires_at is null or hold_row.expires_at > now());

  evaluated_state := retreat_private.evaluate_retreat_stay(
    enquiry_row.retreat_product_id, enquiry_row.retreat_format, p_arrival, occupied_end, enquiry_row.guest_count
  );
  if evaluated_state <> 'available' then raise exception 'The selected stay is no longer available'; end if;

  hold_expiry := now() + retreat_private.pre_quote_hold_duration();
  update public.retreat_enquiries as enquiry_update
  set requested_start_date = p_arrival, requested_end_date = occupied_end
  where enquiry_update.id = enquiry_row.id;
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