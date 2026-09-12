"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { signOut } from "@/app/actions/auth";
import { activeAdminGroup, adminNavigation, isAdminDestinationActive } from "@/lib/admin-navigation";

const SIDEBAR_KEY = "fp-admin-sidebar-collapsed";
const sidebarListeners = new Set<() => void>();

function subscribeToSidebar(callback: () => void) {
  sidebarListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => { sidebarListeners.delete(callback); window.removeEventListener("storage", callback); };
}

function getSidebarSnapshot() { return window.localStorage.getItem(SIDEBAR_KEY) === "true"; }

function NavigationGroups({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeGroup = activeAdminGroup(pathname);
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({});

  return <nav className="admin-sidebar-navigation" aria-label="Admin navigation">{adminNavigation.map((group) => {
    const open = groupOverrides[group.label] ?? group.label === activeGroup;
    return <section className="admin-nav-group" key={group.label}><button className="admin-nav-group-toggle" type="button" aria-label={collapsed ? group.label : undefined} title={collapsed ? group.label : undefined} aria-expanded={open} onClick={() => setGroupOverrides((current) => ({ ...current, [group.label]: !open }))}><span>{group.label}</span><span aria-hidden="true">{open ? "−" : "+"}</span></button><div className="admin-nav-group-items" hidden={!open}>{group.items.map((item) => {
      const active = isAdminDestinationActive(pathname, item.href);
      return <Link className={active ? "active" : undefined} aria-current={active ? "page" : undefined} href={item.href} key={item.href} onClick={onNavigate} title={collapsed ? item.label : undefined}><span className="admin-nav-mark" aria-hidden="true">{item.shortLabel}</span><span className="admin-nav-label">{item.label}</span></Link>;
    })}</div></section>;
  })}</nav>;
}

export function AdminNav() {
  const collapsed = useSyncExternalStore(subscribeToSidebar, getSidebarSnapshot, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    closeButton.current?.focus();
    const handleDrawerKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobileOpen(false); openButton.current?.focus(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(drawer.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", handleDrawerKeys);
    return () => window.removeEventListener("keydown", handleDrawerKeys);
  }, [mobileOpen]);

  function toggleCollapsed() { window.localStorage.setItem(SIDEBAR_KEY, String(!collapsed)); sidebarListeners.forEach((listener) => listener()); }

  return <><aside className={`admin-sidebar${collapsed ? " collapsed" : ""}`}><div className="admin-sidebar-brand"><Link href="/admin"><span>Filthy Princess</span><small>Admin</small></Link></div><button className="admin-sidebar-collapse" type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}><span aria-hidden="true">{collapsed ? "›" : "‹"}</span></button><NavigationGroups collapsed={collapsed} /><form className="admin-sidebar-signout" action={signOut}><button type="submit" title={collapsed ? "Sign out" : undefined}><span className="admin-nav-mark" aria-hidden="true">×</span><span className="admin-nav-label">Sign out</span></button></form></aside>
    <header className="admin-mobile-header"><Link href="/admin"><span>Filthy Princess</span><small>Admin</small></Link><button ref={openButton} type="button" aria-expanded={mobileOpen} aria-controls="admin-mobile-drawer" onClick={() => setMobileOpen(true)}><span aria-hidden="true">☰</span><span className="sr-only">Open admin navigation</span></button></header>
    {mobileOpen ? <div className="admin-drawer-layer"><button className="admin-drawer-backdrop" type="button" tabIndex={-1} aria-label="Close admin navigation" onClick={() => setMobileOpen(false)} /><aside ref={drawer} className="admin-mobile-drawer" id="admin-mobile-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation"><div className="admin-drawer-heading"><span>Navigation</span><button ref={closeButton} type="button" onClick={() => { setMobileOpen(false); openButton.current?.focus(); }} aria-label="Close admin navigation">×</button></div><NavigationGroups collapsed={false} onNavigate={() => setMobileOpen(false)} /><form className="admin-sidebar-signout" action={signOut}><button type="submit"><span className="admin-nav-mark" aria-hidden="true">×</span><span className="admin-nav-label">Sign out</span></button></form></aside></div> : null}</>;
}
