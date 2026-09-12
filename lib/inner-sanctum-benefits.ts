export const BENEFIT_TYPES = ["invitation", "gift", "experience", "event", "retreat", "personal"] as const;
export const BENEFIT_STATUSES = ["draft", "available", "withdrawn", "completed", "expired"] as const;
export const RESPONDABLE_BENEFIT_TYPES = ["invitation", "event", "retreat"] as const;

export function benefitLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

export function isSafeBenefitCta(value: string) {
  return value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\")
    && !value.includes("\r")
    && !value.includes("\n");
}
