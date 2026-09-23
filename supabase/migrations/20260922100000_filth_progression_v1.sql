do $$
begin
  create type public.inner_sanctum_filth_event_class as enum ('earning', 'earning_correction', 'redemption');
exception when duplicate_object then null;
end $$;

alter table public.inner_sanctum_filth_events
  add column if not exists event_class public.inner_sanctum_filth_event_class not null default 'earning';

update public.inner_sanctum_filth_events
set event_class = 'earning_correction'
where points < 0;

alter table public.inner_sanctum_filth_events
  drop constraint if exists inner_sanctum_filth_events_event_class_direction;

alter table public.inner_sanctum_filth_events
  add constraint inner_sanctum_filth_events_event_class_direction check (
    (event_class = 'earning' and points > 0)
    or event_class = 'earning_correction'
    or (event_class = 'redemption' and points < 0)
  );

insert into public.inner_sanctum_filth_levels (level_number, title, threshold, status, sort_order)
values
  (1, 'Curious', 0, 'active', 10),
  (2, 'Peeking', 10, 'active', 20),
  (3, 'Tempted', 50, 'active', 30),
  (4, 'Mischievous', 100, 'active', 40),
  (5, 'Naughty', 250, 'active', 50),
  (6, 'Getting Filthy', 500, 'active', 60),
  (7, 'Filthy', 1000, 'active', 70),
  (8, 'Deliciously Filthy', 1500, 'active', 80),
  (9, 'Bad Influence', 2500, 'active', 90),
  (10, 'Trouble', 4000, 'active', 100),
  (11, 'Very Bad Idea', 6500, 'active', 110),
  (12, 'Shameless', 10500, 'active', 120),
  (13, 'Incorrigible', 17000, 'active', 130),
  (14, 'Corrupted', 27500, 'active', 140),
  (15, 'Beyond Saving', 44500, 'active', 150),
  (16, 'Cally''s Accomplice', 72000, 'active', 160),
  (17, 'Princess''s Favourite', 116500, 'active', 170),
  (18, '???', 188500, 'active', 180)
on conflict (level_number) do update
set title = excluded.title,
    threshold = excluded.threshold,
    status = excluded.status,
    sort_order = excluded.sort_order;

create or replace function public.get_my_filth_progression()
returns table(
  lifetime_filth bigint,
  available_filth bigint,
  current_level integer,
  current_level_title text,
  current_level_threshold integer,
  next_level integer,
  next_level_title text,
  next_level_threshold integer,
  filth_to_next_level bigint,
  progress_percentage numeric,
  can_spend_filth boolean
)
language sql stable security definer set search_path = '' as $$
  with balances as (
    select
      coalesce(sum(case when event_class <> 'redemption' then points else 0 end), 0)::bigint as lifetime_filth,
      coalesce(sum(points), 0)::bigint as available_filth
    from public.inner_sanctum_filth_events
    where user_id = (select auth.uid())
  ), levels as (
    select
      b.lifetime_filth,
      b.available_filth,
      current_level.level_number as current_level,
      current_level.title as current_level_title,
      current_level.threshold as current_level_threshold,
      next_level.level_number as next_level,
      next_level.title as next_level_title,
      next_level.threshold as next_level_threshold
    from balances b
    left join lateral (
      select l.level_number, l.title, l.threshold
      from public.inner_sanctum_filth_levels l
      where l.status = 'active' and l.threshold <= b.lifetime_filth
      order by l.threshold desc
      limit 1
    ) current_level on true
    left join lateral (
      select l.level_number, l.title, l.threshold
      from public.inner_sanctum_filth_levels l
      where l.status = 'active' and l.threshold > b.lifetime_filth
      order by l.threshold
      limit 1
    ) next_level on true
  )
  select
    lifetime_filth,
    available_filth,
    current_level,
    current_level_title,
    current_level_threshold,
    next_level,
    next_level_title,
    next_level_threshold,
    case when next_level_threshold is null then null else (next_level_threshold - lifetime_filth)::bigint end,
    case
      when next_level_threshold is null then 100::numeric
      when current_level_threshold is null or next_level_threshold <= current_level_threshold then 0::numeric
      else greatest(0::numeric, least(100::numeric,
        ((lifetime_filth - current_level_threshold)::numeric / (next_level_threshold - current_level_threshold)::numeric) * 100
      ))
    end,
    (select public.has_inner_sanctum_access())
  from levels;
$$;

revoke all on function public.get_my_filth_progression() from public, anon, authenticated;
grant execute on function public.get_my_filth_progression() to authenticated;

create or replace function inner_sanctum_referral_private.evaluate_filth_milestones(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.inner_sanctum_member_filth_milestones(user_id, milestone_id)
  select p_user_id, m.id
  from public.inner_sanctum_filth_milestones m
  where m.status = 'active'
    and m.threshold <= coalesce((
      select sum(e.points)
      from public.inner_sanctum_filth_events e
      where e.user_id = p_user_id and e.event_class <> 'redemption'
    ), 0)
  on conflict(user_id, milestone_id) do nothing;
$$;

revoke all on function inner_sanctum_referral_private.evaluate_filth_milestones(uuid) from public, anon, authenticated;

create or replace function public.admin_add_filth_points(p_user_id uuid, p_points integer, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare event_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_points = 0 or length(trim(p_reason)) not between 3 and 500 then
    raise exception 'invalid_filth_adjustment' using errcode = '22023';
  end if;
  insert into public.inner_sanctum_filth_events(user_id, event_type, event_class, points, source_reference, created_by)
  values (
    p_user_id,
    'admin',
    case when p_points < 0 then 'earning_correction' else 'earning' end,
    p_points,
    'admin:' || gen_random_uuid() || ':' || trim(p_reason),
    auth.uid()
  ) returning id into event_id;
  perform inner_sanctum_referral_private.evaluate_filth_milestones(p_user_id);
  return event_id;
end;
$$;

revoke all on function public.admin_add_filth_points(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_add_filth_points(uuid, integer, text) to authenticated;

create or replace function public.get_my_filth_meter()
returns table(referral_code text, filth_total bigint, successful_referrals bigint, current_level_number integer, current_level_title text, current_level_threshold integer, next_level_threshold integer, earned_milestones jsonb)
language plpgsql security definer set search_path = '' as $$
declare code_value text; progression record;
begin
  if auth.uid() is null or not (select public.has_inner_sanctum_access()) then
    raise exception 'inner_sanctum_access_required' using errcode = '42501';
  end if;
  select code into code_value from public.inner_sanctum_referrals where user_id = auth.uid();
  select * into progression from public.get_my_filth_progression();
  return query select
    code_value,
    progression.lifetime_filth,
    (select count(*) from public.inner_sanctum_referral_conversions c where c.referrer_user_id = auth.uid()),
    progression.current_level,
    progression.current_level_title,
    progression.current_level_threshold,
    progression.next_level_threshold,
    (select coalesce(jsonb_agg(jsonb_build_object('title', m.title, 'threshold', m.threshold, 'earned_at', earned.earned_at) order by m.threshold), '[]'::jsonb)
     from public.inner_sanctum_member_filth_milestones earned
     join public.inner_sanctum_filth_milestones m on m.id = earned.milestone_id
     where earned.user_id = auth.uid());
end;
$$;

revoke all on function public.get_my_filth_meter() from public, anon, authenticated;
grant execute on function public.get_my_filth_meter() to authenticated;

create or replace function public.get_my_contribution_progress()
returns table(filth_total bigint, accepted_contributions bigint, filth_from_contributions bigint, current_level_number integer, current_level_title text, current_level_threshold integer, next_level_threshold integer, earned_milestones jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare progression record;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into progression from public.get_my_filth_progression();
  return query select
    progression.lifetime_filth,
    (select count(*) from public.contribution_submissions s where s.user_id = auth.uid() and s.status = 'accepted'),
    (select coalesce(sum(e.points), 0) from public.inner_sanctum_filth_events e where e.user_id = auth.uid() and e.event_type::text = 'contribution'),
    progression.current_level,
    progression.current_level_title,
    progression.current_level_threshold,
    progression.next_level_threshold,
    (select coalesce(jsonb_agg(jsonb_build_object('title', m.title, 'threshold', m.threshold, 'earned_at', earned.earned_at) order by m.threshold), '[]'::jsonb)
     from public.inner_sanctum_member_filth_milestones earned
     join public.inner_sanctum_filth_milestones m on m.id = earned.milestone_id
     where earned.user_id = auth.uid());
end;
$$;
