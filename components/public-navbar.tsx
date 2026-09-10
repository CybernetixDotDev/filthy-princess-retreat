import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { PublicNavLinks } from "@/components/public-nav-links";

export function PublicNavbar({ authenticated }: { authenticated: boolean }) {
  return <header className="public-header"><nav className="public-nav" aria-label="Primary navigation"><Link href="/home" className="brand-mark" aria-label="Filthy Princess home"><Image src="/assets/lipstickKiss.png" alt="" width={72} height={52} priority /></Link><PublicNavLinks />{authenticated && <form action={signOut}><button className="link-button" type="submit">Sign out</button></form>}</nav></header>;
}
