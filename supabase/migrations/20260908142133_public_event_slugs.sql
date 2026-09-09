alter table public.retreat_events add column if not exists slug text;
do $$ declare e record; base text; candidate text; n integer; begin for e in select id,title from public.retreat_events where slug is null loop base:=trim(both '-' from regexp_replace(lower(e.title),'[^a-z0-9]+','-','g')); if base='' then base:='event'; end if; candidate:=base; n:=1; while exists(select 1 from public.retreat_events x where x.slug=candidate and x.id<>e.id) loop n:=n+1; candidate:=base||'-'||n; end loop; update public.retreat_events set slug=candidate where id=e.id; end loop; end $$;
alter table public.retreat_events alter column slug set not null;
alter table public.retreat_events add constraint retreat_events_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
create unique index retreat_events_slug_idx on public.retreat_events(slug);
