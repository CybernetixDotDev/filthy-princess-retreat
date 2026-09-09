alter table public.retreat_invoices enable row level security;

revoke all on public.retreat_invoices from public, anon, authenticated;
grant select, insert on public.retreat_invoices to authenticated;

create policy "admins read invoices"
  on public.retreat_invoices
  for select
  to authenticated
  using ((select retreat_private.is_retreat_admin()));

create policy "admins insert invoices"
  on public.retreat_invoices
  for insert
  to authenticated
  with check ((select retreat_private.is_retreat_admin()));

drop function if exists public.get_public_invoice_by_slug(text);

create function public.get_public_invoice_by_slug(p_public_slug text)
returns table (
  invoice_reference text,
  guest_name text,
  retreat_type_name text,
  retreat_format public.retreat_format,
  guest_count smallint,
  start_date date,
  end_date date,
  amount_usd numeric(12,2),
  amount_eth numeric(18,8),
  eth_price_usd numeric(18,8),
  wallet_address text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    i.invoice_reference,
    e.full_name as guest_name,
    q.retreat_type_name,
    q.retreat_format,
    q.guest_count,
    q.start_date,
    q.end_date,
    i.amount_usd,
    i.amount_eth,
    i.eth_price_usd,
    i.wallet_address,
    i.status,
    i.created_at
  from public.retreat_invoices i
  join public.retreat_quotes q on q.id = i.quote_id
  join public.retreat_enquiries e on e.id = q.enquiry_id
  where i.public_slug = p_public_slug
  limit 1;
$$;

revoke all on function public.get_public_invoice_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_public_invoice_by_slug(text) to anon, authenticated;