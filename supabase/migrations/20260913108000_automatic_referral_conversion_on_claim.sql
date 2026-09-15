create or replace function inner_sanctum_referral_private.convert_claimed_order_referral()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'claimed' and (old.status is distinct from new.status)
    and exists (
      select 1 from public.store_order_referrals r
      where r.order_id = new.order_id and r.conversion_id is null
    ) then
    perform inner_sanctum_referral_private.record_successful_referral_conversion(
      new.order_id, new.claimed_by, 'payfast'::public.inner_sanctum_referral_conversion_source, null
    );
  end if;
  return new;
end;
$$;

revoke all on function inner_sanctum_referral_private.convert_claimed_order_referral() from public, anon, authenticated;

drop trigger if exists store_claim_converts_referral on public.store_claims;
create trigger store_claim_converts_referral
after update of status on public.store_claims
for each row when (new.status = 'claimed')
execute function inner_sanctum_referral_private.convert_claimed_order_referral();