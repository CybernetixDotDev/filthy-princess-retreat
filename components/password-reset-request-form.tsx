"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { SubmitButton } from "./submit-button";

export function PasswordResetRequestForm() {
  const [state, action] = useActionState(requestPasswordReset, {});
  return <form action={action} className="stack-form">
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.message && <p className="success-panel" role="status">{state.message}</p>}
    <SubmitButton>Send recovery email</SubmitButton>
  </form>;
}
