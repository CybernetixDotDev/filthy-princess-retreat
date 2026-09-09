"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const preparationSchema = z.object({
  bookingSlug: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
  preferredContactMethod: z.enum(["whatsapp", "phone", "email"]),
  contactDetail: z.string().trim().min(1).max(200),
  participantNames: z.string().trim().max(1000).optional(),
  arrivalMethod: z.string().trim().max(100).optional(),
  arrivalNotes: z.string().trim().max(1000).optional(),
  dietaryRequirements: z.string().trim().max(1000).optional(),
  accessibilityRequirements: z.string().trim().max(1000).optional(),
  callyNotes: z.string().trim().max(1000).optional(),
});

export type PreparationState = { success?: boolean; error?: string };

export async function savePublicBookingPreparation(_: PreparationState, formData: FormData): Promise<PreparationState> {
  const parsed = preparationSchema.safeParse({
    bookingSlug: formData.get("booking_slug"),
    preferredContactMethod: formData.get("preferred_contact_method"),
    contactDetail: formData.get("contact_detail"),
    participantNames: formData.get("participant_names"),
    arrivalMethod: formData.get("arrival_method"),
    arrivalNotes: formData.get("arrival_notes"),
    dietaryRequirements: formData.get("dietary_requirements"),
    accessibilityRequirements: formData.get("accessibility_requirements"),
    callyNotes: formData.get("cally_notes"),
  });
  if (!parsed.success) return { error: "Please check the highlighted details and try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_public_booking_preparation", {
    p_booking_slug: parsed.data.bookingSlug,
    p_preferred_contact_method: parsed.data.preferredContactMethod,
    p_contact_detail: parsed.data.contactDetail,
    p_participant_names: parsed.data.participantNames || null,
    p_arrival_method: parsed.data.arrivalMethod || null,
    p_arrival_notes: parsed.data.arrivalNotes || null,
    p_dietary_requirements: parsed.data.dietaryRequirements || null,
    p_accessibility_requirements: parsed.data.accessibilityRequirements || null,
    p_cally_notes: parsed.data.callyNotes || null,
  });
  if (error) return { error: "We couldn't save those details. Please try again." };
  revalidatePath(`/booking/${parsed.data.bookingSlug}`);
  revalidatePath(`/booking/${parsed.data.bookingSlug}/prepare`);
  return { success: true };
}
