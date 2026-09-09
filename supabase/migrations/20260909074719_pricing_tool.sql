create table public.retreat_pricing (
  id uuid primary key default gen_random_uuid(),
  retreat_product_id uuid not null references public.retreat_products(id) on delete cascade,
  retreat_format public.retreat_format not null,
  price_usd_per_person_per_night numeric(12,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retreat_pricing_private_format check (retreat_format in ('solo', 'couples', 'private_group')),
  constraint retreat_pricing_nonnegative check (price_usd_per_person_per_night >= 0),
  constraint retreat_pricing_current_rate unique (retreat_product_id, retreat_format)
);

create trigger retreat_pricing_updated_at
before update on public.retreat_pricing
for each row execute function public.retreat_set_updated_at();

alter table public.retreat_pricing enable row level security;
revoke all on public.retreat_pricing from public, anon, authenticated;
grant select, insert, update on public.retreat_pricing to authenticated;

create policy "admins read retreat pricing"
on public.retreat_pricing for select to authenticated
using ((select retreat_private.is_retreat_admin()));

create policy "admins insert retreat pricing"
on public.retreat_pricing for insert to authenticated
with check ((select retreat_private.is_retreat_admin()));

create policy "admins update retreat pricing"
on public.retreat_pricing for update to authenticated
using ((select retreat_private.is_retreat_admin()))
with check ((select retreat_private.is_retreat_admin()));

alter table public.retreat_events
add column price_usd_per_person numeric(12,2) not null default 0,
add constraint retreat_events_price_nonnegative check (price_usd_per_person >= 0);
