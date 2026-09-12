create type public.inner_sanctum_benefit_type as enum ('invitation', 'gift', 'experience', 'event', 'retreat', 'personal');
create type public.inner_sanctum_benefit_status as enum ('draft', 'available', 'withdrawn', 'completed', 'expired');
create type public.inner_sanctum_benefit_response as enum ('accepted', 'declined');

create table public.inner_sanctum_benefits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.inner_sanctum_benefit_type not null,
  eyebrow text,
  title text not null,
  body text not null,
  media_path text,
  media_type text,
  cta_label text,
  cta_href text,
  status public.inner_sanctum_benefit_status not null default 'draft',
  response public.inner_sanctum_benefit_response,
  available_from timestamptz,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint inner_sanctum_benefits_eyebrow check (eyebrow is null or length(trim(eyebrow)) between 1 and 100),
  constraint inner_sanctum_benefits_title check (length(trim(title)) between 1 and 200),
  constraint inner_sanctum_benefits_body check (length(trim(body)) between 1 and 12000),
  constraint inner_sanctum_benefits_media_pair check (
    (media_path is null and media_type is null)
    or (media_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$' and media_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4'))
  ),
  constraint inner_sanctum_benefits_cta_pair check (
    (cta_label is null and cta_href is null)
    or (length(trim(cta_label)) between 1 and 100 and cta_href is not null)
  ),
  constraint inner_sanctum_benefits_cta_internal check (
    cta_href is null
    or (left(cta_href, 1) = '/' and left(cta_href, 2) <> '//' and position(E'\\' in cta_href) = 0 and cta_href !~ '[\r\n]' and length(cta_href) <= 500)
  ),
  constraint inner_sanctum_benefits_expiry check (expires_at is null or available_from is null or expires_at > available_from),
  constraint inner_sanctum_benefits_response_time check (
    (response is null and responded_at is null) or (response is not null and responded_at is not null)
  )
);

create index inner_sanctum_benefits_member_idx on public.inner_sanctum_benefits (user_id, status, available_from desc, created_at desc);

create function inner_sanctum_collection_private.set_benefit_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function inner_sanctum_collection_private.set_benefit_updated_at() from public, anon, authenticated;
create trigger inner_sanctum_benefits_updated_at before update on public.inner_sanctum_benefits
for each row execute function inner_sanctum_collection_private.set_benefit_updated_at();

alter table public.inner_sanctum_benefits enable row level security;
revoke all on table public.inner_sanctum_benefits from anon, authenticated;
grant select, insert, update on table public.inner_sanctum_benefits to authenticated;

create policy "members read visible own benefits or admins read all"
on public.inner_sanctum_benefits for select to authenticated using (
  (select retreat_private.is_retreat_admin())
  or (
    user_id = (select auth.uid())
    and (select public.has_inner_sanctum_access())
    and (
      (status = 'available' and (available_from is null or available_from <= now()) and (expires_at is null or expires_at > now()))
      or status in ('completed', 'expired')
      or response is not null
    )
  )
);
create policy "admins create benefits" on public.inner_sanctum_benefits for insert to authenticated
with check ((select retreat_private.is_retreat_admin()));
create policy "admins update benefits" on public.inner_sanctum_benefits for update to authenticated
using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));

create function public.get_my_inner_sanctum_benefits()
returns table (
  id uuid, type public.inner_sanctum_benefit_type, eyebrow text, title text, body text,
  media_path text, media_type text, cta_label text, cta_href text,
  status public.inner_sanctum_benefit_status, response public.inner_sanctum_benefit_response,
  available_from timestamptz, expires_at timestamptz, responded_at timestamptz, created_at timestamptz
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'inner_sanctum_access_required' using errcode = '42501';
  end if;
  return query
  select b.id, b.type, b.eyebrow, b.title, b.body, b.media_path, b.media_type,
    b.cta_label, b.cta_href, b.status, b.response, b.available_from, b.expires_at,
    b.responded_at, b.created_at
  from public.inner_sanctum_benefits b
  where b.user_id = auth.uid()
    and (
      (b.status = 'available' and (b.available_from is null or b.available_from <= now()) and (b.expires_at is null or b.expires_at > now()))
      or b.status in ('completed', 'expired')
      or b.response is not null
    )
  order by (b.status = 'available' and b.response is null) desc, coalesce(b.available_from, b.created_at) desc;
end;
$$;
revoke all on function public.get_my_inner_sanctum_benefits() from public, anon, authenticated;
grant execute on function public.get_my_inner_sanctum_benefits() to authenticated;

create function public.respond_to_inner_sanctum_benefit(
  p_benefit_id uuid,
  p_response public.inner_sanctum_benefit_response
)
returns public.inner_sanctum_benefit_response
language plpgsql security definer set search_path = '' as $$
declare benefit public.inner_sanctum_benefits;
begin
  if auth.uid() is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'inner_sanctum_access_required' using errcode = '42501';
  end if;
  select * into benefit from public.inner_sanctum_benefits where id = p_benefit_id for update;
  if benefit.id is null or benefit.user_id <> auth.uid() then
    raise exception 'benefit_not_found' using errcode = '22023';
  end if;
  if benefit.response is not null then
    if benefit.response = p_response then return benefit.response; end if;
    raise exception 'response_is_final' using errcode = '22023';
  end if;
  if benefit.type not in ('invitation', 'event', 'retreat')
    or benefit.status <> 'available'
    or (benefit.available_from is not null and benefit.available_from > now())
    or (benefit.expires_at is not null and benefit.expires_at <= now()) then
    raise exception 'benefit_not_respondable' using errcode = '22023';
  end if;
  update public.inner_sanctum_benefits set response = p_response, responded_at = now()
  where id = benefit.id;
  return p_response;
end;
$$;
revoke all on function public.respond_to_inner_sanctum_benefit(uuid, public.inner_sanctum_benefit_response) from public, anon, authenticated;
grant execute on function public.respond_to_inner_sanctum_benefit(uuid, public.inner_sanctum_benefit_response) to authenticated;

drop policy "authorized Inner Sanctum media reads" on storage.objects;
create policy "authorized Inner Sanctum media reads"
on storage.objects for select to authenticated using (
  bucket_id = 'inner-sanctum-media'
  and storage.allow_any_operation(array['object.get_authenticated_info', 'object.get_authenticated'])
  and (
    (select retreat_private.is_retreat_admin())
    or (
      (select public.has_inner_sanctum_access())
      and (
        exists (
          select 1 from public.inner_sanctum_collectibles c
          join public.inner_sanctum_member_collectibles ownership on ownership.collectible_id = c.id
          where c.status = 'active' and c.media_path = storage.objects.name and ownership.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.inner_sanctum_benefits b
          where b.user_id = (select auth.uid()) and b.media_path = storage.objects.name
            and (
              (b.status = 'available' and (b.available_from is null or b.available_from <= now()) and (b.expires_at is null or b.expires_at > now()))
              or b.status in ('completed', 'expired') or b.response is not null
            )
        )
      )
    )
  )
);
