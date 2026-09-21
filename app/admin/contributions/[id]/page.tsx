import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { categoryLabels, contributionDate } from "@/lib/contributions";
import { ContributionReviewControls } from "@/components/contribution-review-controls";
export default async function AdminContributionPage({ params }: { params: Promise<{ id: string }> }) {
 const state = await requireAdmin(); if (!state) return null;
 const parsed = z.uuid().safeParse((await params).id); if (!parsed.success) notFound();
 const { data, error } = await state.supabase.rpc("admin_get_contributions", { p_id: parsed.data });
 if (error) throw new Error("Contribution could not be loaded.");
 const item = data?.[0]; if (!item) notFound();
 return <><Link className="text-link" href="/admin/contributions">Back to contributions</Link><div className="admin-title"><div><p className="eyebrow">{categoryLabels[item.category]} · {item.status}</p><h1>{item.title}</h1></div></div><section className="admin-panel"><dl className="detail-list"><div><dt>Contributor</dt><dd>{item.email ?? "Email unavailable"}</dd></div><div><dt>Submitted</dt><dd>{contributionDate(item.submitted_at)}</dd></div><div><dt>Reviewed</dt><dd>{item.reviewed_at ? contributionDate(item.reviewed_at) : "Not reviewed"}</dd></div></dl><h2>Contribution</h2><p className="contribution-content">{item.description}</p>{item.work_url && <p><a className="text-link" href={item.work_url} target="_blank" rel="noopener noreferrer">Open submitted work ↗</a></p>}{item.additional_notes && <><h3>Additional notes</h3><p className="contribution-content">{item.additional_notes}</p></>}{item.admin_note && <><h3>Private admin note</h3><p className="contribution-content">{item.admin_note}</p></>}{item.status === "accepted" && <p>+{item.filth_awarded} Filth awarded.{item.paid_opportunity ? " Paid opportunity discussion marked; no payment entitlement." : ""}</p>}</section>{(item.status === "submitted" || item.status === "reviewing") && <ContributionReviewControls id={item.id} status={item.status} />}</>;
}
