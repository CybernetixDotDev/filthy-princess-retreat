import { AdminNav } from "@/components/admin-nav";
import { requireAdmin } from "@/lib/auth";
export default async function AdminLayout({ children }: { children: React.ReactNode }) { const state = await requireAdmin(); if (!state) return <main className="access-denied"><h1>Access denied</h1><p>Your account is authenticated but is not authorized for retreat administration.</p></main>; return <div className="admin-shell"><AdminNav /><main className="admin-main">{children}</main></div>; }
