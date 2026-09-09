"use client";

import { useState } from "react";

export function QuoteLinkActions({
  url,
  label = "Quote link",
  openText = "Open Quote",
  copyText = "Copy Quote Link",
}: {
  url: string;
  label?: string;
  openText?: string;
  copyText?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  return (
    <div className="quote-link-actions">
      <input className="copy-field" readOnly value={url} aria-label={label} />
      <div>
        <a className="button small secondary" href={url} target="_blank" rel="noreferrer">{openText}</a>
        <button className="button small" type="button" onClick={copy}>{copied ? "Copied" : copyText}</button>
      </div>
    </div>
  );
}
