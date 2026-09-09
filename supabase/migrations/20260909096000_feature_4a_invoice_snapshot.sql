create table if not exists public.retreat_invoices (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.retreat_quotes(id) on delete restrict,
  enquiry_id uuid not null references public.retreat_enquiries(id) on delete restrict,
  invoice_reference text not null unique,
  amount_usd numeric(12,2) not null check (amount_usd >= 0),
  eth_price_usd numeric(18,8) not null check (eth_price_usd > 0),
  amount_eth numeric(18,8) not null check (amount_eth > 0),
  wallet_address text not null,
  public_slug text not null unique,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retreat_invoices_enquiry_idx
  on public.retreat_invoices(enquiry_id, created_at desc);

create or replace function public.get_public_invoice_by_slug(p_public_slug text)
returns table (
  id uuid,
  invoice_reference text,
  quote_id uuid,
  enquiry_id uuid,
  guest_name text,
  retreat_type_name text,
  retreat_format public.retreat_format,
  guest_count smallint,
  start_date date,
  end_date date,
  total_price numeric(12,2),
  amount_usd numeric(12,2),
  amount_eth numeric(18,8),
  eth_price_usd numeric(18,8),
  wallet_address text,
  public_slug text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    i.id,
    i.invoice_reference,
    i.quote_id,
    i.enquiry_id,
    e.full_name as guest_name,
    q.retreat_type_name,
    q.retreat_format,
    q.guest_count,
    q.start_date,
    q.end_date,
    q.total_price,
    i.amount_usd,
    i.amount_eth,
    i.eth_price_usd,
    i.wallet_address,
    i.public_slug,
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
