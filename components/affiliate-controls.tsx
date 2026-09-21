"use client";
import { useActionState, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { acceptAffiliateTerms } from "@/app/actions/affiliate";
import { SubmitButton } from "@/components/submit-button";
export function AffiliateActivation({ version, termsUrl }: { version: string; termsUrl: string | null }) {
 const [state, action] = useActionState(acceptAffiliateTerms, {});
 if (!termsUrl) return <p>Affiliate activation will be available once the current Affiliate Terms are published.</p>;
 return <form action={action} className="hub-form">
  <input type="hidden" name="terms_version" value={version} />
  <a className="hub-text-link" href={termsUrl} target="_blank" rel="noopener noreferrer">Read Affiliate Terms</a><label className="hub-checkbox"><input name="accept_terms" type="checkbox" required />I have read and accept the Affiliate Terms ({version}).</label><SubmitButton className="hub-button">Activate Affiliate</SubmitButton>
  {state.error && <p role="alert" className="hub-error">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
 </form>;
}
export function AffiliateLink({ url }: { url: string }) {
 const [message, setMessage] = useState("");
 async function copy() { try { await navigator.clipboard.writeText(url); setMessage("Link copied."); } catch { setMessage("Select and copy the link above."); } }
 return <div className="hub-sharing"><p className="eyebrow">Your Affiliate link</p><input aria-label="Your Affiliate referral link" readOnly value={url} onFocus={event => event.currentTarget.select()} /><button className="hub-button" type="button" onClick={copy}>Copy link</button><span role="status">{message}</span><details><summary>QR code</summary><QRCodeSVG value={url} size={192} marginSize={4} title="Your Affiliate referral link" /></details></div>;
}
