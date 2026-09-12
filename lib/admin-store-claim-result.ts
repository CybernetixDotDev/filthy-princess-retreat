export type OneTimeClaimResult = { message?: string; claimUrl?: string };

export function selectOneTimeClaimResult(
  authorizeResult: OneTimeClaimResult,
  reissueResult: OneTimeClaimResult,
) {
  if (reissueResult.claimUrl) return reissueResult;
  if (authorizeResult.claimUrl) return authorizeResult;
  return null;
}
