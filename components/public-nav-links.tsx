"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const publicLinks = [
  ["Home", "/home"],
  ["Meet Cally", "/cally"],
  ["Experience", "/experience"],
  ["Retreat", "/retreat"],
  ["Store", "/store"],
] as const;

export function PublicNavLinks() {
  const pathname = usePathname();

  return <div className={`public-links ${pathname === "/home" ? "public-links-home" : ""}`}>
    {publicLinks.map(([label, href]) => {
      const active = pathname === href || (href !== "/home" && pathname.startsWith(`${href}/`));
      return <Link href={href} key={href} aria-current={active ? "page" : undefined}>{label}</Link>;
    })}
  </div>;
}
