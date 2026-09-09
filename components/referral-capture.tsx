"use client";
import { useEffect } from "react";
export function ReferralCapture() {
  useEffect(() => { const value = new URLSearchParams(window.location.search).get("ref")?.trim(); if (value && /^[A-Za-z0-9_-]{1,100}$/.test(value)) document.cookie = `retreat_referral=${encodeURIComponent(value)}; Path=/; SameSite=Lax`; }, []);
  return null;
}
