import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { categoryLabels, contributionStatuses, contributionDate } from "@/lib/contributions";
export default async function AdminContributionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
 const state = await requireAdmin(); if (!state) return null;
 const { status } = await searchParams;
 const selected = contributionStatuses.find(value => value === status);
 const { data, error } = await state.supabase.rpc("admin_get_contributions", { p_status: selected ?? null });
 if (error) throw new Error("Contributions could not be loaded.");
 return <><div className="admin-title"><div><p className="eyebrow">Community</p><h1>Contributions</h1></div></div><section className="admin-panel"><nav className="contribution-filters" aria-label="Filter contributions"><Link href="/admin/contributions" aria-current={!selected ? "page" : undefined}>All</Link>{contributionStatuses.map(value => <Link key={value} href={`/admin/contributions?status=${value}`} aria-current={selected === value ? "page" : undefined}>{value}</Link>)}</nav>{data?.length ? <div className="contribution-inbox">{data.map(item => <article key={item.id}><h2><Link href={`/admin/contributions/${item.id}`}>{item.title}</Link></h2><p>{categoryLabels[item.category]} · {item.email ?? "Email unavailable"}</p><p>{contributionDate(item.submitted_at)} · {item.status}</p><Link className="text-link" href={`/admin/contributions/${item.id}`}>Review contribution →</Link></article>)}</div> : <p>No contributions in this view.</p>}</section></>;
}
