export type AdminNavigationItem = { label: string; href: string; shortLabel: string };
export type AdminNavigationGroup = { label: string; items: readonly AdminNavigationItem[] };

export const adminNavigation: readonly AdminNavigationGroup[] = [
  { label: "Retreat", items: [
    { label: "Enquiries", href: "/admin", shortLabel: "E" },
    { label: "Availability", href: "/admin/availability", shortLabel: "A" },
    { label: "Pricing", href: "/admin/pricing", shortLabel: "P" },
    { label: "Events", href: "/admin/events", shortLabel: "E" },
    { label: "Bookings", href: "/admin/bookings", shortLabel: "B" },
  ] },
  { label: "Commerce", items: [{ label: "Store", href: "/admin/store", shortLabel: "S" }] },
  { label: "Community", items: [
    { label: "Members", href: "/admin/members", shortLabel: "M" },
    { label: "Inner Sanctum", href: "/admin/inner-sanctum", shortLabel: "I" },
    { label: "Collections", href: "/admin/collections", shortLabel: "C" },
    { label: "Benefits", href: "/admin/benefits", shortLabel: "B" },
    { label: "Tasks", href: "/admin/tasks", shortLabel: "T" },
    { label: "Referrals", href: "/admin/referrals", shortLabel: "R" },
  ] },
] as const;

export function isAdminDestinationActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href || pathname.startsWith("/admin/enquiries/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeAdminGroup(pathname: string) {
  return adminNavigation.find((group) => group.items.some((item) => isAdminDestinationActive(pathname, item.href)))?.label ?? null;
}
