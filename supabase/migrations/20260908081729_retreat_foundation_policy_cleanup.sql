drop policy if exists "published products are public" on public.retreat_products;
drop policy if exists "admins read all products" on public.retreat_products;
create policy "published products are public" on public.retreat_products
  for select to anon using (is_published);
create policy "admins read products" on public.retreat_products
  for select to authenticated
  using (is_published or (select retreat_private.is_retreat_admin()));

drop policy if exists "published events are public" on public.retreat_events;
drop policy if exists "admins read all events" on public.retreat_events;
create policy "published events are public" on public.retreat_events
  for select to anon using (status in ('published', 'full', 'completed'));
create policy "admins read events" on public.retreat_events
  for select to authenticated
  using (status in ('published', 'full', 'completed') or (select retreat_private.is_retreat_admin()));
