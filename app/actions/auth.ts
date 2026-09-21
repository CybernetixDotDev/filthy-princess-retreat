"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authenticatedDestination } from "@/lib/auth-destination";
import { hasEmailIdentity } from "@/lib/account-identity";
import { authReturnPath } from "@/lib/auth-return";

export type AuthState = { error?: string; message?: string };
const MIN_PASSWORD_LENGTH = 6;

const signInSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(1),
});

const signUpSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const next = authReturnPath(String(formData.get("next") ?? ""), String(formData.get("returnTo") ?? ""));
  if (!parsed.success) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error?.code === "email_not_confirmed") return { error: "Please confirm your email address before signing in. Check your inbox for the confirmation email." };
  if (error) return { error: "The email or password is incorrect." };
  redirect(await authenticatedDestination(next));
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirm_password") ?? "");
  const next = authReturnPath(String(formData.get("next") ?? ""), String(formData.get("returnTo") ?? ""));
  if (password !== confirmation) return { error: "Passwords do not match." };
  const parsed = signUpSchema.safeParse({ email: formData.get("email"), password });
  if (!parsed.success) return { error: `Enter a valid email and a password of at least ${MIN_PASSWORD_LENGTH} characters.` };

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: {
    emailRedirectTo: `${origin}/auth/callback?returnTo=${encodeURIComponent(next)}`,
  } });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) return { error: "That email already has an account. Sign in instead." };
    if (/signup is disabled|signups not allowed|signups are disabled/i.test(error.message)) return { error: "New account registration is currently unavailable." };
    return { error: "We couldn't create that account. Check the details and try again." };
  }

  if (data.session) redirect(await authenticatedDestination(next));
  return {
    message: "Check your email to confirm your address. The confirmation link will return you to where you left off; sign in there if prompted.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signInWithGoogle(_: AuthState, formData: FormData): Promise<AuthState> {
  const next = authReturnPath(String(formData.get("next") ?? ""), String(formData.get("returnTo") ?? ""));
  let destination: string;
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("returnTo", next);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google", options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) return { error: "Google sign-in could not be started. Try again or sign in with email." };
    destination = data.url;
  } catch {
    return { error: "Google sign-in is unavailable right now. Try again or sign in with email." };
  }
  redirect(destination);
}

export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.email().trim().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("returnTo", "/update-password");
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: callback.toString() });
    if (error) return { error: "We couldn't request a recovery email right now. Please try again shortly." };
    return { message: "If an account is available for recovery, you'll receive an email. Open the link in this browser to choose a new password." };
  } catch {
    return { error: "We couldn't request a recovery email right now. Please try again shortly." };
  }
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm_password") ?? "")) return { error: "Passwords do not match." };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "Your session has expired. Sign in again or request a new recovery email." };
    if (!hasEmailIdentity(user)) return { error: "Password changes are not available for this account. Continue with your linked sign-in provider." };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: "Your password could not be changed. Try a different password, or request a new recovery email from Sign In." };
    return { message: "Your password has been updated." };
  } catch {
    return { error: "Your password could not be changed right now. Please try again shortly." };
  }
}
