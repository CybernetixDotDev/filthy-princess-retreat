// Used only by server pages/actions; this origin is distinct from the private app URL.
export function teaserPromoUrl(slug: string, configuredOrigin = process.env.FILTHY_PRINCESS_PUBLIC_SITE_URL) {
  if (!/^[a-f0-9]{48}$/.test(slug)) throw new Error("Invalid teaser promotional slug.");
  const message = "Set FILTHY_PRINCESS_PUBLIC_SITE_URL to the public marketing-site origin (http:// or https://, without a path, credentials, query or fragment).";
  if (!configuredOrigin?.trim()) throw new Error(message);
  let url: URL;
  try { url = new URL(configuredOrigin.trim()); } catch { throw new Error(message); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error(message);
  return `${url.origin}/t/${slug}`;
}
