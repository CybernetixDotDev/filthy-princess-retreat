create or replace function public.get_my_filth_milestones()
returns table(
  id uuid,
  threshold integer,
  title text,
  reward_type public.inner_sanctum_filth_reward_type,
  reward_reference text,
  earned_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    milestone.id,
    milestone.threshold,
    milestone.title,
    milestone.reward_type,
    milestone.reward_reference,
    earned.earned_at
  from public.inner_sanctum_filth_milestones milestone
  left join public.inner_sanctum_member_filth_milestones earned
    on earned.milestone_id = milestone.id
   and earned.user_id = (select auth.uid())
  where (select auth.uid()) is not null
    and milestone.status = 'active'
  order by milestone.threshold;
$$;

revoke all on function public.get_my_filth_milestones() from public, anon, authenticated;
grant execute on function public.get_my_filth_milestones() to authenticated;
