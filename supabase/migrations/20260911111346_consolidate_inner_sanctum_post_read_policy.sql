drop policy "active members read visible Sanctum posts" on public.inner_sanctum_posts;
drop policy "admins read all Sanctum posts" on public.inner_sanctum_posts;

create policy "admins or active members read permitted Sanctum posts"
  on public.inner_sanctum_posts for select to authenticated
  using (
    (select retreat_private.is_retreat_admin())
    or (
      (select public.has_inner_sanctum_access())
      and status = 'published'
      and (published_at is null or published_at <= now())
      and (expires_at is null or expires_at > now())
    )
  );
