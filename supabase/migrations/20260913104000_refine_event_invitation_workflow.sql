drop function if exists public.admin_create_retreat_event_invitation(uuid);

create or replace function public.admin_create_retreat_event_invitation(
  p_interest_id uuid,
  p_personal_note text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  interest_row public.retreat_event_interests%rowtype;
  event_row public.retreat_events%rowtype;
  benefit_id uuid;
  invitation_body text;
begin
  if admin_id is null or not (select retreat_private.is_retreat_admin()) then
    raise exception 'Not authorized';
  end if;
  if p_personal_note is not null and char_length(trim(p_personal_note)) > 2000 then
    raise exception 'Personal note is too long';
  end if;

  select * into interest_row
  from public.retreat_event_interests
  where id = p_interest_id
  for update;
  if interest_row.id is null or interest_row.status <> 'selected' then
    raise exception 'Only selected interests can receive an invitation';
  end if;

  select * into event_row
  from public.retreat_events
  where id = interest_row.retreat_event_id;
  if event_row.id is null
    or event_row.status <> 'published'
    or event_row.start_date < current_date
    or not event_row.invitation_only then
    raise exception 'This event is not available for invitations';
  end if;

  select id into benefit_id
  from public.inner_sanctum_benefits
  where retreat_event_id = interest_row.retreat_event_id
    and user_id = interest_row.user_id
    and type in ('invitation', 'event', 'retreat')
  limit 1;
  if benefit_id is not null then return benefit_id; end if;

  invitation_body := 'Cally would love you to join her for ' || event_row.title || '.'
    || E'\n\n' || 'Dates: ' || event_row.start_date::text || ' to ' || event_row.end_date::text || '.'
    || E'\n\n' || 'Your invitation is personal. Let Cally know whether you''d like to come.';
  if nullif(trim(p_personal_note), '') is not null then
    invitation_body := invitation_body || E'\n\n' || trim(p_personal_note);
  end if;

  insert into public.inner_sanctum_benefits (
    user_id, type, eyebrow, title, body, cta_label, cta_href, status,
    available_from, expires_at, retreat_event_id, created_by
  ) values (
    interest_row.user_id,
    'invitation',
    'A personal invitation',
    'You''re invited.',
    invitation_body,
    'Respond to this invitation',
    '/inner-sanctum/benefits',
    'available',
    now(),
    null,
    event_row.id,
    admin_id
  ) returning id into benefit_id;
  return benefit_id;
end;
$$;

revoke all on function public.admin_create_retreat_event_invitation(uuid, text) from public, anon;
grant execute on function public.admin_create_retreat_event_invitation(uuid, text) to authenticated;
