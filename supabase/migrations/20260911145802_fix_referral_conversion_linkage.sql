create or replace function inner_sanctum_referral_private.record_successful_referral_conversion(p_order_id uuid,p_referred_user_id uuid,p_conversion_source public.inner_sanctum_referral_conversion_source,p_created_by uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare attribution public.store_order_referrals; referral public.inner_sanctum_referrals; order_row public.store_orders; points integer; v_conversion_id uuid;
begin
 select * into order_row from public.store_orders where id=p_order_id for update;
 if order_row.id is null then raise exception 'order_not_found' using errcode='P0002'; end if;
 if not exists(select 1 from public.store_order_items i where i.order_id=order_row.id and i.fulfillment_type='inner_sanctum_membership' and i.fulfillment_reference='lifetime') then raise exception 'ineligible_order' using errcode='22023'; end if;
 select * into attribution from public.store_order_referrals where order_id=order_row.id for update;
 if attribution.id is null then raise exception 'referral_attribution_required' using errcode='P0002'; end if;
 select * into referral from public.inner_sanctum_referrals where id=attribution.referral_id;
 if referral.id is null then raise exception 'referral_not_found' using errcode='P0002'; end if;
 if referral.user_id=p_referred_user_id then raise exception 'self_referral' using errcode='22023'; end if;
 if not exists(select 1 from auth.users where id=p_referred_user_id) then raise exception 'referred_user_not_found' using errcode='P0002'; end if;
 select id into v_conversion_id from public.inner_sanctum_referral_conversions where order_id=order_row.id;
 if v_conversion_id is not null then return v_conversion_id; end if;
 select referral_points into points from public.inner_sanctum_filth_settings where id=true;
 insert into public.inner_sanctum_referral_conversions(referral_id,referrer_user_id,referred_user_id,order_id,order_reference,points_awarded,conversion_source)
 values(referral.id,referral.user_id,p_referred_user_id,order_row.id,order_row.order_reference,points,p_conversion_source) returning id into v_conversion_id;
 insert into public.inner_sanctum_filth_events(user_id,event_type,points,source_reference,created_by) values(referral.user_id,'referral',points,'referral-conversion:'||v_conversion_id,p_created_by);
 update public.store_order_referrals set converted_at=now(),conversion_id=v_conversion_id where id=attribution.id;
 perform inner_sanctum_referral_private.evaluate_filth_milestones(referral.user_id);
 return v_conversion_id;
end;
$$;
revoke all on function inner_sanctum_referral_private.record_successful_referral_conversion(uuid,uuid,public.inner_sanctum_referral_conversion_source,uuid) from public,anon,authenticated;
