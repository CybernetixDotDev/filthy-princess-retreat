import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { TEASER_MEDIA_BUCKET, isTeaserMediaPath, validateTeaserImage, validateTeaserImageTarget } from "./teaser-media.ts";

export type TeaserMediaResult = { ok: true; path: string | null; cleanupWarning?: string }
  | { ok: false; error: string; cleanupWarning?: string };

// Called by the server-only wrapper with the caller's session client, never a service key.
export async function changeTeaserImage(client: SupabaseClient<Database>, id: string, slot: number, file: File | null): Promise<TeaserMediaResult> {
  let uploaded: string | null = null;
  const column = `image_${slot}_path` as "image_1_path" | "image_2_path" | "image_3_path";
  const read = async () => {
    const { data, error } = await client.from("teasers").select("image_1_path,image_2_path,image_3_path").eq("id", id).single();
    if (error || !data) throw new Error("Could not read teaser. It may no longer exist.");
    return data[column];
  };
  const cleanup = async (path: string | null): Promise<string | undefined> => {
    if (!path) return;
    try {
      if (!isTeaserMediaPath(path) || !path.startsWith(`${id}/`) || !path.includes(`-polaroid-${slot}.`)) throw new Error("Invalid cleanup path");
      // An uncertain network response may hide a committed update: never delete its image.
      if (await read() === path) throw new Error("Image is still referenced");
      const { data, error } = await client.storage.from(TEASER_MEDIA_BUCKET).remove([path]);
      if (error || !data?.length) throw new Error("Storage cleanup failed");
    } catch {
      return "Image cleanup could not be confirmed. An object may need later cleanup; the database reference was not rolled back.";
    }
  };
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) throw new Error("Sign in as an Admin to manage teaser images.");
    const { data: admin, error: adminError } = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (adminError || !admin) throw new Error("Admin access required.");
    validateTeaserImageTarget(id, slot);
    const oldPath = await read();
    let newPath: string | null = null;
    if (file !== null) {
      const extension = await validateTeaserImage(file);
      newPath = `${id}/${crypto.randomUUID()}-polaroid-${slot}.${extension}`;
      const { error } = await client.storage.from(TEASER_MEDIA_BUCKET).upload(newPath, file, { upsert: false, contentType: file.type });
      if (error) throw new Error("Image upload failed. The teaser reference was not changed.");
      uploaded = newPath;
    }
    // Compare-and-set protects another Admin's concurrent replacement/removal.
    const patch: Partial<Record<typeof column, string | null>> = { [column]: newPath };
    let query = client.from("teasers").update(patch).eq("id", id);
    query = oldPath === null ? query.is(column, null) : query.eq(column, oldPath);
    const { data, error } = await query.select("id").maybeSingle();
    if (error || !data) throw new Error("Image reference update could not be confirmed. Reload the teaser before retrying.");
    uploaded = null;
    return { ok: true, path: newPath, cleanupWarning: await cleanup(oldPath) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Teaser image operation failed.", cleanupWarning: await cleanup(uploaded) };
  }
}
