drop policy "members read owned active collectibles or admins read all"
  on public.inner_sanctum_collectibles;

create policy "members read owned active collectibles or admins read all"
  on public.inner_sanctum_collectibles for select to authenticated
  using (
    (select retreat_private.is_retreat_admin())
    or (
      status = 'active'
      and (select public.has_inner_sanctum_access())
      and exists (
        select 1
        from public.inner_sanctum_member_collectibles ownership
        where ownership.collectible_id = inner_sanctum_collectibles.id
          and ownership.user_id = (select auth.uid())
      )
    )
  );
