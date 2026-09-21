import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authenticatedDestination } from "@/lib/auth-destination";
import { authReturnPath } from "@/lib/auth-return";

export async function GET(request: NextRequest) {
  let next = authReturnPath(request.nextUrl.searchParams.get("next"), request.nextUrl.searchParams.get("returnTo"));
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.searchParams.has("error")) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        next = await authenticatedDestination(next);
        return NextResponse.redirect(new URL(next, request.url), { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
      }
    } catch {
      // A failed or expired exchange must return to the existing sign-in flow.
    }
  }
  return NextResponse.redirect(new URL(`/signin?authError=callback&returnTo=${encodeURIComponent(next)}`, request.url), { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
