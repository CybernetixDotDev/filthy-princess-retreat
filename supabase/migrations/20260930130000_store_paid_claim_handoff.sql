create or replace function store_private.assert_supported_order(p_order_id uuid)
returns public.store_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_order public.store_orders%rowtype;
begin
  select * into selected_order from public.store_orders where id = p_order_id for update;
  if selected_order.id is null then raise exception 'store_order_not_found' using errcode = 'P0002'; end if;
  if selected_order.status in ('cancelled', 'failed') then raise exception 'store_order_ineligible' using errcode = '22023'; end if;
  if selected_order.status <> 'paid' or selected_order.payment_status <> 'verified' then
    raise exception 'verified_payment_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.store_order_items i where i.order_id = p_order_id
    and i.fulfillment_type = 'inner_sanctum_membership' and i.fulfillment_reference = 'lifetime')
    or exists (select 1 from public.store_order_items i where i.order_id = p_order_id
      and not (i.fulfillment_type = 'inner_sanctum_membership' and i.fulfillment_reference = 'lifetime')) then
    raise exception 'unsupported_store_fulfillment' using errcode = '22023';
  end if;
  return selected_order;
end;
$$;

create function public.issue_payfast_store_claim(
  p_order_reference text,
  p_attempt_id uuid,
  p_token_hash text
)
returns table(claim_id uuid, claim_status public.store_claim_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.store_orders%rowtype;
  attempt_row public.store_payfast_payment_attempts%rowtype;
  auth_row public.store_fulfillment_authorizations%rowtype;
  claim_row public.store_claims%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_claim_hash' using errcode = '22023';
  end if;
  select * into attempt_row from public.store_payfast_payment_attempts where id = p_attempt_id for update;
  if attempt_row.id is null then raise exception 'payfast_attempt_unknown' using errcode = 'P0002'; end if;
  select * into order_row from public.store_orders
    where id = attempt_row.order_id and order_reference = upper(trim(p_order_reference)) for update;
  if order_row.id is null then raise exception 'order_unavailable' using errcode = 'P0002'; end if;
  if attempt_row.status <> 'settled' or order_row.status <> 'paid' or order_row.payment_status <> 'verified'
    or order_row.payment_method <> 'payfast' then
    raise exception 'verified_payment_required' using errcode = '22023';
  end if;
  perform store_private.assert_supported_order(order_row.id);
  if exists (select 1 from public.store_claims where order_id = order_row.id and status = 'claimed') then
    raise exception 'store_order_already_claimed' using errcode = '22023';
  end if;
  insert into public.store_fulfillment_authorizations(order_id, source, source_reference)
  values (order_row.id, 'payfast', attempt_row.provider_reference)
  on conflict (order_id) do nothing
  returning * into auth_row;
  if auth_row.id is null then
    select * into auth_row from public.store_fulfillment_authorizations where order_id = order_row.id for update;
    if auth_row.source <> 'payfast' then raise exception 'fulfillment_already_authorized' using errcode = '22023'; end if;
  end if;
  if exists (select 1 from public.store_claims where order_id = order_row.id and status = 'available') then
    raise exception 'store_claim_already_available' using errcode = '22023';
  end if;
  insert into public.store_claims(order_id, authorization_id, token_hash)
  values (order_row.id, auth_row.id, p_token_hash)
  returning id, status into claim_row;
  return query select claim_row.id, claim_row.status;
end;
$$;

revoke all on function public.issue_payfast_store_claim(text, uuid, text) from public, anon, authenticated;
grant execute on function public.issue_payfast_store_claim(text, uuid, text) to service_role;

create or replace function public.redeem_store_claim(p_token text)
returns table (redemption_state text, order_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  token_digest text;
  claim_row public.store_claims%rowtype;
  auth_row public.store_fulfillment_authorizations%rowtype;
  order_row public.store_orders%rowtype;
  membership_row public.inner_sanctum_memberships%rowtype;
begin
  if target_user is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return query select 'invalid'::text, null::text; return; end if;
  token_digest := encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
  select * into claim_row from public.store_claims where token_hash = token_digest for update;
  if claim_row.id is null then return query select 'invalid'::text, null::text; return; end if;
  if claim_row.status = 'revoked' then return query select 'revoked'::text, null::text; return; end if;
  if claim_row.status = 'claimed' then return query select 'claimed'::text, null::text; return; end if;
  select * into auth_row from public.store_fulfillment_authorizations where id = claim_row.authorization_id for update;
  order_row := store_private.assert_supported_order(claim_row.order_id);
  if auth_row.id is null or auth_row.order_id <> claim_row.order_id then raise exception 'fulfillment_not_authorized' using errcode = '22023'; end if;
  if order_row.user_id is not null and order_row.user_id <> target_user then raise exception 'store_order_owned_by_another_user' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user::text, 0));
  select * into membership_row from public.inner_sanctum_memberships where user_id = target_user for update;
  if membership_row.id is not null and membership_row.status in ('suspended', 'cancelled') then
    raise exception 'membership_not_eligible' using errcode = '22023';
  end if;
  if membership_row.id is not null and membership_row.status = 'active' then
    update public.store_orders set user_id = target_user, fulfilled_at = now() where id = order_row.id;
    update public.store_claims set status = 'claimed', claimed_by = target_user, claimed_at = now() where id = claim_row.id;
    return query select 'already_member'::text, order_row.order_reference; return;
  end if;
  membership_row := inner_sanctum_private.apply_membership_transition(target_user, 'grant', 'store', order_row.order_reference, target_user);
  update public.store_orders set user_id = target_user, fulfilled_at = now() where id = order_row.id;
  update public.store_claims set status = 'claimed', claimed_by = target_user, claimed_at = now() where id = claim_row.id;
  return query select 'success'::text, order_row.order_reference;
end;
$$;

revoke all on function public.redeem_store_claim(text) from public, anon, authenticated;
grant execute on function public.redeem_store_claim(text) to authenticated;