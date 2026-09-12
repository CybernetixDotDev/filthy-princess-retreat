import "server-only";

import { buildStoreClaimUrl, generateStoreClaimToken } from "./store-claim-token";

export const STORE_CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createStoreClaimSecret() {
  return generateStoreClaimToken();
}

export function storeClaimPath(token: string) {
  return `/claim/${encodeURIComponent(token)}`;
}

export function storeClaimUrl(token: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin = configuredOrigin ? configuredOrigin.replace(/\/$/, "") : "http://localhost:3000";
  return buildStoreClaimUrl(origin, token);
}
