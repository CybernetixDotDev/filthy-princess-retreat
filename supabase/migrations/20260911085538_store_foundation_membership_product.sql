-- Canonical Store catalog, immutable order snapshots, and controlled public order creation.
create type public.store_product_type as enum (
  'membership',
  'digital',
  'experience',
  'session',
  'physical'
);

create type public.store_product_status as enum ('draft', 'active', 'archived');
create type public.store_fulfillment_type as enum ('inner_sanctum_membership', 'manual');
create type public.store_order_status as enum ('pending', 'paid', 'cancelled', 'failed');

create table public.store_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text not null,
  description text not null,
  product_type public.store_product_type not null,
  price_amount numeric(12,2) not null,
  currency text not null default 'USD',
  fulfillment_type public.store_fulfillment_type not null,
  fulfillment_reference text,
  image_path text,
  status public.store_product_status not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_products_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint store_products_name_length check (length(trim(name)) between 2 and 200),
  constraint store_products_short_description_length check (length(trim(short_description)) between 2 and 300),
  constraint store_products_description_length check (length(trim(description)) between 2 and 10000),
  constraint store_products_price_nonnegative check (price_amount >= 0),
  constraint store_products_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint store_products_fulfillment_reference_length check (
    fulfillment_reference is null or length(trim(fulfillment_reference)) between 1 and 200
  ),
  constraint store_products_image_path_format check (
    image_path is null or image_path ~ '^/assets/[A-Za-z0-9._/-]+\.(png|jpg|jpeg|webp)$'
  ),
  constraint store_products_inner_sanctum_fulfillment check (
    fulfillment_type <> 'inner_sanctum_membership'
    or (
      product_type = 'membership'
      and fulfillment_reference = 'lifetime'
    )
  )
);

create index store_products_public_catalog_idx
  on public.store_products (status, sort_order, created_at);

create table public.store_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  request_key uuid not null unique,
  user_id uuid references auth.users(id) on delete set null,
  buyer_email text not null,
  status public.store_order_status not null default 'pending',
  currency text not null,
  subtotal_amount numeric(12,2) not null,
  total_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_orders_reference_format check (
    order_reference ~ '^FP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$'
  ),
  constraint store_orders_buyer_email check (
    length(trim(buyer_email)) between 3 and 320
    and position('@' in buyer_email) > 1
  ),
  constraint store_orders_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint store_orders_amounts_nonnegative check (
    subtotal_amount >= 0 and total_amount >= 0
  ),
  constraint store_orders_total_matches_subtotal check (total_amount = subtotal_amount)
);

create index store_orders_user_id_idx on public.store_orders (user_id);
create index store_orders_created_at_idx on public.store_orders (created_at desc);
create index store_orders_status_idx on public.store_orders (status, created_at desc);

create table public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.store_orders(id) on delete restrict,
  product_id uuid not null references public.store_products(id) on delete restrict,
  product_name text not null,
  product_slug text not null,
  product_type public.store_product_type not null,
  unit_price_amount numeric(12,2) not null,
  currency text not null,
  quantity integer not null default 1,
  line_total_amount numeric(12,2) not null,
  fulfillment_type public.store_fulfillment_type not null,
  fulfillment_reference text,
  created_at timestamptz not null default now(),
  constraint store_order_items_product_name_length check (length(trim(product_name)) between 2 and 200),
  constraint store_order_items_product_slug_length check (length(trim(product_slug)) between 1 and 200),
  constraint store_order_items_unit_price_nonnegative check (unit_price_amount >= 0),
  constraint store_order_items_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint store_order_items_single_product_quantity check (quantity = 1),
  constraint store_order_items_line_total check (line_total_amount = unit_price_amount * quantity),
  constraint store_order_items_fulfillment_reference_length check (
    fulfillment_reference is null or length(trim(fulfillment_reference)) between 1 and 200
  )
);

create index store_order_items_product_id_idx on public.store_order_items (product_id);

alter table public.store_products enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;

revoke all on table public.store_products, public.store_orders, public.store_order_items
  from anon, authenticated;
grant select on table public.store_products to anon, authenticated;
grant insert, update on table public.store_products to authenticated;
grant select on table public.store_orders, public.store_order_items to authenticated;

create policy "active Store products are public"
  on public.store_products for select to anon
  using (status = 'active');
create policy "authenticated users read the Store catalog"
  on public.store_products for select to authenticated
  using (
    status = 'active'
    or (select retreat_private.is_retreat_admin())
  );
create policy "admins create Store products"
  on public.store_products for insert to authenticated
  with check ((select retreat_private.is_retreat_admin()));
create policy "admins update Store products"
  on public.store_products for update to authenticated
  using ((select retreat_private.is_retreat_admin()))
  with check ((select retreat_private.is_retreat_admin()));

create policy "admins read Store orders"
  on public.store_orders for select to authenticated
  using ((select retreat_private.is_retreat_admin()));
create policy "admins read Store order items"
  on public.store_order_items for select to authenticated
  using ((select retreat_private.is_retreat_admin()));

create schema if not exists store_private;
revoke all on schema store_private from public, anon, authenticated;

create function store_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function store_private.set_updated_at() from public, anon, authenticated;

create function store_private.protect_order_commercial_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(new.order_reference, new.request_key, new.currency, new.subtotal_amount, new.total_amount, new.created_at)
    is distinct from
    row(old.order_reference, old.request_key, old.currency, old.subtotal_amount, old.total_amount, old.created_at) then
    raise exception 'store_order_commercial_snapshot_is_immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function store_private.protect_order_commercial_snapshot() from public, anon, authenticated;

create function store_private.protect_order_item_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'store_order_item_snapshot_is_immutable';
end;
$$;
revoke all on function store_private.protect_order_item_snapshot() from public, anon, authenticated;

create trigger store_products_updated_at
  before update on public.store_products
  for each row execute function store_private.set_updated_at();
create trigger store_orders_protect_commercial_snapshot
  before update on public.store_orders
  for each row execute function store_private.protect_order_commercial_snapshot();
create trigger store_order_items_protect_snapshot
  before update or delete on public.store_order_items
  for each row execute function store_private.protect_order_item_snapshot();

create function public.create_public_store_order(
  p_product_id uuid,
  p_buyer_email text,
  p_request_key uuid
)
returns table (
  order_reference text,
  order_status public.store_order_status,
  currency text,
  total_amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_product public.store_products%rowtype;
  existing_order public.store_orders%rowtype;
  new_order public.store_orders%rowtype;
  normalized_email text := lower(trim(p_buyer_email));
  candidate_reference text;
begin
  if p_product_id is null or p_request_key is null
    or length(normalized_email) not between 3 and 320
    or position('@' in normalized_email) <= 1 then
    raise exception 'invalid_store_order_request' using errcode = '22023';
  end if;

  select * into existing_order
  from public.store_orders
  where request_key = p_request_key;

  if existing_order.id is not null then
    if existing_order.buyer_email is distinct from normalized_email then
      raise exception 'store_order_request_conflict' using errcode = '23505';
    end if;
    return query select existing_order.order_reference, existing_order.status,
      existing_order.currency, existing_order.total_amount;
    return;
  end if;

  select * into selected_product
  from public.store_products
  where id = p_product_id and status = 'active';

  if selected_product.id is null then
    raise exception 'store_product_unavailable' using errcode = 'P0002';
  end if;

  loop
    candidate_reference := 'FP-'
      || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 8)) || '-'
      || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 9, 8)) || '-'
      || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 17, 8));
    exit when not exists (
      select 1
      from public.store_orders o
      where o.order_reference = candidate_reference
    );
  end loop;

  insert into public.store_orders (
    order_reference,
    request_key,
    user_id,
    buyer_email,
    status,
    currency,
    subtotal_amount,
    total_amount
  ) values (
    candidate_reference,
    p_request_key,
    auth.uid(),
    normalized_email,
    'pending',
    selected_product.currency,
    selected_product.price_amount,
    selected_product.price_amount
  ) returning * into new_order;

  insert into public.store_order_items (
    order_id,
    product_id,
    product_name,
    product_slug,
    product_type,
    unit_price_amount,
    currency,
    quantity,
    line_total_amount,
    fulfillment_type,
    fulfillment_reference
  ) values (
    new_order.id,
    selected_product.id,
    selected_product.name,
    selected_product.slug,
    selected_product.product_type,
    selected_product.price_amount,
    selected_product.currency,
    1,
    selected_product.price_amount,
    selected_product.fulfillment_type,
    selected_product.fulfillment_reference
  );

  return query select new_order.order_reference, new_order.status,
    new_order.currency, new_order.total_amount;
end;
$$;

revoke all on function public.create_public_store_order(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_public_store_order(uuid, text, uuid)
  to anon, authenticated;

create function public.get_public_store_order(p_order_reference text)
returns table (
  order_reference text,
  order_status public.store_order_status,
  currency text,
  total_amount numeric,
  created_at timestamptz,
  product_name text,
  product_slug text,
  product_type public.store_product_type,
  quantity integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.order_reference,
    o.status,
    o.currency,
    o.total_amount,
    o.created_at,
    i.product_name,
    i.product_slug,
    i.product_type,
    i.quantity
  from public.store_orders o
  join public.store_order_items i on i.order_id = o.id
  where o.order_reference = upper(trim(p_order_reference));
$$;

revoke all on function public.get_public_store_order(text)
  from public, anon, authenticated;
grant execute on function public.get_public_store_order(text)
  to anon, authenticated;

insert into public.store_products (
  slug,
  name,
  short_description,
  description,
  product_type,
  price_amount,
  currency,
  fulfillment_type,
  fulfillment_reference,
  image_path,
  status,
  sort_order
) values (
  'inner-sanctum-lifetime',
  'Lifetime Inner Sanctum Membership',
  'Come inside. Stay forever.',
  E'Lifetime access to the Inner Sanctum.\n\nFilthy experiences. Interactive stories. Games. Private content. Pictures. Video. Occasional gifts from me. Things I haven''t thought of yet.\n\nAnd every now and then, something rather more interesting.\n\nOne payment.\n\nYou''re in.',
  'membership',
  500.00,
  'USD',
  'inner_sanctum_membership',
  'lifetime',
  '/assets/EnchantedLace.png',
  'active',
  1
)
on conflict (slug) do nothing;
