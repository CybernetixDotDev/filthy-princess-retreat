-- Cell 5: explicit maturity only; entitlement and financial snapshots stay frozen.
alter type public.affiliate_commission_status add value 'available';
alter table public.affiliate_commissions
  add column matured_at timestamptz,
  add constraint affiliate_commissions_maturity_state check (
    (status::text = 'pending' and matured_at is null)
    or (status::text = 'available' and matured_at is not null and matured_at >= available_at)
  );
create index affiliate_commissions_due_idx on public.affiliate_commissions(available_at)
  where status = 'pending';

-- No session flags or general update bypass: only a due pending -> available
-- transition may alter a row, with its audit timestamp set to database time.
create or replace function affiliate_private.protect_commission_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if old.status::text = 'pending' and new.status::text = 'available'
      and old.available_at <= now()
      and old.matured_at is null and new.matured_at = now()
      and (to_jsonb(new) - 'status' - 'matured_at') = (to_jsonb(old) - 'status' - 'matured_at') then
      return new;
    end if;
  end if;
  raise exception 'affiliate_commission_history_is_immutable';
end;
$$;
revoke all on function affiliate_private.protect_commission_history() from public, anon, authenticated;

create function affiliate_private.mature_due_commissions()
returns bigint language plpgsql security invoker set search_path = '' as $$
declare matured_count bigint;
begin
  update public.affiliate_commissions
    set status = 'available', matured_at = now()
    where status = 'pending' and available_at <= now();
  get diagnostics matured_count = row_count;
  return matured_count;
end;
$$;
revoke all on function affiliate_private.mature_due_commissions() from public, anon, authenticated;
-- Existing private-schema access and commission-table grants remain unchanged.
-- Invoke through a trusted database role; no client/admin API or scheduler added.
