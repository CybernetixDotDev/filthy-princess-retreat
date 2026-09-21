import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/domain";

export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/inner-sanctum");
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.searchParams.has("error")) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, request.url), { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
    } catch {
      // A failed or expired exchange must return to the existing sign-in flow.
    }
  }
  return NextResponse.redirect(new URL(`/signin?authError=callback&next=${encodeURIComponent(next)}`, request.url), { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
