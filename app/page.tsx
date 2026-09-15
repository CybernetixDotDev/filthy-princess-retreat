import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { acknowledgeAdult } from "@/app/actions/entrance";
import { getAuthState } from "@/lib/auth";

const ADULT_ACKNOWLEDGEMENT_COOKIE = "fp_adult_acknowledged";

export default async function IndexPage() {
  const { user, isAdmin } = await getAuthState();
  if (user) redirect(isAdmin ? "/admin" : "/inner-sanctum");

  const hasAcknowledged = (await cookies()).get(ADULT_ACKNOWLEDGEMENT_COOKIE)?.value === "yes";
  if (!hasAcknowledged) {
    return <main className="entrance-page entrance-gate"><section className="entrance-panel" aria-labelledby="adult-gate-title">
      <Image className="entrance-kiss" src="/assets/lipstickKiss.png" alt="" width={120} height={86} priority />
      <p className="entrance-wordmark">Filthy Princess</p><h1 id="adult-gate-title">Adults only.</h1>
      <p>This private world contains mature themes and experiences intended only for adults.</p>
      <p>By entering, you confirm that you are <strong>18 years of age or older</strong>.</p>
      <div className="entrance-actions"><form action={acknowledgeAdult}><button className="entrance-primary" type="submit">I am 18 or older — Enter</button></form><a className="entrance-secondary" href="https://www.google.com/" rel="noreferrer">Leave</a></div>
    </section></main>;
  }

  return <main className="entrance-page entrance-landing"><section className="entrance-panel" aria-labelledby="restricted-title">
    <Image className="entrance-kiss" src="/assets/lipstickKiss.png" alt="" width={120} height={86} priority />
    <p className="entrance-wordmark">Filthy Princess</p><h1 id="restricted-title">Restricted access.</h1>
    <p>You found the private entrance.</p><p>The Inner Sanctum is reserved for members and invited guests.</p>
    <div className="entrance-actions entrance-auth-actions"><Link className="entrance-primary" href="/signin?next=/inner-sanctum">Member sign in</Link><Link className="entrance-secondary" href="/signin?mode=signup&next=/inner-sanctum">Sign up</Link></div>
    <p className="entrance-whisper">Some doors only open once you belong.</p>
  </section></main>;
}
