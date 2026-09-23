import { redirect } from "next/navigation";
import { FilthyShell } from "@/components/filthy-shell";
import { getAuthState } from "@/lib/auth";

export default async function FilthLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthState();
  if (!user) redirect("/signin?next=/filth");
  return <FilthyShell>{children}</FilthyShell>;
}
