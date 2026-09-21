import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function requireContributorAuth(next: "/contributor" | "/contributor/submit") {
 const supabase = await createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) redirect(`/signin?next=${encodeURIComponent(next)}`);
 return { user, supabase };
}
