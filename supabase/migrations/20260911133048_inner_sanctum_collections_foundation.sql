create type public.inner_sanctum_collectible_status as enum ('draft', 'active', 'archived');
create type public.inner_sanctum_collectible_source as enum ('admin', 'experience', 'task', 'invitation', 'system');

create table public.inner_sanctum_collectibles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  media_path text,
  media_type text,
  status public.inner_sanctum_collectible_status not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inner_sanctum_collectibles_slug check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint inner_sanctum_collectibles_title check (length(trim(title)) between 1 and 200),
  constraint inner_sanctum_collectibles_description check (length(trim(description)) between 1 and 4000),
  constraint inner_sanctum_collectibles_media_pair check (
    (media_path is null and media_type is null)
    or (
      media_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
      and media_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4')
    )
  )
);

create table public.inner_sanctum_member_collectibles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  collectible_id uuid not null references public.inner_sanctum_collectibles(id) on delete restrict,
  source public.inner_sanctum_collectible_source not null,
  source_reference text,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  constraint inner_sanctum_member_collectibles_unique unique (user_id, collectible_id),
  constraint inner_sanctum_member_collectibles_source_reference check (
    source_reference is null or length(trim(source_reference)) between 1 and 500
  )
);

create index inner_sanctum_collectibles_active_order_idx
  on public.inner_sanctum_collectibles (sort_order, created_at)
  where status = 'active';
create index inner_sanctum_member_collectibles_user_idx
  on public.inner_sanctum_member_collectibles (user_id, granted_at desc);

create schema if not exists inner_sanctum_collection_private;
revoke all on schema inner_sanctum_collection_private from public, anon, authenticated;

create function inner_sanctum_collection_private.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function inner_sanctum_collection_private.set_updated_at() from public, anon, authenticated;

create trigger inner_sanctum_collectibles_updated_at
  before update on public.inner_sanctum_collectibles
  for each row execute function inner_sanctum_collection_private.set_updated_at();

alter table public.inner_sanctum_collectibles enable row level security;
alter table public.inner_sanctum_member_collectibles enable row level security;
revoke all on table public.inner_sanctum_collectibles from anon, authenticated;
revoke all on table public.inner_sanctum_member_collectibles from anon, authenticated;
grant select, insert, update on table public.inner_sanctum_collectibles to authenticated;
grant select on table public.inner_sanctum_member_collectibles to authenticated;

create policy "members read owned active collectibles or admins read all"
  on public.inner_sanctum_collectibles for select to authenticated
  using (
    (select retreat_private.is_retreat_admin())
    or (
      status = 'active'
      and (select public.has_inner_sanctum_access())
      and exists (
        select 1 from public.inner_sanctum_member_collectibles ownership
        where ownership.collectible_id = id and ownership.user_id = (select auth.uid())
      )
    )
  );
create policy "admins create collectibles"
  on public.inner_sanctum_collectibles for insert to authenticated
  with check ((select retreat_private.is_retreat_admin()));
create policy "admins update collectibles"
  on public.inner_sanctum_collectibles for update to authenticated
  using ((select retreat_private.is_retreat_admin()))
  with check ((select retreat_private.is_retreat_admin()));
create policy "members read own collectible grants or admins read all"
  on public.inner_sanctum_member_collectibles for select to authenticated
  using (
    (select retreat_private.is_retreat_admin())
    or (user_id = (select auth.uid()) and (select public.has_inner_sanctum_access()))
  );

create function public.get_my_inner_sanctum_collection()
returns table (
  id uuid, slug text, title text, description text, media_path text,
  media_type text, sort_order integer, granted_at timestamptz
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'inner_sanctum_access_required' using errcode = '42501';
  end if;
  return query
  select c.id, c.slug, c.title, c.description, c.media_path, c.media_type,
    c.sort_order, ownership.granted_at
  from public.inner_sanctum_member_collectibles ownership
  join public.inner_sanctum_collectibles c on c.id = ownership.collectible_id
  where ownership.user_id = auth.uid() and c.status = 'active'
  order by c.sort_order, ownership.granted_at desc, c.created_at;
end;
$$;
revoke all on function public.get_my_inner_sanctum_collection() from public, anon, authenticated;
grant execute on function public.get_my_inner_sanctum_collection() to authenticated;

create function public.admin_grant_inner_sanctum_collectible(
  p_user_id uuid,
  p_collectible_id uuid,
  p_source_reference text default null
)
returns public.inner_sanctum_member_collectibles
language plpgsql security definer set search_path = '' as $$
declare result public.inner_sanctum_member_collectibles;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users where user_id = auth.uid()
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user_not_found' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.inner_sanctum_collectibles
    where id = p_collectible_id and status = 'active'
  ) then
    raise exception 'active_collectible_required' using errcode = '22023';
  end if;
  if p_source_reference is not null and length(trim(p_source_reference)) not between 1 and 500 then
    raise exception 'invalid_source_reference' using errcode = '22023';
  end if;

  insert into public.inner_sanctum_member_collectibles
    (user_id, collectible_id, source, source_reference, granted_by)
  values (p_user_id, p_collectible_id, 'admin', nullif(trim(p_source_reference), ''), auth.uid())
  on conflict (user_id, collectible_id) do nothing;

  select * into result from public.inner_sanctum_member_collectibles
  where user_id = p_user_id and collectible_id = p_collectible_id;
  return result;
end;
$$;
revoke all on function public.admin_grant_inner_sanctum_collectible(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_grant_inner_sanctum_collectible(uuid, uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inner-sanctum-media', 'inner-sanctum-media', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "admins upload Inner Sanctum media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inner-sanctum-media'
    and (select retreat_private.is_retreat_admin())
  );
create policy "authorized Inner Sanctum media reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'inner-sanctum-media'
    and storage.allow_any_operation(array['object.get_authenticated_info', 'object.get_authenticated'])
    and (
      (select retreat_private.is_retreat_admin())
      or (
        (select public.has_inner_sanctum_access())
        and exists (
          select 1
          from public.inner_sanctum_collectibles c
          join public.inner_sanctum_member_collectibles ownership on ownership.collectible_id = c.id
          where c.status = 'active'
            and c.media_path = storage.objects.name
            and ownership.user_id = (select auth.uid())
        )
      )
    )
  );

insert into public.inner_sanctum_collectibles
  (slug, title, description, status, sort_order)
values ('first-key', 'The First Key', 'You came inside. Keep this.', 'active', 10)
on conflict (slug) do nothing;
