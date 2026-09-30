create table public.store_payfast_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete restrict,
  provider_reference text not null unique,
  amount numeric(12,2) not null,
  currency text not null,
  status text not null default 'initiated',
  created_at timestamptz not null default now(),
  constraint store_payfast_attempt_reference_format check (provider_reference ~ '^FP-PF-[A-F0-9]{32}$'),
  constraint store_payfast_attempt_amount_positive check (amount > 0),
  constraint store_payfast_attempt_currency_format check (currency = 'ZAR'),
  constraint store_payfast_attempt_status_valid check (status in ('initiated', 'superseded', 'cancelled'))
);

create index store_payfast_attempts_order_idx
  on public.store_payfast_payment_attempts(order_id, created_at desc);

alter table public.store_payfast_payment_attempts enable row level security;
revoke all on table public.store_payfast_payment_attempts from public, anon, authenticated;

create function public.begin_public_payfast_store_payment(p_order_reference text)
returns table(attempt_id uuid, provider_reference text, order_reference text, amount numeric, currency text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.store_orders%rowtype;
  attempt_row public.store_payfast_payment_attempts%rowtype;
  candidate_reference text;
begin
  select o.* into order_row
  from public.store_orders o
  where o.order_reference = upper(trim(p_order_reference))
  for update;
  if order_row.id is null then raise exception 'order_unavailable' using errcode = 'P0002'; end if;
  if order_row.status <> 'pending' or order_row.payment_status in ('submitted', 'verified') then
    raise exception 'payfast_order_ineligible' using errcode = '22023';
  end if;
  if order_row.currency <> 'ZAR' then raise exception 'payfast_currency_unsupported' using errcode = '22023'; end if;
  if exists (
    select 1
    from public.store_order_items i
    join public.store_products p on p.id = i.product_id
    left join public.store_inventory_holds h on h.order_id = i.order_id and h.product_id = i.product_id
    where i.order_id = order_row.id
      and not p.inventory_unlimited
      and (h.id is null or h.status <> 'held' or h.expires_at <= now() or h.quantity <> i.quantity)
  ) then raise exception 'payfast_inventory_expired' using errcode = '22023'; end if;

  update public.store_payfast_payment_attempts set status = 'superseded'
  where order_id = order_row.id and status = 'initiated';
  loop
    candidate_reference := 'FP-PF-' || upper(encode(extensions.gen_random_bytes(16), 'hex'));
    exit when not exists (select 1 from public.store_payfast_payment_attempts a where a.provider_reference = candidate_reference);
  end loop;
  insert into public.store_payfast_payment_attempts(order_id, provider_reference, amount, currency)
  values (order_row.id, candidate_reference, order_row.total_amount, order_row.currency)
  returning * into attempt_row;
  return query select attempt_row.id, attempt_row.provider_reference, order_row.order_reference, attempt_row.amount, attempt_row.currency;
end;
$$;

create function public.get_public_payfast_store_payment_attempt(p_order_reference text, p_attempt_id uuid)
returns table(attempt_id uuid, provider_reference text, order_reference text, amount numeric, currency text)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.provider_reference, o.order_reference, a.amount, a.currency
  from public.store_payfast_payment_attempts a
  join public.store_orders o on o.id = a.order_id
  where o.order_reference = upper(trim(p_order_reference))
    and a.id = p_attempt_id
    and a.status = 'initiated'
    and o.status = 'pending'
    and o.payment_status not in ('submitted', 'verified');
$$;

revoke all on function public.begin_public_payfast_store_payment(text), public.get_public_payfast_store_payment_attempt(text, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_public_payfast_store_payment(text), public.get_public_payfast_store_payment_attempt(text, uuid)
  to anon, authenticated;