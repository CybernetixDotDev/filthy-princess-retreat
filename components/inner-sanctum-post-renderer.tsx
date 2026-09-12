import Image from "next/image";
import Link from "next/link";
import type { InnerSanctumVisiblePost } from "@/lib/database.types";

function PostCopy({ post }: { post: InnerSanctumVisiblePost }) {
  return <div className="sanctum-post-copy">
    {post.eyebrow ? <p className="sanctum-eyebrow">{post.eyebrow}</p> : null}
    <h2>{post.title}</h2>
    <div className="sanctum-prose">{post.body.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
    {post.cta_href && post.cta_label ? <Link className="sanctum-link" href={post.cta_href}>{post.cta_label}</Link> : null}
  </div>;
}

export function SanctumMessage({ post }: { post: InnerSanctumVisiblePost }) {
  return <article className="sanctum-message"><PostCopy post={post} /></article>;
}

export function SanctumFeature({ post }: { post: InnerSanctumVisiblePost }) {
  return <article className="sanctum-feature"><div className="sanctum-feature-mark" aria-hidden="true">✦</div><PostCopy post={post} /></article>;
}

export function SanctumDrop({ post }: { post: InnerSanctumVisiblePost }) {
  return <article className="sanctum-drop">
    {post.image_path ? <div className="sanctum-drop-image"><Image src={post.image_path} alt="" fill sizes="(max-width: 760px) 100vw, 56vw" /></div> : null}
    <PostCopy post={post} />
  </article>;
}

export function SanctumTask({ post }: { post: InnerSanctumVisiblePost }) {
  return <article className="sanctum-task"><PostCopy post={post} /></article>;
}

export function SanctumBenefit({ post }: { post: InnerSanctumVisiblePost }) {
  return <article className="sanctum-benefit"><PostCopy post={post} /><p className="sanctum-neutral-state">Nothing waiting right now.</p></article>;
}

export function InnerSanctumPostRenderer({ post }: { post: InnerSanctumVisiblePost }) {
  switch (post.type) {
    case "message": return <SanctumMessage post={post} />;
    case "feature": return <SanctumFeature post={post} />;
    case "drop": return <SanctumDrop post={post} />;
    case "task": return <SanctumTask post={post} />;
    case "benefit": return <SanctumBenefit post={post} />;
  }
}
