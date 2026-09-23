import Link from "next/link";
import type { ComponentProps } from "react";

export function CallyLink({ children, className, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} className={["cally-link", className].filter(Boolean).join(" ")}>
    {children}
    <svg className="cally-link-stroke" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M2 6 C17 1 26 9 43 5 S69 2 82 5 S103 8 118 3" />
    </svg>
  </Link>;
}
