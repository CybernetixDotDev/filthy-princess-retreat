"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { signOut } from "@/app/actions/auth";
import { customerDestinations as destinations } from "@/lib/customer-destinations";
import type { CustomerPresentationState } from "@/lib/customer-presentation";

const world = [
  { label: "Retreat", href: destinations.retreat, note: "run away" },
  { label: "Inner Sanctum", href: destinations.innerSanctum, note: "come closer" },
  { label: "Store", href: destinations.store, note: "take something" },
  { label: "Filth", href: destinations.filth, note: "get filthy" },
  { label: "Contribute", href: destinations.contribute, note: "make something" },
] as const;
const number = new Intl.NumberFormat("en-ZA");

export function FilthyNav({ state }: { state: CustomerPresentationState }) {
  const pathname = usePathname();
  const id = useId();
  const accountDialog = useRef<HTMLDialogElement>(null);
  const worldDialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const brand = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState<"account" | "world" | null>(null);
  const identity = state.user?.displayName || state.user?.email?.split("@")[0] || "Your account";
  const filth = state.filth;
  const filthLabel = filth
    ? `Your Filth: ${number.format(filth.lifetime_filth)} lifetime, ${number.format(filth.available_filth)} available. ${filth.current_level_title ?? "Before Level 1"}${filth.current_level === null ? "" : `, level ${filth.current_level}`}. ${filth.progress_percentage}% progress${filth.next_level_title ? ` toward ${filth.next_level_title}` : ""}. View Filth.`
    : "View your Filth";

  function show(kind: "account" | "world", trigger: HTMLButtonElement) {
    opener.current = trigger;
    (kind === "account" ? accountDialog : worldDialog).current?.showModal();
    setOpen(kind);
  }

  function closed() {
    setOpen(null);
    // A breakpoint change can hide the mobile trigger; use the visible brand then.
    const target = opener.current;
    if (target?.isConnected && target.getClientRects().length) target.focus();
    else brand.current?.focus();
  }

  function dismissBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
  }

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => { body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 80rem)");
    const closeWorld = () => { if (desktop.matches) worldDialog.current?.close(); };
    desktop.addEventListener("change", closeWorld);
    return () => desktop.removeEventListener("change", closeWorld);
  }, []);

  // Also dismiss on browser/history navigation, not just a click inside the menu.
  useEffect(() => {
    accountDialog.current?.close();
    worldDialog.current?.close();
  }, [pathname]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return <header className="filthy-nav">
    <nav className="filthy-nav-bar" aria-label="Filthy Princess">
      <div className="filthy-nav-me">
        {state.authenticated ? <>
          <button className="filthy-nav-identity" type="button" aria-label={`Open account for ${identity}`} aria-haspopup="dialog" aria-expanded={open === "account"} aria-controls={`${id}-account`} onClick={event => show("account", event.currentTarget)}>
            <span>{identity}</span><span aria-hidden="true">⌄</span>
          </button>
          <Link className="filthy-nav-filth" href={destinations.filth} aria-label={filthLabel}>
            <span aria-hidden="true">Filth{filth ? ` · ${number.format(filth.lifetime_filth)}` : ""}</span>
            {filth ? <span className="filthy-nav-track" aria-hidden="true"><span style={{ width: `${filth.progress_percentage}%` }} /></span> : null}
          </Link>
        </> : <div className="filthy-nav-auth"><Link href={destinations.signUp}>Join free</Link><Link href={destinations.signIn}>Sign in</Link></div>}
      </div>
      <Link ref={brand} className="filthy-nav-brand" href={destinations.home} aria-label="Filthy Princess home">
        <Image src="/assets/FilthyPrincessLogo.png" width={1536} height={1024} sizes="(min-width: 80rem) 120px, 96px" alt="Filthy Princess" />
      </Link>
      <div className="filthy-nav-world">
        <div className="filthy-nav-desktop">{world.map(item => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}>{item.label}</Link>)}</div>
        <button className="filthy-nav-menu" type="button" aria-label="Open world navigation" aria-haspopup="dialog" aria-expanded={open === "world"} aria-controls={`${id}-world`} onClick={event => show("world", event.currentTarget)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M4 8h16M4 16h16" /></svg><span className="sr-only">Menu</span>
        </button>
      </div>
    </nav>
    {state.authenticated ? <dialog ref={accountDialog} id={`${id}-account`} className="filthy-nav-dialog filthy-nav-account" aria-labelledby={`${id}-account-title`} onClose={closed} onClick={dismissBackdrop}>
      <div className="filthy-nav-dialog-heading"><h2 id={`${id}-account-title`}>Your little corner.</h2><button type="button" autoFocus aria-label="Close account" onClick={() => accountDialog.current?.close()}>×</button></div>
      <p className="filthy-nav-account-name">{identity}</p>
      {state.user?.email ? <p className="filthy-nav-email">{state.user.email}</p> : null}
      <div className="filthy-nav-account-actions">
        <Link href={destinations.account} onClick={() => accountDialog.current?.close()}>Account &amp; settings</Link>
        {state.isAdmin ? <Link href="/admin" onClick={() => accountDialog.current?.close()}>Admin</Link> : null}
        <form action={signOut}><button type="submit">Sign out</button></form>
      </div>
    </dialog> : null}
    <dialog ref={worldDialog} id={`${id}-world`} className="filthy-nav-dialog filthy-nav-world-dialog" aria-labelledby={`${id}-world-title`} onClose={closed} onClick={dismissBackdrop}>
      <div className="filthy-nav-dialog-heading"><h2 id={`${id}-world-title`}>Where shall we?</h2><button type="button" autoFocus aria-label="Close world navigation" onClick={() => worldDialog.current?.close()}>×</button></div>
      <nav aria-label="Explore Filthy Princess">{world.map(item => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined} onClick={() => worldDialog.current?.close()}><span>{item.label}</span><small>{item.note}</small><span className="filthy-nav-arrow" aria-hidden="true">↗</span></Link>)}</nav>
    </dialog>
  </header>;
}
