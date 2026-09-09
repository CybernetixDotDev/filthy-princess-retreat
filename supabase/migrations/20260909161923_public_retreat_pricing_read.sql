-- Narrow, read-only pricing contract for the fixed three-night public retreat product.
create or replace function public.get_public_retreat_price(
  p_product_id uuid,
  p_format public.retreat_format,
  p_guest_count smallint
)
returns table (
  currency text,
  nights smallint,
  guest_count smallint,
  total_usd numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  canonical_guest_count smallint;
begin
  if p_format not in ('solo', 'couples', 'private_group') then
    raise exception 'Private retreat format required';
  end if;

  canonical_guest_count := case
    when p_format = 'solo' then 1
    when p_format = 'couples' then 2
    else p_guest_count
  end;

  if p_format = 'solo' and p_guest_count <> 1 then
    raise exception 'Solo retreats require one guest';
  end if;
  if p_format = 'couples' and p_guest_count <> 2 then
    raise exception 'Couples retreats require two guests';
  end if;
  if canonical_guest_count is null or canonical_guest_count < 1 or canonical_guest_count > 50 then
    raise exception 'Guest count must be between 1 and 50';
  end if;
  if not exists (
    select 1
    from public.retreat_products as product
    where product.id = p_product_id
      and product.is_published = true
      and p_format = any(product.allowed_formats)
  ) then
    raise exception 'Retreat product is unavailable';
  end if;

  return query
    select
      'USD'::text,
      3::smallint,
      canonical_guest_count,
      (pricing.price_usd_per_person_per_night * canonical_guest_count * 3)::numeric
    from public.retreat_pricing as pricing
    where pricing.retreat_product_id = p_product_id
      and pricing.retreat_format = p_format;

  if not found then
    raise exception 'Retreat price is unavailable';
  end if;
end;
$$;

revoke all on function public.get_public_retreat_price(uuid, public.retreat_format, smallint) from public;
revoke all on function public.get_public_retreat_price(uuid, public.retreat_format, smallint) from anon, authenticated;
grant execute on function public.get_public_retreat_price(uuid, public.retreat_format, smallint) to anon, authenticated;
