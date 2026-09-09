alter table public.retreat_quotes
  add column if not exists rate_usd_per_person_per_night numeric(12,2),
  add column if not exists public_slug text;

create unique index if not exists retreat_quotes_public_slug_idx
  on public.retreat_quotes(public_slug)
  where public_slug is not null;

create or replace function public.get_public_quote_by_slug(p_public_slug text)
returns table (
  id uuid,
  guest_name text,
  retreat_type_name text,
  retreat_format public.retreat_format,
  guest_count smallint,
  start_date date,
  end_date date,
  nights integer,
  total_price numeric(12,2),
  rate_usd_per_person_per_night numeric(12,2),
  currency text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    q.id,
    e.full_name as guest_name,
    q.retreat_type_name,
    q.retreat_format,
    q.guest_count,
    q.start_date,
    q.end_date,
    case
      when q.end_date is not null then 1 + (q.end_date - q.start_date)
      else 1
    end::integer as nights,
    q.total_price,
    q.rate_usd_per_person_per_night,
    q.currency,
    q.created_at
  from public.retreat_quotes q
  join public.retreat_enquiries e on e.id = q.enquiry_id
  where q.public_slug = p_public_slug
  limit 1;
$$;

revoke all on function public.get_public_quote_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_public_quote_by_slug(text) to anon, authenticated;
