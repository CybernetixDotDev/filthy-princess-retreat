import { getAuthState } from "@/lib/auth";
import { PublicNavbar } from "@/components/public-navbar";
import { ReferralCapture } from "@/components/referral-capture";
export default async function PublicLayout({ children }: { children: React.ReactNode }) { const { user } = await getAuthState(); return <><ReferralCapture /><PublicNavbar authenticated={Boolean(user)} /><main className="public-main">{children}</main><footer className="site-footer">Filthy Princess Retreat</footer></>; }
