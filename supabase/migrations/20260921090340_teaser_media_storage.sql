-- Cell 2: public promotional images, independent of teaser publication state.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teaser-media', 'teaser-media', true, 20971520,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Extend Cell 1's WebP-only validation without changing existing references.
create or replace function teaser_private.valid_image_path(path text, teaser_id uuid, slot integer)
returns boolean language sql immutable strict set search_path = '' as $$
  select slot between 1 and 3 and length(path) <= 150 and path ~ (
    '^' || teaser_id::text || '/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-polaroid-' || slot::text || '\.(jpg|jpeg|png|webp)$');
$$;

create policy "admins upload teaser media" on storage.objects for insert to authenticated
with check (
  bucket_id = 'teaser-media' and (select retreat_private.is_retreat_admin())
  and exists (select 1 from public.teasers t where
    teaser_private.valid_image_path(name, t.id, 1)
    or teaser_private.valid_image_path(name, t.id, 2)
    or teaser_private.valid_image_path(name, t.id, 3))
);
create policy "admins delete teaser media" on storage.objects for delete to authenticated
using (bucket_id = 'teaser-media' and (select retreat_private.is_retreat_admin()));
-- Storage deletion needs SELECT visibility; do not permit bucket listing.
create policy "admins see teaser media for deletion" on storage.objects for select to authenticated
using (bucket_id = 'teaser-media' and (select retreat_private.is_retreat_admin())
  and storage.allow_any_operation(array['object.delete', 'object.delete_many']));
-- No UPDATE policy: replacement always uploads a new object with upsert:false.
