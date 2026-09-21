-- Exact bearer-slug snapshot only; private means unlisted, not authenticated.
create function public.get_published_teaser_by_slug(p_slug text)
returns table (
  id uuid, slug text, eyebrow text, title text, body text,
  graffiti_lines text[], image_1_path text, image_2_path text, image_3_path text,
  visibility public.teaser_visibility, store_product_id uuid,
  store_product_active boolean, published_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.slug, t.eyebrow, t.title, t.body,
    t.graffiti_lines, t.image_1_path, t.image_2_path, t.image_3_path,
    t.visibility, t.store_product_id,
    coalesce(p.status = 'active'::public.store_product_status, false), t.published_at
  from public.teasers t
  left join public.store_products p on p.id = t.store_product_id
  where p_slug ~ '^[a-f0-9]{48}$'
    and t.slug = p_slug and t.status = 'published'::public.teaser_status;
$$;
revoke all on function public.get_published_teaser_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_published_teaser_by_slug(text) to anon, authenticated;
-- No table grants/policies, mutations, or enumeration endpoints are added.
