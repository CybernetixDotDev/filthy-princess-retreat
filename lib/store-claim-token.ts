import { createHash, randomBytes } from "node:crypto";

export function generateStoreClaimToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token, "utf8").digest("hex") };
}

export function buildStoreClaimUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/claim/${encodeURIComponent(token)}`;
}
