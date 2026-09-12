create type public.inner_sanctum_referral_status as enum ('active', 'disabled');
create type public.inner_sanctum_referral_conversion_source as enum ('payfast', 'admin_test');
create type public.inner_sanctum_filth_event_type as enum ('referral', 'admin', 'task', 'experience', 'special');
create type public.inner_sanctum_filth_level_status as enum ('active', 'inactive');
create type public.inner_sanctum_filth_reward_type as enum ('collectible', 'benefit', 'experience', 'retreat', 'manual');

create table public.inner_sanctum_referrals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
 code text not null unique, status public.inner_sanctum_referral_status not null default 'active',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint inner_sanctum_referrals_code check (code ~ '^[A-Za-z0-9_-]{16,100}$')
);
create table public.store_order_referrals (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.store_orders(id) on delete restrict,
 referral_id uuid not null references public.inner_sanctum_referrals(id) on delete restrict,
 referrer_user_id uuid not null references auth.users(id) on delete restrict,
 attributed_at timestamptz not null default now(), converted_at timestamptz, conversion_id uuid, created_at timestamptz not null default now()
);
create table public.inner_sanctum_filth_settings (
 id boolean primary key default true check (id), referral_points integer not null default 1 check (referral_points > 0), updated_at timestamptz not null default now()
);
create table public.inner_sanctum_filth_levels (
 id uuid primary key default gen_random_uuid(), level_number integer not null unique check (level_number > 0), title text not null,
 threshold integer not null unique check (threshold >= 0), status public.inner_sanctum_filth_level_status not null default 'active',
 sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.inner_sanctum_filth_milestones (
 id uuid primary key default gen_random_uuid(), level_id uuid references public.inner_sanctum_filth_levels(id) on delete set null,
 threshold integer not null check (threshold > 0), title text not null, reward_type public.inner_sanctum_filth_reward_type not null default 'manual',
 reward_reference text, status public.inner_sanctum_filth_level_status not null default 'active', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint inner_sanctum_filth_milestones_threshold_title unique (threshold, title)
);
create table public.inner_sanctum_member_filth_milestones (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 milestone_id uuid not null references public.inner_sanctum_filth_milestones(id) on delete restrict,
 earned_at timestamptz not null default now(), fulfilled_at timestamptz, fulfillment_reference text,
 constraint inner_sanctum_member_filth_milestones_unique unique (user_id, milestone_id)
);
create table public.inner_sanctum_referral_conversions (
 id uuid primary key default gen_random_uuid(), referral_id uuid not null references public.inner_sanctum_referrals(id) on delete restrict,
 referrer_user_id uuid not null references auth.users(id) on delete restrict, referred_user_id uuid not null unique references auth.users(id) on delete restrict,
 order_id uuid not null unique references public.store_orders(id) on delete restrict, order_reference text not null,
 points_awarded integer not null check (points_awarded > 0), conversion_source public.inner_sanctum_referral_conversion_source not null,
 converted_at timestamptz not null default now(), created_at timestamptz not null default now(),
 constraint inner_sanctum_referral_conversions_not_self check (referrer_user_id <> referred_user_id)
);
alter table public.store_order_referrals add constraint store_order_referrals_conversion_fk foreign key (conversion_id) references public.inner_sanctum_referral_conversions(id) on delete restrict;
create table public.inner_sanctum_filth_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 event_type public.inner_sanctum_filth_event_type not null, points integer not null check (points <> 0),
 source_reference text not null unique, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);

create schema if not exists inner_sanctum_referral_private;
revoke all on schema inner_sanctum_referral_private from public, anon, authenticated;
create function inner_sanctum_referral_private.set_updated_at() returns trigger language plpgsql security invoker set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
revoke all on function inner_sanctum_referral_private.set_updated_at() from public,anon,authenticated;
create trigger inner_sanctum_referrals_updated_at before update on public.inner_sanctum_referrals for each row execute function inner_sanctum_referral_private.set_updated_at();
create trigger inner_sanctum_filth_levels_updated_at before update on public.inner_sanctum_filth_levels for each row execute function inner_sanctum_referral_private.set_updated_at();
create trigger inner_sanctum_filth_milestones_updated_at before update on public.inner_sanctum_filth_milestones for each row execute function inner_sanctum_referral_private.set_updated_at();

alter table public.inner_sanctum_referrals enable row level security;
alter table public.store_order_referrals enable row level security;
alter table public.inner_sanctum_referral_conversions enable row level security;
alter table public.inner_sanctum_filth_settings enable row level security;
alter table public.inner_sanctum_filth_events enable row level security;
alter table public.inner_sanctum_filth_levels enable row level security;
alter table public.inner_sanctum_filth_milestones enable row level security;
alter table public.inner_sanctum_member_filth_milestones enable row level security;
revoke all on table public.inner_sanctum_referrals,public.store_order_referrals,public.inner_sanctum_referral_conversions,public.inner_sanctum_filth_settings,public.inner_sanctum_filth_events,public.inner_sanctum_filth_levels,public.inner_sanctum_filth_milestones,public.inner_sanctum_member_filth_milestones from anon,authenticated;
grant select,update on public.inner_sanctum_referrals to authenticated;
grant select on public.store_order_referrals,public.inner_sanctum_referral_conversions,public.inner_sanctum_filth_settings,public.inner_sanctum_filth_events,public.inner_sanctum_filth_levels,public.inner_sanctum_filth_milestones,public.inner_sanctum_member_filth_milestones to authenticated;
grant insert,update on public.inner_sanctum_filth_levels,public.inner_sanctum_filth_milestones to authenticated;

create policy "own referrals or admins" on public.inner_sanctum_referrals for select to authenticated using (user_id=(select auth.uid()) or (select retreat_private.is_retreat_admin()));
create policy "admins update referrals" on public.inner_sanctum_referrals for update to authenticated using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));
create policy "admins read order referrals" on public.store_order_referrals for select to authenticated using ((select retreat_private.is_retreat_admin()));
create policy "admins read conversions" on public.inner_sanctum_referral_conversions for select to authenticated using ((select retreat_private.is_retreat_admin()));
create policy "own filth events or admins" on public.inner_sanctum_filth_events for select to authenticated using (user_id=(select auth.uid()) or (select retreat_private.is_retreat_admin()));
create policy "admins read settings" on public.inner_sanctum_filth_settings for select to authenticated using ((select retreat_private.is_retreat_admin()));
create policy "admins manage levels" on public.inner_sanctum_filth_levels for all to authenticated using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));
create policy "admins manage milestones" on public.inner_sanctum_filth_milestones for all to authenticated using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));
create policy "own earned milestones or admins" on public.inner_sanctum_member_filth_milestones for select to authenticated using (user_id=(select auth.uid()) or (select retreat_private.is_retreat_admin()));

create function public.is_valid_inner_sanctum_referral_code(p_code text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.inner_sanctum_referrals r join public.inner_sanctum_memberships m on m.user_id=r.user_id where r.code=p_code and r.status='active' and m.status='active' and (m.expires_at is null or m.expires_at>now()));
$$;
revoke all on function public.is_valid_inner_sanctum_referral_code(text) from public,anon,authenticated; grant execute on function public.is_valid_inner_sanctum_referral_code(text) to anon,authenticated;

create function inner_sanctum_referral_private.evaluate_filth_milestones(p_user_id uuid) returns void language sql security definer set search_path='' as $$
 insert into public.inner_sanctum_member_filth_milestones(user_id,milestone_id)
 select p_user_id,m.id from public.inner_sanctum_filth_milestones m
 where m.status='active' and m.threshold <= coalesce((select sum(e.points) from public.inner_sanctum_filth_events e where e.user_id=p_user_id),0)
 on conflict(user_id,milestone_id) do nothing;
$$;
revoke all on function inner_sanctum_referral_private.evaluate_filth_milestones(uuid) from public,anon,authenticated;

create function inner_sanctum_referral_private.record_successful_referral_conversion(p_order_id uuid,p_referred_user_id uuid,p_conversion_source public.inner_sanctum_referral_conversion_source,p_created_by uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare attribution public.store_order_referrals; referral public.inner_sanctum_referrals; order_row public.store_orders; points integer; conversion_id uuid;
begin
 select * into order_row from public.store_orders where id=p_order_id for update;
 if order_row.id is null or not exists(select 1 from public.store_order_items i where i.order_id=order_row.id and i.fulfillment_type='inner_sanctum_membership' and i.fulfillment_reference='lifetime') then raise exception 'ineligible_order' using errcode='22023'; end if;
 select * into attribution from public.store_order_referrals where order_id=order_row.id for update;
 if attribution.id is null then raise exception 'referral_attribution_required' using errcode='22023'; end if;
 select * into referral from public.inner_sanctum_referrals where id=attribution.referral_id;
 if referral.id is null then raise exception 'referral_not_found' using errcode='22023'; end if;
 if referral.user_id=p_referred_user_id then raise exception 'self_referral' using errcode='22023'; end if;
 if not exists(select 1 from auth.users where id=p_referred_user_id) then raise exception 'referred_user_not_found' using errcode='22023'; end if;
 select id into conversion_id from public.inner_sanctum_referral_conversions where order_id=order_row.id;
 if conversion_id is not null then return conversion_id; end if;
 select referral_points into points from public.inner_sanctum_filth_settings where id=true;
 insert into public.inner_sanctum_referral_conversions(referral_id,referrer_user_id,referred_user_id,order_id,order_reference,points_awarded,conversion_source)
 values(referral.id,referral.user_id,p_referred_user_id,order_row.id,order_row.order_reference,points,p_conversion_source) returning id into conversion_id;
 insert into public.inner_sanctum_filth_events(user_id,event_type,points,source_reference,created_by) values(referral.user_id,'referral',points,'referral-conversion:'||conversion_id,p_created_by);
 update public.store_order_referrals set converted_at=now(),conversion_id=conversion_id where id=attribution.id;
 perform inner_sanctum_referral_private.evaluate_filth_milestones(referral.user_id);
 return conversion_id;
end;
$$;
revoke all on function inner_sanctum_referral_private.record_successful_referral_conversion(uuid,uuid,public.inner_sanctum_referral_conversion_source,uuid) from public,anon,authenticated;

create function public.admin_record_test_referral_conversion(p_order_id uuid,p_referred_user_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'admin_required' using errcode='42501'; end if;
 return inner_sanctum_referral_private.record_successful_referral_conversion(p_order_id,p_referred_user_id,'admin_test',auth.uid()); end;
$$;
revoke all on function public.admin_record_test_referral_conversion(uuid,uuid) from public,anon,authenticated; grant execute on function public.admin_record_test_referral_conversion(uuid,uuid) to authenticated;

create function public.admin_add_filth_points(p_user_id uuid,p_points integer,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'admin_required' using errcode='42501'; end if;
 if p_points=0 or length(trim(p_reason)) not between 3 and 500 then raise exception 'invalid_filth_adjustment' using errcode='22023'; end if;
 insert into public.inner_sanctum_filth_events(user_id,event_type,points,source_reference,created_by) values(p_user_id,'admin',p_points,'admin:'||gen_random_uuid()||':'||trim(p_reason),auth.uid()) returning id into event_id;
 perform inner_sanctum_referral_private.evaluate_filth_milestones(p_user_id); return event_id; end;
$$;
revoke all on function public.admin_add_filth_points(uuid,integer,text) from public,anon,authenticated; grant execute on function public.admin_add_filth_points(uuid,integer,text) to authenticated;

create function public.get_my_filth_meter() returns table(referral_code text,filth_total bigint,successful_referrals bigint,current_level_number integer,current_level_title text,current_level_threshold integer,next_level_threshold integer,earned_milestones jsonb) language plpgsql security definer set search_path='' as $$
declare code_value text; total bigint;
begin
 if auth.uid() is null or not (select public.has_inner_sanctum_access()) then raise exception 'inner_sanctum_access_required' using errcode='42501'; end if;
 select code into code_value from public.inner_sanctum_referrals where user_id=auth.uid();
 if code_value is null then loop code_value:=encode(extensions.gen_random_bytes(12),'hex'); begin insert into public.inner_sanctum_referrals(user_id,code) values(auth.uid(),code_value); exit; exception when unique_violation then end; end loop; end if;
 select coalesce(sum(points),0) into total from public.inner_sanctum_filth_events where user_id=auth.uid();
 return query select code_value,total,
  (select count(*) from public.inner_sanctum_referral_conversions c where c.referrer_user_id=auth.uid()),
  (select l.level_number from public.inner_sanctum_filth_levels l where l.status='active' and l.threshold<=total order by l.threshold desc limit 1),
  (select l.title from public.inner_sanctum_filth_levels l where l.status='active' and l.threshold<=total order by l.threshold desc limit 1),
  (select l.threshold from public.inner_sanctum_filth_levels l where l.status='active' and l.threshold<=total order by l.threshold desc limit 1),
  (select l.threshold from public.inner_sanctum_filth_levels l where l.status='active' and l.threshold>total order by l.threshold limit 1),
  (select coalesce(jsonb_agg(jsonb_build_object('title',m.title,'threshold',m.threshold,'earned_at',earned.earned_at) order by m.threshold),'[]'::jsonb) from public.inner_sanctum_member_filth_milestones earned join public.inner_sanctum_filth_milestones m on m.id=earned.milestone_id where earned.user_id=auth.uid());
end;
$$;
revoke all on function public.get_my_filth_meter() from public,anon,authenticated; grant execute on function public.get_my_filth_meter() to authenticated;

drop function public.create_public_store_order(uuid,text,uuid);
create function public.create_public_store_order(p_product_id uuid,p_buyer_email text,p_request_key uuid,p_referral_code text default null)
returns table(order_reference text,order_status public.store_order_status,currency text,total_amount numeric)
language plpgsql security definer set search_path='' as $$
declare selected_product public.store_products; existing_order public.store_orders; new_order public.store_orders; normalized_email text:=lower(trim(p_buyer_email)); candidate_reference text;
begin
 if p_product_id is null or p_request_key is null or length(normalized_email) not between 3 and 320 or position('@' in normalized_email)<=1 then raise exception 'invalid_store_order_request' using errcode='22023'; end if;
 select * into existing_order from public.store_orders where request_key=p_request_key;
 if existing_order.id is not null then
  if existing_order.buyer_email is distinct from normalized_email then raise exception 'store_order_request_conflict' using errcode='23505'; end if;
  return query select existing_order.order_reference,existing_order.status,existing_order.currency,existing_order.total_amount; return;
 end if;
 select * into selected_product from public.store_products where id=p_product_id and status='active';
 if selected_product.id is null then raise exception 'store_product_unavailable' using errcode='P0002'; end if;
 loop candidate_reference:='FP-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,8))||'-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),9,8))||'-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),17,8)); exit when not exists(select 1 from public.store_orders o where o.order_reference=candidate_reference); end loop;
 insert into public.store_orders(order_reference,request_key,user_id,buyer_email,status,currency,subtotal_amount,total_amount)
 values(candidate_reference,p_request_key,auth.uid(),normalized_email,'pending',selected_product.currency,selected_product.price_amount,selected_product.price_amount) returning * into new_order;
 insert into public.store_order_items(order_id,product_id,product_name,product_slug,product_type,unit_price_amount,currency,quantity,line_total_amount,fulfillment_type,fulfillment_reference)
 values(new_order.id,selected_product.id,selected_product.name,selected_product.slug,selected_product.product_type,selected_product.price_amount,selected_product.currency,1,selected_product.price_amount,selected_product.fulfillment_type,selected_product.fulfillment_reference);
 if p_referral_code is not null then
  insert into public.store_order_referrals(order_id,referral_id,referrer_user_id)
  select new_order.id,r.id,r.user_id from public.inner_sanctum_referrals r join public.inner_sanctum_memberships m on m.user_id=r.user_id
  where r.code=p_referral_code and r.status='active' and m.status='active' and (m.expires_at is null or m.expires_at>now()) on conflict(order_id) do nothing;
 end if;
 return query select new_order.order_reference,new_order.status,new_order.currency,new_order.total_amount;
end;
$$;
revoke all on function public.create_public_store_order(uuid,text,uuid,text) from public,anon,authenticated; grant execute on function public.create_public_store_order(uuid,text,uuid,text) to anon,authenticated;

insert into public.inner_sanctum_filth_settings(id,referral_points) values(true,1) on conflict(id) do nothing;
insert into public.inner_sanctum_filth_levels(level_number,title,threshold,status,sort_order) values
(1,'Level 1',10,'active',10),(2,'Level 2',50,'active',20),(3,'Level 3',100,'active',30) on conflict(level_number) do nothing;
insert into public.inner_sanctum_filth_milestones(level_id,threshold,title,reward_type,status,sort_order)
select level.id,seed.threshold,seed.title,'manual','active',seed.sort_order
from public.inner_sanctum_filth_levels level cross join (values
(2,'A little something',2),(4,'Getting interesting',4),(6,'Deeper',6),(8,'Almost there',8),(10,'You filled it',10)
) seed(threshold,title,sort_order) where level.level_number=1 on conflict(threshold,title) do nothing;
