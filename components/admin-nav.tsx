import Link from "next/link";
import { signOut } from "@/app/actions/auth";
const links = [["Enquiries", "/admin"], ["Availability", "/admin/availability"], ["Pricing", "/admin/pricing"], ["Events", "/admin/events"], ["Bookings", "/admin/bookings"]] as const;
export function AdminNav() { return <header className="admin-header"><nav className="admin-nav" aria-label="Admin navigation"><Link className="admin-brand" href="/admin">Filthy Princess Retreat</Link><div className="admin-links">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}<form action={signOut}><button className="link-button light" type="submit">Sign out</button></form></div></nav></header>; }
