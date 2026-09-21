-- Teaser foundation only. Private visibility means future unlisted bearer access.
create type public.teaser_status as enum ('draft', 'published');
create type public.teaser_visibility as enum ('private', 'public');
create schema teaser_private;
revoke all on schema teaser_private from public, anon, authenticated;
grant usage on schema teaser_private to authenticated;

create function teaser_private.valid_copy(value text, max_length integer)
returns boolean language sql immutable strict set search_path = '' as $$
  select length(value) between 1 and max_length
    and value = btrim(value, E' \t\r\n') and value ~ '[^[:space:]]';
$$;
create function teaser_private.valid_graffiti(lines text[])
returns boolean language sql immutable strict set search_path = '' as $$
  select cardinality(lines) <= 15
    and (cardinality(lines) = 0 or (array_ndims(lines) = 1 and array_lower(lines, 1) = 1))
    and not exists (select 1 from unnest(lines) as phrase
      where phrase is null or not teaser_private.valid_copy(phrase, 200));
$$;
create function teaser_private.valid_image_path(path text, teaser_id uuid, slot integer)
returns boolean language sql immutable strict set search_path = '' as $$
  select length(path) <= 150 and path ~ (
    '^' || teaser_id::text || '/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-polaroid-' || slot::text || '\.webp$');
$$;
revoke all on function teaser_private.valid_copy(text, integer),
  teaser_private.valid_graffiti(text[]), teaser_private.valid_image_path(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function teaser_private.valid_copy(text, integer),
  teaser_private.valid_graffiti(text[]), teaser_private.valid_image_path(text, uuid, integer)
  to authenticated;

create table public.teasers (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null check (teaser_private.valid_copy(internal_name, 200)),
  eyebrow text check (teaser_private.valid_copy(eyebrow, 100)),
  title text not null check (teaser_private.valid_copy(title, 200)),
  body text not null check (teaser_private.valid_copy(body, 12000)),
  graffiti_lines text[] not null default '{}' check (teaser_private.valid_graffiti(graffiti_lines)),
  image_1_path text check (teaser_private.valid_image_path(image_1_path, id, 1)),
  image_2_path text check (teaser_private.valid_image_path(image_2_path, id, 2)),
  image_3_path text check (teaser_private.valid_image_path(image_3_path, id, 3)),
  store_product_id uuid references public.store_products(id) on delete restrict,
  slug text not null unique default encode(extensions.gen_random_bytes(24), 'hex')
    check (slug ~ '^[a-f0-9]{48}$'),
  status public.teaser_status not null default 'draft',
  visibility public.teaser_visibility not null default 'private',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index teasers_status_updated_at_idx on public.teasers(status, updated_at desc);
create index teasers_store_product_id_idx on public.teasers(store_product_id);
create index teasers_created_by_idx on public.teasers(created_by);

create function teaser_private.protect_teaser_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if not retreat_private.is_retreat_admin() then
      raise exception 'admin_required';
    end if;
    new.created_by := auth.uid();
    new.status := 'draft';
    new.visibility := 'private';
    new.created_at := now();
    new.published_at := null;
    -- INSERT column grants exclude slug; its database default supplies randomness.
  else
    if new.id is distinct from old.id or new.slug is distinct from old.slug
      or new.created_at is distinct from old.created_at then
      raise exception 'teaser_identity_is_immutable';
    end if;
    if new.created_by is distinct from old.created_by then
      -- Permit only the nested auth.users FK deletion action, never an ordinary edit.
      if not (pg_trigger_depth() > 1 and new.created_by is null and old.created_by is not null
        and not exists (select 1 from auth.users where id = old.created_by)) then
        raise exception 'teaser_creator_is_immutable';
      end if;
    end if;
    if new.published_at is distinct from old.published_at then
      raise exception 'teaser_publication_time_is_managed';
    end if;
    if old.published_at is null and old.status = 'draft' and new.status = 'published' then
      new.published_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function teaser_private.protect_teaser_audit() from public, anon, authenticated;
create trigger protect_teaser_audit before insert or update on public.teasers
  for each row execute function teaser_private.protect_teaser_audit();

alter table public.teasers enable row level security;
revoke all on public.teasers from public, anon, authenticated;
grant select on public.teasers to authenticated;
grant insert (internal_name, eyebrow, title, body, graffiti_lines, image_1_path, image_2_path,
  image_3_path, store_product_id) on public.teasers to authenticated;
grant update (internal_name, eyebrow, title, body, graffiti_lines, image_1_path, image_2_path,
  image_3_path, store_product_id, status, visibility) on public.teasers to authenticated;
create policy teasers_admin_select on public.teasers for select to authenticated
  using ((select retreat_private.is_retreat_admin()));
create policy teasers_admin_insert on public.teasers for insert to authenticated
  with check ((select retreat_private.is_retreat_admin()));
create policy teasers_admin_update on public.teasers for update to authenticated
  using ((select retreat_private.is_retreat_admin()))
  with check ((select retreat_private.is_retreat_admin()));
