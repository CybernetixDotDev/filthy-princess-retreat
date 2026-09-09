alter type public.payment_status add value if not exists 'payment_submitted';
alter type public.payment_status add value if not exists 'payment_verified';
alter table public.retreat_quotes add column if not exists eth_amount numeric(38,18), add column if not exists eth_converted_at timestamptz, add column if not exists eth_price_usd numeric(38,18), add column if not exists payment_submitted_at timestamptz, add column if not exists payment_verified_at timestamptz, add column if not exists payment_verified_by uuid, add column if not exists payment_tx_hash text;
