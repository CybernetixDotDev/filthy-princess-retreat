"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePassword } from "@/app/actions/auth";
import { SubmitButton } from "./submit-button";

export function PasswordChangeForm() {
  const [state, action] = useActionState(updatePassword, {});
  if (state.message) return <div className="success-panel"><p role="status">{state.message}</p><Link className="text-link" href="/you">Continue to your account</Link></div>;
  return <form action={action} className="stack-form">
    <label>New password<input name="password" type="password" autoComplete="new-password" minLength={6} required /></label>
    <label>Confirm new password<input name="confirm_password" type="password" autoComplete="new-password" minLength={6} required /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <SubmitButton>Save password</SubmitButton>
  </form>;
}
