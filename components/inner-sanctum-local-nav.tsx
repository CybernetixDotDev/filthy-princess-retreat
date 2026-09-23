"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { label: "Inside", href: "/inner-sanctum" },
  { label: "Tasks", href: "/inner-sanctum/tasks" },
  { label: "Collection", href: "/inner-sanctum/collection" },
  { label: "Benefits", href: "/inner-sanctum/benefits" },
  { label: "You", href: "/inner-sanctum/you" },
] as const;

export function InnerSanctumLocalNav() {
  const pathname = usePathname();
  return <nav className="sanctum-local-nav" aria-label="Inner Sanctum navigation">
    {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href || (link.href !== "/inner-sanctum" && pathname.startsWith(`${link.href}/`)) ? "page" : undefined}>{link.label}</Link>)}
  </nav>;
}