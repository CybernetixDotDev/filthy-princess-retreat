import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function hasInnerSanctumAccess() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_inner_sanctum_access");

  if (error) {
    console.error("Inner Sanctum access could not be checked", { code: error.code });
    return false;
  }

  return data === true;
}
