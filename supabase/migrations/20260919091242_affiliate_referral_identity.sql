-- Cell 2: Affiliate referral identity; conversion and Filth remain unchanged.
create function affiliate_private.is_commercially_ready(target_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.affiliate_accounts a
    where a.user_id = target_user_id and a.status = 'active'
      and a.accepted_terms_version = affiliate_private.current_terms_version()
      and a.terms_accepted_at is not null
  );
$$;
revoke all on function affiliate_private.is_commercially_ready(uuid) from public, anon, authenticated;

create or replace function public.is_valid_inner_sanctum_referral_code(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.inner_sanctum_referrals r
    where r.code = p_code and r.status = 'active'
      and affiliate_private.is_commercially_ready(r.user_id)
  );
$$;
revoke all on function public.is_valid_inner_sanctum_referral_code(text) from public, anon, authenticated;
grant execute on function public.is_valid_inner_sanctum_referral_code(text) to anon, authenticated;

create function public.get_or_create_my_referral_identity()
returns public.inner_sanctum_referrals
language plpgsql security definer set search_path = '' as $$
declare
  target_user_id uuid := auth.uid();
  identity_row public.inner_sanctum_referrals%rowtype;
begin
  if target_user_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- Serialize creation for this identity and concurrent Affiliate state changes.
  perform 1 from public.affiliate_accounts where user_id = target_user_id for update;
  if not affiliate_private.is_commercially_ready(target_user_id) then
    raise exception 'affiliate_not_commercially_ready' using errcode = '42501';
  end if;

  select * into identity_row from public.inner_sanctum_referrals where user_id = target_user_id;
  if identity_row.id is not null then return identity_row; end if;
  loop
    insert into public.inner_sanctum_referrals(user_id, code)
    values (target_user_id, encode(extensions.gen_random_bytes(12), 'hex'))
    on conflict do nothing returning * into identity_row;
    if identity_row.id is not null then return identity_row; end if;
    -- A code collision retries; a competing user insert returns that identity.
    select * into identity_row from public.inner_sanctum_referrals where user_id = target_user_id;
    if identity_row.id is not null then return identity_row; end if;
  end loop;
end;
$$;
revoke all on function public.get_or_create_my_referral_identity() from public, anon, authenticated;
grant execute on function public.get_or_create_my_referral_identity() to authenticated;

-- Filth/progression read only; existing referral codes remain in the result.
create or replace function public.get_my_filth_meter() returns table(referral_code text,filth_total bigint,successful_referrals bigint,current_level_number integer,current_level_title text,current_level_threshold integer,next_level_threshold integer,earned_milestones jsonb) language plpgsql security definer set search_path='' as $$
declare code_value text; total bigint;
begin
 if auth.uid() is null or not (select public.has_inner_sanctum_access()) then raise exception 'inner_sanctum_access_required' using errcode='42501'; end if;
 select code into code_value from public.inner_sanctum_referrals where user_id=auth.uid();
 select coalesce(sum(points),0) into total from public.inner_sanctum_filth_events where user_id=auth.uid();
 return query select code_value,total,
  (select count(*) from public.inner_sanctum_referral_conversions c where c.referrer_user_id=auth.uid()),
  (select l.level_number from public.inner_sanctum_filth_levels l where l.status='active' and l.threshold<=total order by l.threshold desc limit 1),
  (select l.title from public.inner_sanctum_filth_levels l where l.status='active' and l.threshold<=total order by l.threshold desc limit 1),
  (select l.threshold from public.inner_sanctum_filth_levels l where l.status='active' and l.threshold<=total order by l.threshold desc limit 1),
  (select l.threshold from public.inner_sanctum_filth_levels l where l.status='active' and l.threshold>total order by l.threshold limit 1),
  (select coalesce(jsonb_agg(jsonb_build_object('title',m.title,'threshold',m.threshold,'earned_at',earned.earned_at) order by m.threshold),'[]'::jsonb) from public.inner_sanctum_member_filth_milestones earned join public.inner_sanctum_filth_milestones m on m.id=earned.milestone_id where earned.user_id=auth.uid());
end;
$$;
revoke all on function public.get_my_filth_meter() from public,anon,authenticated; grant execute on function public.get_my_filth_meter() to authenticated;


-- Only attribution eligibility changes; ordering and idempotency are preserved.
create or replace function public.create_public_store_order(p_product_id uuid,p_buyer_email text,p_request_key uuid,p_referral_code text default null)
returns table(order_reference text,order_status public.store_order_status,currency text,total_amount numeric)
language plpgsql security definer set search_path='' as $$
declare selected_product public.store_products; existing_order public.store_orders; new_order public.store_orders; normalized_email text:=lower(trim(p_buyer_email)); candidate_reference text;
begin
 if p_product_id is null or p_request_key is null or length(normalized_email) not between 3 and 320 or position('@' in normalized_email)<=1 then raise exception 'invalid_store_order_request' using errcode='22023'; end if;
 select * into existing_order from public.store_orders where request_key=p_request_key;
 if existing_order.id is not null then
  if existing_order.buyer_email is distinct from normalized_email then raise exception 'store_order_request_conflict' using errcode='23505'; end if;
  return query select existing_order.order_reference,existing_order.status,existing_order.currency,existing_order.total_amount; return;
 end if;
 select * into selected_product from public.store_products where id=p_product_id and status='active';
 if selected_product.id is null then raise exception 'store_product_unavailable' using errcode='P0002'; end if;
 loop candidate_reference:='FP-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,8))||'-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),9,8))||'-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),17,8)); exit when not exists(select 1 from public.store_orders o where o.order_reference=candidate_reference); end loop;
 insert into public.store_orders(order_reference,request_key,user_id,buyer_email,status,currency,subtotal_amount,total_amount)
 values(candidate_reference,p_request_key,auth.uid(),normalized_email,'pending',selected_product.currency,selected_product.price_amount,selected_product.price_amount) returning * into new_order;
 insert into public.store_order_items(order_id,product_id,product_name,product_slug,product_type,unit_price_amount,currency,quantity,line_total_amount,fulfillment_type,fulfillment_reference)
 values(new_order.id,selected_product.id,selected_product.name,selected_product.slug,selected_product.product_type,selected_product.price_amount,selected_product.currency,1,selected_product.price_amount,selected_product.fulfillment_type,selected_product.fulfillment_reference);
 if p_referral_code is not null then
  insert into public.store_order_referrals(order_id,referral_id,referrer_user_id)
  select new_order.id,r.id,r.user_id from public.inner_sanctum_referrals r
  where r.code=p_referral_code and public.is_valid_inner_sanctum_referral_code(r.code) on conflict(order_id) do nothing;
 end if;
 return query select new_order.order_reference,new_order.status,new_order.currency,new_order.total_amount;
end;
$$;
