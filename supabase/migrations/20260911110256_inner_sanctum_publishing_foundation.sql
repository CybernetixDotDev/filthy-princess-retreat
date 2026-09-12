-- Lightweight Inner Sanctum editorial publishing for the protected member home.
create type public.inner_sanctum_post_type as enum (
  'message',
  'feature',
  'drop',
  'task',
  'benefit'
);

create type public.inner_sanctum_post_status as enum ('draft', 'published', 'archived');

create table public.inner_sanctum_posts (
  id uuid primary key default gen_random_uuid(),
  type public.inner_sanctum_post_type not null,
  eyebrow text,
  title text not null,
  body text not null,
  image_path text,
  cta_label text,
  cta_href text,
  status public.inner_sanctum_post_status not null default 'draft',
  published_at timestamptz,
  expires_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inner_sanctum_posts_eyebrow_length check (eyebrow is null or length(trim(eyebrow)) between 1 and 100),
  constraint inner_sanctum_posts_title_length check (length(trim(title)) between 1 and 200),
  constraint inner_sanctum_posts_body_length check (length(trim(body)) between 1 and 12000),
  constraint inner_sanctum_posts_image_path check (
    image_path is null or image_path ~ '^/assets/[A-Za-z0-9._/-]+\.(png|jpg|jpeg|webp)$'
  ),
  constraint inner_sanctum_posts_cta_pair check (
    (cta_label is null and cta_href is null)
    or (length(trim(cta_label)) between 1 and 100 and cta_href is not null)
  ),
  constraint inner_sanctum_posts_cta_internal check (
    cta_href is null
    or (left(cta_href, 1) = '/' and left(cta_href, 2) <> '//' and position(E'\\' in cta_href) = 0 and length(cta_href) <= 500)
  ),
  constraint inner_sanctum_posts_expiry_after_publish check (
    expires_at is null or published_at is null or expires_at > published_at
  )
);

create index inner_sanctum_posts_visible_idx
  on public.inner_sanctum_posts (sort_order, published_at desc, created_at desc)
  where status = 'published';
create index inner_sanctum_posts_created_by_idx on public.inner_sanctum_posts (created_by);

create schema if not exists inner_sanctum_content_private;
revoke all on schema inner_sanctum_content_private from public, anon, authenticated;

create function inner_sanctum_content_private.set_updated_at()
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
revoke all on function inner_sanctum_content_private.set_updated_at() from public, anon, authenticated;

create trigger inner_sanctum_posts_updated_at
  before update on public.inner_sanctum_posts
  for each row execute function inner_sanctum_content_private.set_updated_at();

alter table public.inner_sanctum_posts enable row level security;
revoke all on table public.inner_sanctum_posts from anon, authenticated;
grant select, insert, update on table public.inner_sanctum_posts to authenticated;

create policy "active members read visible Sanctum posts"
  on public.inner_sanctum_posts for select to authenticated
  using (
    (select public.has_inner_sanctum_access())
    and status = 'published'
    and (published_at is null or published_at <= now())
    and (expires_at is null or expires_at > now())
  );

create policy "admins read all Sanctum posts"
  on public.inner_sanctum_posts for select to authenticated
  using ((select retreat_private.is_retreat_admin()));
create policy "admins create Sanctum posts"
  on public.inner_sanctum_posts for insert to authenticated
  with check ((select retreat_private.is_retreat_admin()));
create policy "admins update Sanctum posts"
  on public.inner_sanctum_posts for update to authenticated
  using ((select retreat_private.is_retreat_admin()))
  with check ((select retreat_private.is_retreat_admin()));

create function public.get_inner_sanctum_posts()
returns table (
  id uuid,
  type public.inner_sanctum_post_type,
  eyebrow text,
  title text,
  body text,
  image_path text,
  cta_label text,
  cta_href text,
  published_at timestamptz,
  expires_at timestamptz,
  sort_order integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'inner_sanctum_access_required' using errcode = '42501';
  end if;

  return query
  select p.id, p.type, p.eyebrow, p.title, p.body, p.image_path,
    p.cta_label, p.cta_href, p.published_at, p.expires_at, p.sort_order
  from public.inner_sanctum_posts p
  where p.status = 'published'
    and (p.published_at is null or p.published_at <= now())
    and (p.expires_at is null or p.expires_at > now())
  order by p.sort_order, p.published_at desc nulls last, p.created_at desc;
end;
$$;
revoke all on function public.get_inner_sanctum_posts() from public, anon, authenticated;
grant execute on function public.get_inner_sanctum_posts() to authenticated;

insert into public.inner_sanctum_posts
  (type, eyebrow, title, body, image_path, cta_label, cta_href, status, published_at, sort_order)
values
  ('message', 'FROM CALLY', 'So. You''re inside.', E'I suppose I should behave now.\n\nThat seems unlikely.\n\nThis is where I''ll leave things for you. Stories. Questions. Little challenges. Things I''ve made. Things I''ve found. Occasionally something I probably shouldn''t have shared.\n\nSome things will stay.\n\nSome won''t.\n\nYou should probably look around.\n\n— Cally', null, null, null, 'published', now(), 10),
  ('feature', 'CURRENTLY INSIDE', 'The Gate', E'You found the gate.\n\nThere''s something on the other side.\n\nUnfortunately, I seem to have gotten myself into a little trouble.\n\nAgain.', null, null, null, 'published', now(), 20),
  ('drop', 'A LITTLE SOMETHING FROM ME', 'I was supposed to be working.', E'This happened instead.\n\nDon''t encourage me.\n\n— Cally', '/assets/picnicCally.png', null, null, 'published', now(), 30),
  ('task', 'I HAVE A JOB FOR YOU', 'Tell me something.', E'Think of something you''ve wanted to try but have never quite admitted out loud.\n\nYou don''t have to tell me.\n\nYet.\n\nJust admit it to yourself.', null, null, null, 'published', now(), 40),
  ('benefit', 'BEYOND THE SCREEN', 'Some things don''t happen online.', E'From time to time I''ll invite members into other parts of my world — special experiences, events, gifts, personal moments and, sometimes, the Filthy Princess Retreat.\n\nIf there''s something waiting for you, you''ll find it here.', null, null, null, 'published', now(), 50);
