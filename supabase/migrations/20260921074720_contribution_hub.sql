-- Cell 6: Auth-owned submissions and private, atomic administrative recognition.
create type public.contribution_category as enum ('design','development','creative','marketing','idea','experience_event','other');
create type public.contribution_status as enum ('submitted','reviewing','accepted','declined');
alter type public.inner_sanctum_filth_event_type add value 'contribution';
create table public.contribution_submissions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete restrict,
 category public.contribution_category not null,
 title text not null check (length(trim(title)) between 1 and 200),
 description text not null check (length(trim(description)) between 1 and 12000),
 work_url text check (work_url is null or (length(work_url) <= 2000 and work_url ~ '^https?://[^[:space:]]+$')),
 additional_notes text check (additional_notes is null or length(trim(additional_notes)) between 1 and 3000),
 status public.contribution_status not null default 'submitted',
 submitted_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id) on delete restrict,
 reviewed_at timestamptz,
 filth_awarded integer not null default 0,
 paid_opportunity boolean not null default false,
 admin_note text check (admin_note is null or length(trim(admin_note)) between 1 and 3000),
 constraint contribution_review_state check (
   (status = 'submitted' and reviewed_by is null and reviewed_at is null)
   or (status <> 'submitted' and reviewed_by is not null and reviewed_at is not null)
 ),
 constraint contribution_award_state check (
   (status = 'accepted' and filth_awarded > 0)
   or (status <> 'accepted' and filth_awarded = 0 and not paid_opportunity)
 )
);
create index contribution_submissions_owner_idx on public.contribution_submissions(user_id, submitted_at desc);
create index contribution_submissions_inbox_idx on public.contribution_submissions(status, submitted_at desc);
create index contribution_submissions_reviewer_idx on public.contribution_submissions(reviewed_by);
alter table public.contribution_submissions enable row level security;
revoke all on public.contribution_submissions from public, anon, authenticated;
-- Owners use a column-safe RPC. Raw rows, including admin_note, are admin-only.
grant select on public.contribution_submissions to authenticated;
create policy "admins read contributions" on public.contribution_submissions for select to authenticated
 using ((select retreat_private.is_retreat_admin()));
create schema if not exists contribution_private;
revoke all on schema contribution_private from public, anon, authenticated;
create function contribution_private.protect_submission()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP = 'DELETE' then raise exception 'contribution_history_is_immutable'; end if;
 if old.status in ('accepted','declined') or
   (to_jsonb(new) - array['status','reviewed_by','reviewed_at','filth_awarded','paid_opportunity','admin_note'])
   is distinct from
   (to_jsonb(old) - array['status','reviewed_by','reviewed_at','filth_awarded','paid_opportunity','admin_note']) then
   raise exception 'contribution_history_is_immutable';
 end if;
 if not ((old.status='submitted' and new.status in ('reviewing','accepted','declined'))
   or (old.status='reviewing' and new.status in ('accepted','declined'))) then
   raise exception 'invalid_contribution_transition';
 end if;
 return new;
end; $$;
revoke all on function contribution_private.protect_submission() from public,anon,authenticated;
create trigger contribution_submissions_protect before update or delete on public.contribution_submissions
 for each row execute function contribution_private.protect_submission();

create function public.submit_contribution(p_category public.contribution_category,p_title text,p_description text,p_work_url text default null,p_additional_notes text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501'; end if;
 insert into public.contribution_submissions(user_id,category,title,description,work_url,additional_notes)
 values(auth.uid(),p_category,trim(p_title),trim(p_description),nullif(trim(p_work_url),''),nullif(trim(p_additional_notes),'')) returning id into result;
 return result;
end; $$;

create function public.admin_mark_contribution_reviewing(p_contribution_id uuid)
returns public.contribution_submissions language plpgsql security definer set search_path='' as $$
declare submission public.contribution_submissions;
begin
 if auth.uid() is null or not retreat_private.is_retreat_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 select * into strict submission from public.contribution_submissions where id=p_contribution_id for update;
 if submission.status='reviewing' then return submission; end if;
 if submission.status <> 'submitted' then raise exception 'invalid_contribution_transition' using errcode='22023'; end if;
 update public.contribution_submissions set status='reviewing',reviewed_by=auth.uid(),reviewed_at=now()
 where id=submission.id returning * into submission;
 return submission;
end; $$;

create function public.admin_accept_contribution(p_contribution_id uuid,p_filth_award integer,p_paid_opportunity boolean,p_admin_note text default null)
returns public.contribution_submissions language plpgsql security definer set search_path='' as $$
declare submission public.contribution_submissions; note text := nullif(trim(p_admin_note),'');
begin
 if auth.uid() is null or not retreat_private.is_retreat_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 if p_filth_award is null or p_filth_award <= 0 or p_paid_opportunity is null or length(note)>3000 then raise exception 'invalid_contribution_review' using errcode='22023'; end if;
 select * into strict submission from public.contribution_submissions where id=p_contribution_id for update;
 if submission.status='accepted' then
   if submission.filth_awarded=p_filth_award and submission.paid_opportunity=p_paid_opportunity and submission.admin_note is not distinct from note then return submission; end if;
   raise exception 'contribution_acceptance_conflict' using errcode='22023';
 end if;
 if submission.status not in ('submitted','reviewing') then raise exception 'invalid_contribution_transition' using errcode='22023'; end if;
 update public.contribution_submissions set status='accepted',reviewed_by=auth.uid(),reviewed_at=now(),
   filth_awarded=p_filth_award,paid_opportunity=p_paid_opportunity,admin_note=note
 where id=submission.id returning * into submission;
 insert into public.inner_sanctum_filth_events(user_id,event_type,points,source_reference,created_by)
 values(submission.user_id,'contribution',p_filth_award,'contribution:'||submission.id,auth.uid());
 perform inner_sanctum_referral_private.evaluate_filth_milestones(submission.user_id);
 return submission;
end; $$;

create function public.admin_decline_contribution(p_contribution_id uuid,p_admin_note text default null)
returns public.contribution_submissions language plpgsql security definer set search_path='' as $$
declare submission public.contribution_submissions; note text := nullif(trim(p_admin_note),'');
begin
 if auth.uid() is null or not retreat_private.is_retreat_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 if length(note)>3000 then raise exception 'invalid_contribution_review' using errcode='22023'; end if;
 select * into strict submission from public.contribution_submissions where id=p_contribution_id for update;
 if submission.status='declined' and submission.admin_note is not distinct from note then return submission; end if;
 if submission.status not in ('submitted','reviewing') then raise exception 'invalid_contribution_transition' using errcode='22023'; end if;
 update public.contribution_submissions set status='declined',reviewed_by=auth.uid(),reviewed_at=now(),admin_note=note
 where id=submission.id returning * into submission;
 return submission;
end; $$;

create function public.get_my_contributions()
returns table(id uuid,category public.contribution_category,title text,description text,work_url text,additional_notes text,status public.contribution_status,submitted_at timestamptz,reviewed_at timestamptz,filth_awarded integer,paid_opportunity boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501'; end if;
 return query select s.id,s.category,s.title,s.description,s.work_url,s.additional_notes,s.status,s.submitted_at,s.reviewed_at,s.filth_awarded,s.paid_opportunity
 from public.contribution_submissions s where s.user_id=auth.uid() order by s.submitted_at desc,s.id;
end; $$;

create function public.admin_get_contributions(p_status public.contribution_status default null,p_id uuid default null)
returns table(id uuid,user_id uuid,category public.contribution_category,title text,description text,work_url text,additional_notes text,status public.contribution_status,submitted_at timestamptz,reviewed_by uuid,reviewed_at timestamptz,filth_awarded integer,paid_opportunity boolean,admin_note text,email text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not retreat_private.is_retreat_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 return query select s.*,u.email::text from public.contribution_submissions s join auth.users u on u.id=s.user_id
 where (p_status is null or s.status=p_status) and (p_id is null or s.id=p_id) order by s.submitted_at desc,s.id;
end; $$;

create function public.get_my_contribution_progress()
returns table(filth_total bigint,accepted_contributions bigint,filth_from_contributions bigint,current_level_number integer,current_level_title text,current_level_threshold integer,next_level_threshold integer,earned_milestones jsonb)
language plpgsql stable security definer set search_path='' as $$
declare total bigint;
begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501'; end if;
 select coalesce(sum(e.points),0) into total from public.inner_sanctum_filth_events e where e.user_id=auth.uid();
 return query select total,
 (select count(*) from public.contribution_submissions s where s.user_id=auth.uid() and s.status='accepted'),
 (select coalesce(sum(e.points),0) from public.inner_sanctum_filth_events e where e.user_id=auth.uid() and e.event_type::text='contribution'),
 l.level_number,l.title,l.threshold,
 (select min(n.threshold) from public.inner_sanctum_filth_levels n where n.status='active' and n.threshold>total),
 (select coalesce(jsonb_agg(jsonb_build_object('title',m.title,'threshold',m.threshold,'earned_at',e.earned_at) order by m.threshold),'[]'::jsonb)
 from public.inner_sanctum_member_filth_milestones e join public.inner_sanctum_filth_milestones m on m.id=e.milestone_id where e.user_id=auth.uid())
 from (select 1) singleton left join lateral
 (select x.level_number,x.title,x.threshold from public.inner_sanctum_filth_levels x where x.status='active' and x.threshold<=total order by x.threshold desc limit 1) l on true;
end; $$;

create function public.get_my_affiliate_impact()
returns table(successful_referrals bigint,filth_from_referrals bigint,recent_activity jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501'; end if;
 return query select
 (select count(*) from public.inner_sanctum_referral_conversions c where c.referrer_user_id=auth.uid()),
 (select coalesce(sum(e.points),0) from public.inner_sanctum_filth_events e where e.user_id=auth.uid() and e.event_type='referral'),
 (select coalesce(jsonb_agg(jsonb_build_object('date',a.converted_at,'filth_awarded',a.points_awarded) order by a.converted_at desc),'[]'::jsonb)
 from (select c.converted_at,c.points_awarded from public.inner_sanctum_referral_conversions c where c.referrer_user_id=auth.uid() order by c.converted_at desc,c.id limit 10) a);
end; $$;

create function public.get_my_affiliate_earnings()
returns table(pending_total numeric,available_total numeric,commission_history jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501'; end if;
 return query select
 (select coalesce(sum(c.commission_amount),0) from public.affiliate_commissions c where c.referrer_user_id=auth.uid() and c.status='pending'),
 (select coalesce(sum(c.commission_amount),0) from public.affiliate_commissions c where c.referrer_user_id=auth.uid() and c.status::text='available'),
 (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'commission_amount',c.commission_amount,'status',c.status,'created_at',c.created_at,'available_at',c.available_at,'matured_at',c.matured_at) order by c.created_at desc,c.id),'[]'::jsonb)
 from public.affiliate_commissions c where c.referrer_user_id=auth.uid());
end; $$;

revoke all on function public.submit_contribution(public.contribution_category,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_contribution(public.contribution_category,text,text,text,text) to authenticated;

revoke all on function public.admin_mark_contribution_reviewing(uuid) from public,anon,authenticated;
grant execute on function public.admin_mark_contribution_reviewing(uuid) to authenticated;

revoke all on function public.admin_accept_contribution(uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.admin_accept_contribution(uuid,integer,boolean,text) to authenticated;

revoke all on function public.admin_decline_contribution(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_decline_contribution(uuid,text) to authenticated;

revoke all on function public.get_my_contributions() from public,anon,authenticated;
grant execute on function public.get_my_contributions() to authenticated;

revoke all on function public.admin_get_contributions(public.contribution_status,uuid) from public,anon,authenticated;
grant execute on function public.admin_get_contributions(public.contribution_status,uuid) to authenticated;

revoke all on function public.get_my_contribution_progress() from public,anon,authenticated;
grant execute on function public.get_my_contribution_progress() to authenticated;

revoke all on function public.get_my_affiliate_impact() from public,anon,authenticated;
grant execute on function public.get_my_affiliate_impact() to authenticated;

revoke all on function public.get_my_affiliate_earnings() from public,anon,authenticated;
grant execute on function public.get_my_affiliate_earnings() to authenticated;
