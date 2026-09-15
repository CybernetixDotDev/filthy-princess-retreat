"use client";
import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/app/actions/auth";
import { SubmitButton } from "./submit-button";
export function SignInForm({ next, initialMode = "signin" }: { next: string; initialMode?: "signin" | "signup" }) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [signInState, signInAction] = useActionState<AuthState, FormData>(signIn, {});
  const [signUpState, signUpAction] = useActionState<AuthState, FormData>(signUp, {});
  return <div className="auth-forms">
    <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
      <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button>
      <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
    </div>
    {mode === "signin" ? <form action={signInAction} className="stack-form">
      <input type="hidden" name="next" value={next} />
      <label>Email<input type="email" name="email" autoComplete="email" required /></label>
      <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
      {signInState.error && <p className="form-error" role="alert">{signInState.error}</p>}
      <SubmitButton>Sign in</SubmitButton>
    </form> : <form action={signUpAction} className="stack-form">
      <input type="hidden" name="next" value={next} />
      <label>Email<input type="email" name="email" autoComplete="email" required /></label>
      <label>Password<input type="password" name="password" autoComplete="new-password" minLength={6} required /></label>
      <label>Confirm password<input type="password" name="confirm_password" autoComplete="new-password" minLength={6} required /></label>
      {signUpState.error && <p className="form-error" role="alert">{signUpState.error}</p>}
      {signUpState.message && <div className="success-panel" role="status"><p>{signUpState.message}</p></div>}
      <SubmitButton>Create account</SubmitButton>
    </form>}
  </div>;
}
