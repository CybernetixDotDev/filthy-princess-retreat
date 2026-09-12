import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { InnerSanctumPostRenderer } from "@/components/inner-sanctum-post-renderer";
import { getMyInnerSanctumBenefits } from "@/lib/inner-sanctum-benefit-data";
import { getMyInnerSanctumTasks } from "@/lib/inner-sanctum-task-data";
import { isTaskOpen } from "@/lib/inner-sanctum-tasks";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";
import { resolveInnerSanctumRouteState } from "@/lib/inner-sanctum-route";
import { createClient } from "@/lib/supabase/server";

export default async function InnerSanctumPage() {
  const hasAccess = await hasInnerSanctumAccess();
  const state = resolveInnerSanctumRouteState(true, hasAccess);
  if (state === "access_boundary") return <section className="inner-sanctum-boundary" aria-labelledby="inner-sanctum-boundary-title">
    <p className="eyebrow">Inner Sanctum</p><h1 id="inner-sanctum-boundary-title">This door isn&apos;t open for you yet.</h1>
    <p>Inner Sanctum membership is required to enter.</p><Link className="text-link" href="/store">Visit the store</Link>
  </section>;

  const supabase = await createClient();
  const [{ data: posts, error }, benefits, tasks] = await Promise.all([supabase.rpc("get_inner_sanctum_posts"), getMyInnerSanctumBenefits({ signMedia: false }), getMyInnerSanctumTasks()]);
  if (error) throw new Error("The Inner Sanctum could not be opened.");
  const byType = (type: "message" | "feature" | "drop" | "task" | "benefit") => (posts ?? []).filter((post) => post.type === type);
  const waiting = benefits.find((benefit) => benefit.status === "available" && !benefit.response);
  const currentTask = tasks.find((task) => isTaskOpen(task) && !task.response_text);

  return <div className="sanctum-home">
    <h1 className="sr-only">Inner Sanctum</h1>
    {byType("message").map((post) => <InnerSanctumPostRenderer post={post} key={post.id} />)}
    {byType("feature").map((post) => <InnerSanctumPostRenderer post={post} key={post.id} />)}
    {byType("drop").map((post) => <InnerSanctumPostRenderer post={post} key={post.id} />)}
    <section className="sanctum-task"><div className="sanctum-post-copy"><p className="sanctum-eyebrow">I have a job for you</p>{currentTask ? <><h2>{currentTask.title}</h2><Link className="sanctum-link" href={`/inner-sanctum/tasks/${currentTask.slug}`}>Tell me</Link></> : <><h2>Nothing I need from you right now.</h2><Link className="sanctum-link" href="/inner-sanctum/tasks">Things you&apos;ve told me</Link></>}</div></section>
    <section className="sanctum-discoveries" aria-labelledby="sanctum-discoveries-title">
      <p className="sanctum-eyebrow">Things you&apos;ve kept</p><h2 id="sanctum-discoveries-title">Your collection</h2>
      <p>Some things in here are meant to stay with you.</p><Link className="sanctum-link" href="/inner-sanctum/collection">Open my collection</Link>
    </section>
    <section className="sanctum-benefit"><div className="sanctum-post-copy"><p className="sanctum-eyebrow">Beyond the screen</p>{waiting ? <><h2>Something is waiting for you.</h2><div className="sanctum-prose"><p>{waiting.title}</p></div><Link className="sanctum-link" href="/inner-sanctum/benefits">See what&apos;s waiting</Link></> : <><h2>Nothing waiting right now.</h2><div className="sanctum-prose"><p>I&apos;ll leave it here when there is.</p></div></>}</div></section>
    <section className="sanctum-account" aria-label="Member account"><p>You&apos;re inside.</p><form action={signOut}><button type="submit">Leave quietly</button></form></section>
  </div>;
}
