"use client";
import { useActionState, useState } from "react";
import { manageTeaserImage } from "@/app/admin/teasers/actions";
import { teaserMediaPublicUrl, TEASER_MEDIA_MAX_BYTES } from "@/lib/teaser-media";

export function TeaserImageControls({ id, slot, path }: { id: string; slot: number; path: string | null }) {
  const [state, action, pending] = useActionState(manageTeaserImage.bind(null, id, slot), {});
  const [fileError, setFileError] = useState("");
  const url = teaserMediaPublicUrl(path);
  return <section className="admin-panel"><h3>Image slot {slot}</h3>
    {/* Public bucket preview; no image optimization or transformation required. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url ? <img src={url} alt={`Teaser image slot ${slot}`} style={{ width: "100%", maxWidth: 360, height: 240, objectFit: "contain" }} /> : <p>No image uploaded.</p>}
    <form action={action} className="stack-form">
      <label>{path ? "Replacement image" : "Image"}<input type="file" name="image" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={event => {
        const file = event.target.files?.[0];
        if (file && file.size > TEASER_MEDIA_MAX_BYTES) { setFileError("Images must be 20 MiB or smaller."); event.target.value = ""; }
        else setFileError("");
      }} /></label><p>JPEG, PNG or WebP. Maximum 20 MiB.</p>
      {fileError && <p role="alert">{fileError}</p>}
      <button className="button" name="intent" value="upload" disabled={pending}>{pending ? "Working..." : path ? "Replace" : "Upload"}</button>
      {path && <button className="button" name="intent" value="remove" disabled={pending}>Remove</button>}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      {state.warning && <p role="alert">{state.warning}</p>}
    </form>
  </section>;
}
