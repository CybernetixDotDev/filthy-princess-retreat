# Google OAuth setup

The app uses Supabase Auth PKCE with its existing server cookie client and `/auth/callback?next=...`. Email/password remains available. No Google secrets belong in the application environment.

## Google Auth Platform

1. Configure the consent screen/branding and audience. For External apps in Testing, add the Google accounts that will test sign-in. Publish the consent configuration when ready for unrestricted users.
2. Use only `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile` scopes.
3. Create an OAuth client of type **Web application**.
4. Authorized JavaScript origins: `http://localhost:3000`, plus each deployed private-app origin when enabled.
5. Authorized redirect URI for this linked Supabase project:
   `https://tykjmfkvbwzioppegbxo.supabase.co/auth/v1/callback`
   Confirm this matches the callback displayed in Supabase's Google provider settings. Google redirects to Supabase, not directly to the app's `/auth/callback`.
6. Copy the Client ID and Client Secret into Supabase, not the repository.

## Supabase Dashboard

1. Authentication -> Sign In / Providers -> Google: enable Google and enter the Web Client ID and secret. Save. Leave nonce/security checks enabled.
2. Authentication -> URL Configuration: for current local development set Site URL to `http://localhost:3000`.
3. Add redirect allow-list entry `http://localhost:3000/auth/callback**`. The trailing wildcard includes the encoded `next` query string.
4. When the deployed private app resumes, set Site URL to its canonical origin and add `<PRIVATE_APP_ORIGIN>/auth/callback**`. Explicitly list each approved environment; do not add arbitrary host wildcards.
5. Set the private app's existing `NEXT_PUBLIC_SITE_URL` to its matching origin (`http://localhost:3000` locally). Use that same hostname when opening the app so its PKCE cookie is available on return. Existing Supabase URL/publishable-key variables are unchanged.

If using a different Supabase project or custom Auth domain, use the provider callback shown by that project instead. A locally running Supabase Auth stack additionally needs its displayed callback, normally `http://127.0.0.1:54321/auth/v1/callback`; this is not needed merely because Next.js runs locally against hosted Supabase.

## Manual verification after provider setup

- Sign in and sign up with Google; check that the existing Supabase session is established.
- Check ordinary return to `/inner-sanctum`, checkout/start with selected product, an existing checkout reference, and a claim return path. Checkout must still require its existing explicit account confirmation.
- Capture a valid referral before Google sign-in and check that the existing referral cookie survives. No referral is sent as OAuth metadata.
- Cancel Google consent and retry; test an expired callback. Both should return to Sign In with a message and preserve `next`.
- Confirm email/password sign-in and email-confirmation signup still work.

Supabase remains the identity source; this implementation creates no application profiles or separate Google-user records.

Reference: https://supabase.com/docs/guides/auth/social-login/auth-google
