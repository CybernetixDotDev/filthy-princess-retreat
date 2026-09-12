alter table public.inner_sanctum_posts
  drop constraint inner_sanctum_posts_cta_pair,
  add constraint inner_sanctum_posts_cta_pair check (
    (cta_label is null and cta_href is null)
    or (
      cta_label is not null
      and cta_href is not null
      and length(trim(cta_label)) between 1 and 100
    )
  );
