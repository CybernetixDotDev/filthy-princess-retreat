create type public.inner_sanctum_task_status as enum ('draft', 'published', 'archived');

create table public.inner_sanctum_tasks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  eyebrow text,
  title text not null,
  body text not null,
  prompt text not null,
  status public.inner_sanctum_task_status not null default 'draft',
  available_from timestamptz,
  closes_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inner_sanctum_tasks_slug check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint inner_sanctum_tasks_eyebrow check (eyebrow is null or length(trim(eyebrow)) between 1 and 100),
  constraint inner_sanctum_tasks_title check (length(trim(title)) between 1 and 200),
  constraint inner_sanctum_tasks_body check (length(trim(body)) between 1 and 12000),
  constraint inner_sanctum_tasks_prompt check (length(trim(prompt)) between 1 and 2000),
  constraint inner_sanctum_tasks_closes_after_available check (closes_at is null or available_from is null or closes_at > available_from)
);

create table public.inner_sanctum_task_responses (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.inner_sanctum_tasks(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  response_text text not null,
  submitted_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  constraint inner_sanctum_task_responses_unique unique (task_id, user_id),
  constraint inner_sanctum_task_responses_text check (length(trim(response_text)) between 1 and 5000),
  constraint inner_sanctum_task_responses_acknowledgement check (
    (acknowledged_at is null and acknowledged_by is null) or (acknowledged_at is not null and acknowledged_by is not null)
  )
);

create index inner_sanctum_tasks_visible_idx on public.inner_sanctum_tasks (sort_order, available_from desc, created_at desc) where status = 'published';
create index inner_sanctum_task_responses_user_idx on public.inner_sanctum_task_responses (user_id, submitted_at desc);

create function inner_sanctum_collection_private.set_task_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function inner_sanctum_collection_private.set_task_updated_at() from public, anon, authenticated;
create trigger inner_sanctum_tasks_updated_at before update on public.inner_sanctum_tasks
for each row execute function inner_sanctum_collection_private.set_task_updated_at();

alter table public.inner_sanctum_tasks enable row level security;
alter table public.inner_sanctum_task_responses enable row level security;
revoke all on table public.inner_sanctum_tasks from anon, authenticated;
revoke all on table public.inner_sanctum_task_responses from anon, authenticated;
grant select, insert, update on table public.inner_sanctum_tasks to authenticated;
grant select on table public.inner_sanctum_task_responses to authenticated;

create policy "members read available tasks or answered history and admins read all"
on public.inner_sanctum_tasks for select to authenticated using (
  (select retreat_private.is_retreat_admin())
  or (
    (select public.has_inner_sanctum_access())
    and (
      (status = 'published' and (available_from is null or available_from <= now()))
      or exists (
        select 1 from public.inner_sanctum_task_responses response
        where response.task_id = inner_sanctum_tasks.id and response.user_id = (select auth.uid())
      )
    )
  )
);
create policy "admins create tasks" on public.inner_sanctum_tasks for insert to authenticated
with check ((select retreat_private.is_retreat_admin()));
create policy "admins update tasks" on public.inner_sanctum_tasks for update to authenticated
using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));
create policy "members read own responses and admins read all"
on public.inner_sanctum_task_responses for select to authenticated using (
  (select retreat_private.is_retreat_admin())
  or (user_id = (select auth.uid()) and (select public.has_inner_sanctum_access()))
);

create function public.get_my_inner_sanctum_tasks()
returns table (
  id uuid, slug text, eyebrow text, title text, body text, prompt text,
  status public.inner_sanctum_task_status, available_from timestamptz, closes_at timestamptz,
  sort_order integer, response_text text, submitted_at timestamptz, acknowledged_at timestamptz
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'inner_sanctum_access_required' using errcode = '42501';
  end if;
  return query
  select task.id, task.slug, task.eyebrow, task.title, task.body, task.prompt,
    task.status, task.available_from, task.closes_at, task.sort_order,
    response.response_text, response.submitted_at, response.acknowledged_at
  from public.inner_sanctum_tasks task
  left join public.inner_sanctum_task_responses response
    on response.task_id = task.id and response.user_id = auth.uid()
  where (
    task.status = 'published'
    and (task.available_from is null or task.available_from <= now())
    and (task.closes_at is null or task.closes_at > now())
  ) or response.id is not null
  order by (response.id is null and task.status = 'published' and (task.closes_at is null or task.closes_at > now())) desc,
    task.sort_order, coalesce(task.available_from, task.created_at) desc;
end;
$$;
revoke all on function public.get_my_inner_sanctum_tasks() from public, anon, authenticated;
grant execute on function public.get_my_inner_sanctum_tasks() to authenticated;

create function public.get_my_inner_sanctum_task(p_slug text)
returns table (
  id uuid, slug text, eyebrow text, title text, body text, prompt text,
  status public.inner_sanctum_task_status, available_from timestamptz, closes_at timestamptz,
  sort_order integer, response_text text, submitted_at timestamptz, acknowledged_at timestamptz
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'inner_sanctum_access_required' using errcode = '42501';
  end if;
  return query
  select task.id, task.slug, task.eyebrow, task.title, task.body, task.prompt,
    task.status, task.available_from, task.closes_at, task.sort_order,
    response.response_text, response.submitted_at, response.acknowledged_at
  from public.inner_sanctum_tasks task
  left join public.inner_sanctum_task_responses response on response.task_id = task.id and response.user_id = auth.uid()
  where task.slug = p_slug and (
    (task.status = 'published' and (task.available_from is null or task.available_from <= now()))
    or response.id is not null
  ) limit 1;
end;
$$;
revoke all on function public.get_my_inner_sanctum_task(text) from public, anon, authenticated;
grant execute on function public.get_my_inner_sanctum_task(text) to authenticated;

create function public.submit_inner_sanctum_task_response(p_task_id uuid, p_response_text text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare task public.inner_sanctum_tasks; existing public.inner_sanctum_task_responses; clean_text text; response_id uuid;
begin
  if auth.uid() is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'inner_sanctum_access_required' using errcode = '42501';
  end if;
  clean_text := trim(p_response_text);
  if clean_text is null or length(clean_text) not between 1 and 5000 then
    raise exception 'invalid_response' using errcode = '22023';
  end if;
  select * into task from public.inner_sanctum_tasks where id = p_task_id for share;
  if task.id is null or task.status <> 'published'
    or (task.available_from is not null and task.available_from > now())
    or (task.closes_at is not null and task.closes_at <= now()) then
    raise exception 'task_not_available' using errcode = '22023';
  end if;
  select * into existing from public.inner_sanctum_task_responses where task_id = task.id and user_id = auth.uid();
  if existing.id is not null then
    if existing.response_text = clean_text then return existing.id; end if;
    raise exception 'response_is_final' using errcode = '22023';
  end if;
  insert into public.inner_sanctum_task_responses(task_id,user_id,response_text)
  values (task.id,auth.uid(),clean_text) returning id into response_id;
  return response_id;
exception when unique_violation then
  select * into existing from public.inner_sanctum_task_responses where task_id = p_task_id and user_id = auth.uid();
  if existing.response_text = clean_text then return existing.id; end if;
  raise exception 'response_is_final' using errcode = '22023';
end;
$$;
revoke all on function public.submit_inner_sanctum_task_response(uuid,text) from public, anon, authenticated;
grant execute on function public.submit_inner_sanctum_task_response(uuid,text) to authenticated;

create function public.admin_acknowledge_inner_sanctum_task_response(p_response_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare result timestamptz;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  update public.inner_sanctum_task_responses
  set acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, auth.uid())
  where id = p_response_id returning acknowledged_at into result;
  if result is null then raise exception 'response_not_found' using errcode = '22023'; end if;
  return result;
end;
$$;
revoke all on function public.admin_acknowledge_inner_sanctum_task_response(uuid) from public, anon, authenticated;
grant execute on function public.admin_acknowledge_inner_sanctum_task_response(uuid) to authenticated;

insert into public.inner_sanctum_tasks(slug,eyebrow,title,body,prompt,status,available_from,sort_order)
values (
  'tell-me-something', 'I HAVE A JOB FOR YOU', 'Tell me something.',
  E'There are things people say when they think they’re supposed to be interesting.\n\nI’m much more curious about the things they almost don’t say.',
  'What would you tell me if you knew I wasn’t going to laugh?', 'published', now(), 10
)
on conflict (slug) do nothing;
