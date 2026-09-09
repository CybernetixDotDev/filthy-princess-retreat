import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";

const links = [["Home", "/home"], ["Meet Cally", "/cally"], ["Experience", "/experience"], ["Retreat", "/retreat"], ["Store", "/store"]] as const;
export function PublicNavbar({ authenticated }: { authenticated: boolean }) {
  return <header className="public-header"><nav className="public-nav" aria-label="Primary navigation"><Link href="/home" className="brand-mark" aria-label="Filthy Princess home"><Image src="/assets/lipstickKiss.png" alt="" width={72} height={52} priority /></Link><div className="public-links">{links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div>{authenticated && <form action={signOut}><button className="link-button" type="submit">Sign out</button></form>}</nav></header>;
}
