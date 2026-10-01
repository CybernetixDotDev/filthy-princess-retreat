"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authenticatedDestination } from "@/lib/auth-destination";
import { hasEmailIdentity } from "@/lib/account-identity";
import { authReturnPath } from "@/lib/auth-return";

export type AuthState = { error?: string; message?: string; accountExists?: boolean };
const MIN_PASSWORD_LENGTH = 6;

const signInSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(1),
});

const signUpSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});
const secureAccountPasswordSchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH),
  confirmation: z.string(),
}).refine((value) => value.password === value.confirmation);

export async function requestAnonymousAccountEmail(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.email().trim().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Your session has expired. Return to your order and try again." };
  if (user.is_anonymous !== true) return { error: "This account is already secured. Continue to your account." };

  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const redirectTo = new URL("/you", origin);
  redirectTo.searchParams.set("secure", "password");
  const { data, error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: redirectTo.toString() },
  );
  if (error) {
    if (["email_exists", "user_already_exists", "identity_already_exists", "email_conflict_identity_not_deletable"].includes(error.code ?? "")) {
      return { error: "An account already exists for that email. Use its sign-in or password recovery; this purchase stays with its current identity.", accountExists: true };
    }
    return { error: "We couldn't send a verification link. Check the address and try again." };
  }
  if (!data.user || data.user.id !== user.id) {
    return { error: "Your account couldn't be secured without changing its identity. Please try again." };
  }
  return { message: "We've sent a verification link. Open it to finish securing your account." };
}

export async function completeAnonymousAccount(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = secureAccountPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirm_password"),
  });
  if (!parsed.success) return { error: "Enter matching passwords of at least 6 characters." };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Your session has expired. Sign in again to continue." };
  if (user.is_anonymous !== false || !user.email_confirmed_at || !hasEmailIdentity(user)) {
    return { error: "Verify your email before creating a password." };
  }

  const originalUserId = user.id;
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Your password could not be created. Try again or use password recovery." };
  const { data: { user: updatedUser }, error: verificationError } = await supabase.auth.getUser();
  if (verificationError || !updatedUser || updatedUser.id !== originalUserId
    || updatedUser.is_anonymous !== false || !updatedUser.email_confirmed_at || !hasEmailIdentity(updatedUser)) {
    return { error: "Your account identity could not be confirmed. Please contact support before continuing." };
  }
  redirect("/inner-sanctum");
}

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
