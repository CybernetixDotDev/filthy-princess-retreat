"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function respondToBenefit(benefitId: string, response: "accepted" | "declined") {
  const id = z.uuid().parse(benefitId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_inner_sanctum_benefit", { p_benefit_id: id, p_response: response });
  if (error) throw new Error("Your response could not be saved.");
  revalidatePath("/inner-sanctum");
  revalidatePath("/inner-sanctum/benefits");
}
