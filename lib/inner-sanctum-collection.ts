import "server-only";
import type { InnerSanctumOwnedCollectible } from "@/lib/database.types";
import { INNER_SANCTUM_MEDIA_BUCKET } from "@/lib/inner-sanctum-collections";
import { createClient } from "@/lib/supabase/server";

export type SignedCollectible = InnerSanctumOwnedCollectible & { signed_media_url: string | null };

export async function getMyInnerSanctumCollection({ limit, signMedia = true }: { limit?: number; signMedia?: boolean } = {}): Promise<SignedCollectible[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_inner_sanctum_collection");
  if (error) throw new Error("Your collection could not be opened.");

  const collection = typeof limit === "number" ? (data ?? []).slice(0, limit) : (data ?? []);
  return Promise.all(collection.map(async (collectible) => {
    if (!signMedia || !collectible.media_path) return { ...collectible, signed_media_url: null };
    const { data: signed, error: signingError } = await supabase.storage
      .from(INNER_SANCTUM_MEDIA_BUCKET)
      .createSignedUrl(collectible.media_path, 300);
    return { ...collectible, signed_media_url: signingError ? null : signed.signedUrl };
  }));
}
