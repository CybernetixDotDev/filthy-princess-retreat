"use client";

import { useState } from "react";

export function GuestShareCard({ guestName, message, url, preferredContactMethod, contactDetail }: { guestName: string; message: string; url: string; preferredContactMethod?: string | null; contactDetail?: string | null }) {
  const [copied, setCopied] = useState<"message" | "link" | "">("");
  async function copy(value: string, kind: "message" | "link") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(""), 1800);
  }
  return <section className="admin-panel guest-share-card"><h3>Share with Guest</h3>{preferredContactMethod && <p><strong>Preferred contact:</strong> {preferredContactMethod}{contactDetail ? ` · ${contactDetail}` : ""}</p>}<label>Message preview for {guestName}<textarea readOnly value={message} rows={8} /></label><label>Secure link<input className="copy-field" readOnly value={url} /></label><div className="quote-link-actions"><button className="button small" type="button" onClick={() => copy(message, "message")}>{copied === "message" ? "Copied" : "Copy Message"}</button><button className="button small secondary" type="button" onClick={() => copy(url, "link")}>{copied === "link" ? "Copied" : "Copy Link"}</button></div></section>;
}
