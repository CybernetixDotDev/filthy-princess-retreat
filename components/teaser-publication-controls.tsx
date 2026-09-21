"use client";
import { useActionState, useState } from "react";
import { changeTeaserPublication } from "@/app/admin/teasers/publication-actions";
export function TeaserPublicationControls({ id, status, ready, promoUrl }: { id: string; status: "draft" | "published"; ready: boolean; promoUrl: string | null }) {
  const [state, action, pending] = useActionState(changeTeaserPublication.bind(null, id), {});
  const [copyMessage, setCopyMessage] = useState("");
  return <>
    <form action={action} className="stack-form"><input type="hidden" name="status" value={status === "published" ? "draft" : "published"} />
      <button className="button" disabled={pending || (status === "draft" && !ready)}>{pending ? "Working..." : status === "published" ? "Return to Draft" : "Publish"}</button>
      {state.error && <p role="alert" className="form-error">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    </form>
    {status === "published" && promoUrl && <div><h3>Promo URL</h3><p style={{ overflowWrap: "anywhere" }}>{promoUrl}</p>
      <p>This is the canonical promotional URL. The public renderer is not available yet.</p>
      <button type="button" className="button" onClick={async () => { try { await navigator.clipboard.writeText(promoUrl); setCopyMessage("Promo URL copied."); } catch { setCopyMessage("Could not copy automatically. Select and copy the URL above."); } }}>Copy Promo URL</button>
      {copyMessage && <p role="status">{copyMessage}</p>}
    </div>}
  </>;
}
