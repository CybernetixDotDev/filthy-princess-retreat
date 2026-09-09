"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/domain";

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
  const next = safeNextPath(String(formData.get("next") ?? ""), "/home");
  if (!parsed.success) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "The email or password is incorrect." };
  redirect(next);
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirm_password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""), "/home");
  if (password !== confirmation) return { error: "Passwords do not match." };
  const parsed = signUpSchema.safeParse({ email: formData.get("email"), password });
  if (!parsed.success) return { error: `Enter a valid email and a password of at least ${MIN_PASSWORD_LENGTH} characters.` };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    if (/already registered|already exists/i.test(error.message)) return { error: "That email already has an account. Sign in instead." };
    if (/signup is disabled|signups not allowed|signups are disabled/i.test(error.message)) return { error: "New account registration is currently unavailable." };
    return { error: "We couldn't create that account. Check the details and try again." };
  }

  if (data.session) redirect(next);
  return {
    message: "Your account has been created. Check your email to confirm your address, then return here to sign in.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/home");
}
