import "server-only";
import type { InnerSanctumVisibleBenefit } from "@/lib/database.types";
import { INNER_SANCTUM_MEDIA_BUCKET } from "@/lib/inner-sanctum-collections";
import { createClient } from "@/lib/supabase/server";

export type SignedBenefit = InnerSanctumVisibleBenefit & { signed_media_url: string | null };

export async function getMyInnerSanctumBenefits({ signMedia = true } = {}): Promise<SignedBenefit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_inner_sanctum_benefits");
  if (error) throw new Error("Your benefits could not be opened.");
  return Promise.all((data ?? []).map(async (benefit) => {
    if (!signMedia || !benefit.media_path) return { ...benefit, signed_media_url: null };
    const { data: signed, error: signingError } = await supabase.storage.from(INNER_SANCTUM_MEDIA_BUCKET).createSignedUrl(benefit.media_path, 300);
    return { ...benefit, signed_media_url: signingError ? null : signed.signedUrl };
  }));
}
