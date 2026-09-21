import type { User } from "@supabase/supabase-js";

export function linkedProviders(user: Pick<User, "identities" | "app_metadata">) {
  return [...new Set([
    ...(user.identities ?? []).map((identity) => identity.provider),
    ...(user.app_metadata.providers ?? []),
  ])];
}

export function hasEmailIdentity(user: Pick<User, "identities">) {
  return user.identities?.some((identity) => identity.provider === "email") === true;
}

// Provider metadata alone does not prove a password exists (email can use OTP).
// Only show ordinary account password controls with verified password-session evidence.
export function canChangeAccountPassword(user: Pick<User, "identities">, amr: unknown) {
  return hasEmailIdentity(user) && Array.isArray(amr) && amr.some((entry) =>
    entry === "password" || (entry && typeof entry === "object" && entry.method === "password"));
}
