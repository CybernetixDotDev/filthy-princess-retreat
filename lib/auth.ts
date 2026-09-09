import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getAuthState() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false, supabase };
  const { data } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  return { user, isAdmin: Boolean(data), supabase };
}

export async function requireAdmin() {
  const state = await getAuthState();
  if (!state.user) redirect("/signin?next=/admin");
  if (!state.isAdmin) return null;
  return state;
}
