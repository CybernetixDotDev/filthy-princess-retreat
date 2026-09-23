import "server-only";
import type { FilthProgression, InnerSanctumFilthEventClass, InnerSanctumFilthEventRow } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type FilthActivity = Pick<InnerSanctumFilthEventRow, "id" | "event_type" | "event_class" | "points" | "created_at"> & { reason: string };

function activityReason(eventType: InnerSanctumFilthEventRow["event_type"], eventClass: InnerSanctumFilthEventClass) {
  if (eventClass === "redemption") return "You used some of your Filth";
  if (eventClass === "earning_correction") return "A Filth correction was made";
  if (eventType === "contribution") return "Cally loved your contribution";
  if (eventType === "referral") return "Someone followed your invitation inside";
  if (eventType === "admin") return "A little Filth from Cally";
  return "You left your mark on Filthy Princess";
}

export async function getMyFilthPageState() {
  const supabase = await createClient();
  const [{ data: progression, error: progressionError }, { data: events, error: eventsError }, { data: milestones, error: milestonesError }, { data: affiliate, error: affiliateError }] = await Promise.all([
    supabase.rpc("get_my_filth_progression"),
    supabase.from("inner_sanctum_filth_events").select("id,event_type,event_class,points,created_at").order("created_at", { ascending: false }).limit(5),
    supabase.rpc("get_my_filth_milestones"),
    supabase.rpc("get_my_affiliate_state"),
  ]);
  if (progressionError || eventsError || milestonesError || affiliateError || !progression?.[0]) throw new Error("Your Filth could not be opened.");

  const activityRows = (events ?? []) as Pick<InnerSanctumFilthEventRow, "id" | "event_type" | "event_class" | "points" | "created_at">[];
  return {
    progression: progression[0] as FilthProgression,
    activity: activityRows.map((event) => ({ ...event, reason: activityReason(event.event_type, event.event_class) })),
    milestones: (milestones ?? []).map((milestone) => ({ ...milestone, completed: Boolean(milestone.earned_at) })),
    affiliate: affiliate?.[0] ?? null,
  };
}
