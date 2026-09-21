"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authenticatedDestination } from "@/lib/auth-destination";
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
