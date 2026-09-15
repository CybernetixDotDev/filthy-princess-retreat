import { getMyInnerSanctumCollection } from "@/lib/inner-sanctum-collection";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";

export default async function CollectionPage() {
  const hasAccess = await hasInnerSanctumAccess();
  if (!hasAccess) return <section className="inner-sanctum-boundary" aria-labelledby="collection-boundary-title"><p className="eyebrow">Inner Sanctum</p><h1 id="collection-boundary-title">This door isn&apos;t open for you yet.</h1><p>Inner Sanctum membership is required to enter.</p></section>;
  const collectibles = await getMyInnerSanctumCollection();
  return <div className="sanctum-collection"><header className="sanctum-collection-intro"><p className="sanctum-eyebrow">Things you&apos;ve kept</p><h1>Your collection</h1><p>Some things in here are meant to stay with you.</p></header>
    {collectibles.length ? <div className="sanctum-collection-grid">{collectibles.map((item) => <article className="sanctum-collectible" key={item.id}>
      {item.signed_media_url && item.media_type === "video/mp4" ? <video controls preload="metadata" src={item.signed_media_url}>Your browser cannot play this video.</video> : null}
      {/* Signed private media deliberately bypasses the public Next image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.signed_media_url && item.media_type?.startsWith("image/") ? <img src={item.signed_media_url} alt="" /> : null}
      <div><p className="sanctum-eyebrow">Kept</p><h2>{item.title}</h2><p>{item.description}</p></div>
    </article>)}</div> : <section className="sanctum-collection-empty"><h2>Nothing here yet.</h2><p>When something is yours to keep, you&apos;ll find it waiting here.</p></section>}
  </div>;
}
