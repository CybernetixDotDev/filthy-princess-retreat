alter table public.store_payfast_payment_attempts
  drop constraint store_payfast_attempt_status_valid,
  add column provider_payment_id text,
  add column notification_fingerprint text,
  add column verified_amount numeric(12,2),
  add column verified_currency text,
  add column verified_at timestamptz,
  add column verification_note text,
  add constraint store_payfast_attempt_status_valid check (
    status in ('initiated', 'superseded', 'cancelled', 'settled', 'verified_failed', 'reconciliation_required')
  ),
  add constraint store_payfast_provider_payment_id_length check (
    provider_payment_id is null or length(trim(provider_payment_id)) between 1 and 100
  ),
  add constraint store_payfast_notification_fingerprint_format check (
    notification_fingerprint is null or notification_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  add constraint store_payfast_verified_amount_valid check (
    verified_amount is null or verified_amount > 0
  ),
  add constraint store_payfast_verified_currency_valid check (
    verified_currency is null or verified_currency = 'ZAR'
  ),
  add constraint store_payfast_verification_note_length check (
    verification_note is null or length(trim(verification_note)) between 1 and 500
  );

create unique index store_payfast_attempts_provider_payment_idx
  on public.store_payfast_payment_attempts(provider_payment_id)
  where provider_payment_id is not null;
create unique index store_payfast_attempts_notification_fingerprint_idx
  on public.store_payfast_payment_attempts(notification_fingerprint)
  where notification_fingerprint is not null;

create function public.admin_get_store_payfast_attempts(p_order_id uuid)
returns table(
  attempt_id uuid,
  provider_reference text,
  provider_payment_id text,
  attempt_status text,
  amount numeric,
  currency text,
  notification_fingerprint text,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select retreat_private.is_retreat_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select a.id, a.provider_reference, a.provider_payment_id, a.status, a.amount, a.currency,
      a.notification_fingerprint, a.verified_at, a.verification_note, a.created_at
    from public.store_payfast_payment_attempts a
    where a.order_id = p_order_id
    order by a.created_at desc;
end;
$$;

alter table public.store_orders drop constraint store_payment_state_audit;
alter table public.store_orders add constraint store_payment_state_audit check (
  (payment_status = 'pending' and payment_submitted_at is null and payment_verified_at is null and payment_reviewed_at is null)
  or (payment_status = 'submitted' and payment_submitted_at is not null and payment_method is not null and payment_verified_at is null and payment_reviewed_at is null)
  or (payment_status = 'verified' and payment_submitted_at is not null and payment_method is not null and payment_verified_at is not null and payment_reviewed_at is not null and status = 'paid'
    and ((payment_method = 'payfast' and payment_verified_by is null and payment_reviewed_by is null)
      or (payment_method <> 'payfast' and payment_verified_by is not null and payment_reviewed_by is not null)))
  or (payment_status = 'rejected' and payment_submitted_at is not null and payment_method is not null and payment_verified_at is null and payment_reviewed_at is not null and payment_reviewed_by is not null)
);

create function public.settle_payfast_store_payment(
  p_provider_reference text,
  p_provider_payment_id text,
  p_notification_fingerprint text,
  p_payment_status text,
  p_amount text,
  p_currency text,
  p_verification_note text default null
)
returns table(settlement_state text, order_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_row public.store_payfast_payment_attempts%rowtype;
  order_row public.store_orders%rowtype;
  duplicate_row public.store_payfast_payment_attempts%rowtype;
  normalized_status text := upper(trim(p_payment_status));
  received_amount numeric;
begin
  if p_provider_reference is null or p_provider_reference !~ '^FP-PF-[A-F0-9]{32}$'
    or p_provider_payment_id is null or length(trim(p_provider_payment_id)) not between 1 and 100
    or p_notification_fingerprint is null or p_notification_fingerprint !~ '^[a-f0-9]{64}$'
    or p_currency is distinct from 'ZAR'
    or p_amount is null or p_amount !~ '^\d+(\.\d{1,2})?$'
    or normalized_status not in ('COMPLETE', 'CANCELLED', 'FAILED') then
    raise exception 'payfast_notification_invalid' using errcode = '22023';
  end if;
  received_amount := p_amount::numeric;
  if received_amount <= 0 then raise exception 'payfast_amount_invalid' using errcode = '22023'; end if;

  select * into duplicate_row
  from public.store_payfast_payment_attempts
  where notification_fingerprint = lower(p_notification_fingerprint)
  for update;
  if duplicate_row.id is not null then
    if duplicate_row.provider_reference = p_provider_reference and duplicate_row.provider_payment_id = p_provider_payment_id then
      return query select 'duplicate'::text, (select o.order_reference from public.store_orders o where o.id = duplicate_row.order_id);
      return;
    end if;
    raise exception 'payfast_notification_conflict' using errcode = '22023';
  end if;

  select * into attempt_row
  from public.store_payfast_payment_attempts
  where provider_reference = upper(trim(p_provider_reference))
  for update;
  if attempt_row.id is null then raise exception 'payfast_attempt_unknown' using errcode = 'P0002'; end if;
  select * into order_row from public.store_orders where id = attempt_row.order_id for update;
  if order_row.id is null then raise exception 'payfast_order_unknown' using errcode = 'P0002'; end if;

  if attempt_row.provider_payment_id is not null and attempt_row.provider_payment_id <> p_provider_payment_id then
    update public.store_payfast_payment_attempts set status = 'reconciliation_required',
      provider_payment_id = p_provider_payment_id, notification_fingerprint = lower(p_notification_fingerprint),
      verified_amount = received_amount, verified_currency = p_currency, verified_at = now(),
      verification_note = 'Conflicting provider payment identifier for an existing attempt.'
    where id = attempt_row.id;
    return query select 'reconciliation_required'::text, order_row.order_reference;
    return;
  end if;
  if exists (
    select 1 from public.store_payfast_payment_attempts other_attempt
    where other_attempt.provider_payment_id = p_provider_payment_id and other_attempt.id <> attempt_row.id
  ) then
    update public.store_payfast_payment_attempts set status = 'reconciliation_required',
      provider_payment_id = p_provider_payment_id, notification_fingerprint = lower(p_notification_fingerprint),
      verified_amount = received_amount, verified_currency = p_currency, verified_at = now(),
      verification_note = 'Provider transaction identifier was already recorded for another attempt.'
    where id = attempt_row.id;
    return query select 'reconciliation_required'::text, order_row.order_reference;
    return;
  end if;

  if normalized_status <> 'COMPLETE' then
    update public.store_payfast_payment_attempts set status = case when normalized_status = 'CANCELLED' then 'cancelled' else 'verified_failed' end,
      provider_payment_id = p_provider_payment_id, notification_fingerprint = lower(p_notification_fingerprint),
      verified_amount = received_amount, verified_currency = p_currency, verified_at = now(),
      verification_note = nullif(trim(p_verification_note), '')
    where id = attempt_row.id;
    return query select 'recorded_failure'::text, order_row.order_reference;
    return;
  end if;

  if received_amount is distinct from attempt_row.amount or received_amount is distinct from order_row.total_amount
    or order_row.currency <> 'ZAR' then
    update public.store_payfast_payment_attempts set status = 'reconciliation_required',
      provider_payment_id = p_provider_payment_id, notification_fingerprint = lower(p_notification_fingerprint),
      verified_amount = received_amount, verified_currency = p_currency, verified_at = now(),
      verification_note = 'Verified notification did not match the immutable Store amount or currency.'
    where id = attempt_row.id;
    return query select 'reconciliation_required'::text, order_row.order_reference;
    return;
  end if;

  if exists (select 1 from public.store_payfast_payment_attempts a where a.order_id = order_row.id and a.status = 'settled' and a.provider_payment_id = p_provider_payment_id)
    or (order_row.status = 'paid' and order_row.payment_method = 'payfast') then
    update public.store_payfast_payment_attempts set status = 'settled',
      provider_payment_id = p_provider_payment_id, notification_fingerprint = lower(p_notification_fingerprint),
      verified_amount = received_amount, verified_currency = p_currency, verified_at = now(),
      verification_note = nullif(trim(p_verification_note), '')
    where id = attempt_row.id;
    return query select 'duplicate'::text, order_row.order_reference;
    return;
  end if;
  if order_row.status <> 'pending' or order_row.payment_status <> 'pending' then
    update public.store_payfast_payment_attempts set status = 'reconciliation_required',
      provider_payment_id = p_provider_payment_id, notification_fingerprint = lower(p_notification_fingerprint),
      verified_amount = received_amount, verified_currency = p_currency, verified_at = now(),
      verification_note = 'Verified payment arrived after the order became ineligible.'
    where id = attempt_row.id;
    return query select 'reconciliation_required'::text, order_row.order_reference;
    return;
  end if;

  perform store_private.consume_inventory(order_row.id);
  update public.store_orders set status = 'paid', payment_status = 'verified', payment_method = 'payfast',
    payment_submitted_at = coalesce(payment_submitted_at, now()), payment_verified_at = now(),
    payment_reviewed_at = now(), payment_verification_note = nullif(trim(p_verification_note), '')
  where id = order_row.id returning * into order_row;
  update public.store_payfast_payment_attempts set status = 'settled',
    provider_payment_id = p_provider_payment_id, notification_fingerprint = lower(p_notification_fingerprint),
    verified_amount = received_amount, verified_currency = p_currency, verified_at = now(),
    verification_note = nullif(trim(p_verification_note), '')
  where id = attempt_row.id;
  return query select 'settled'::text, order_row.order_reference;
end;
$$;

revoke all on function public.settle_payfast_store_payment(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_payfast_store_payment(text, text, text, text, text, text, text)
  to service_role;
revoke all on function public.admin_get_store_payfast_attempts(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_store_payfast_attempts(uuid) to authenticated;