import "server-only";
import { createClient } from "@/lib/supabase/server";
import { changeTeaserImage } from "./teaser-media-operations";

// Private primitives for future Admin handlers; no upload route/action is exposed yet.
export async function uploadTeaserImage(teaserId: string, slot: number, file: File) {
  if (!file) throw new Error("Choose an image to upload.");
  return changeTeaserImage(await createClient(), teaserId, slot, file);
}

export async function removeTeaserImage(teaserId: string, slot: number) {
  return changeTeaserImage(await createClient(), teaserId, slot, null);
}
