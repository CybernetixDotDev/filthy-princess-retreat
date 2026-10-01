"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completeAnonymousAccount, requestAnonymousAccountEmail, type AuthState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";

export function SecureAccountEmailForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action] = useActionState<AuthState, FormData>(requestAnonymousAccountEmail, {});
  if (state.message) return <div className="success-panel" role="status">
    <h2>Check your email</h2>
    <p>{state.message}</p>
  </div>;

  return <form action={action} className="stack-form">
    <label>Email<input name="email" type="email" autoComplete="email" defaultValue={defaultEmail} required /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.accountExists && <p>Use <Link className="text-link" href="/forgot-password">password recovery</Link> for that account. This purchase remains attached to its current identity; contact support if you need help accessing it.</p>}
    <SubmitButton>Send verification</SubmitButton>
  </form>;
}

export function SecureAccountPasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(completeAnonymousAccount, {});
  return <form action={action} className="stack-form">
    <label>Password<input name="password" type="password" autoComplete="new-password" minLength={6} required /></label>
    <label>Confirm password<input name="confirm_password" type="password" autoComplete="new-password" minLength={6} required /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <SubmitButton>Enter the Inner Sanctum</SubmitButton>
  </form>;
}
