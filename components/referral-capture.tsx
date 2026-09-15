"use client";
import { useEffect } from "react";
export function ReferralCapture() {
  useEffect(() => { const value = new URLSearchParams(window.location.search).get("ref")?.trim(); const hasExisting = document.cookie.split(";").some((cookie) => cookie.trim().startsWith("inner_sanctum_referral=") || cookie.trim().startsWith("retreat_referral=")); if (value && !hasExisting && /^[A-Za-z0-9_-]{1,100}$/.test(value)) { const encoded = encodeURIComponent(value); document.cookie = `retreat_referral=${encoded}; Path=/; SameSite=Lax`; document.cookie = `inner_sanctum_referral=${encoded}; Path=/; SameSite=Lax`; } }, []);
  return null;
}
