import { safeNextPath } from "@/lib/domain";

// `next=/inner-sanctum` was emitted by generic entrance links. It carries
// no reliable intent. New, intentional returns use returnTo, including the
// protected Inner Sanctum entrance. Other legacy next journeys remain valid.
export function authReturnPath(next?: string | null, returnTo?: string | null) {
  const intentional = safeNextPath(returnTo, "");
  if (intentional) return intentional;
  const legacy = safeNextPath(next, "");
  return legacy === "/inner-sanctum" ? "" : legacy;
}
