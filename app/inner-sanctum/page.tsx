import Link from "next/link";
import { InnerSanctumPostRenderer } from "@/components/inner-sanctum-post-renderer";
import { InnerSanctumEventDiscovery, type InnerSanctumEventState } from "@/components/inner-sanctum-event-discovery";
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
    <p>Inner Sanctum membership is required to enter.</p>
  </section>;

  const supabase = await createClient();
  const [{ data: posts, error }, benefits, tasks, { data: events }, { data: interests }] = await Promise.all([
    supabase.rpc("get_inner_sanctum_posts"),
    getMyInnerSanctumBenefits({ signMedia: false }),
    getMyInnerSanctumTasks(),
    supabase.rpc("list_public_retreat_events"),
    supabase.from("retreat_event_interests").select("retreat_event_id,status"),
  ]);
  if (error) throw new Error("The Inner Sanctum could not be opened.");
  const byType = (type: "message" | "feature" | "drop" | "task" | "benefit") => (posts ?? []).filter((post) => post.type === type);
  const waiting = benefits.find((benefit) => benefit.status === "available" && !benefit.response);
  const currentTask = tasks.find((task) => isTaskOpen(task) && !task.response_text);
  const eventStates = new Map((interests ?? []).map((interest) => [interest.retreat_event_id, interest.status]));
  const eventBenefits = new Map(benefits.filter((benefit) => benefit.retreat_event_id).map((benefit) => [benefit.retreat_event_id, benefit]));
  const discoveryEvents = (events ?? []).filter((event) => event.invitation_only).map((event) => {
    const benefit = eventBenefits.get(event.id);
    const interestStatus = eventStates.get(event.id);
    const state: InnerSanctumEventState = benefit?.confirmed_booking_id ? "confirmed" : benefit?.response === "accepted" ? "accepted" : benefit ? "invited" : interestStatus === "selected" ? "selected" : interestStatus === "interested" ? "interested" : "interest";
    return { id: event.id, title: event.title, start_date: event.start_date, end_date: event.end_date, description: event.description, state };
  });

  return <div className="sanctum-home">
    <h1 className="sr-only">Inner Sanctum</h1>
    {byType("message").map((post) => <InnerSanctumPostRenderer post={post} key={post.id} />)}
    {byType("feature").map((post) => <InnerSanctumPostRenderer post={post} key={post.id} />)}
    {byType("drop").map((post) => <InnerSanctumPostRenderer post={post} key={post.id} />)}
    <InnerSanctumEventDiscovery events={discoveryEvents} />
    <section className="sanctum-task"><div className="sanctum-post-copy"><p className="sanctum-eyebrow">I have a job for you</p>{currentTask ? <><h2>{currentTask.title}</h2><Link className="sanctum-link" href={`/inner-sanctum/tasks/${currentTask.slug}`}>Tell me</Link></> : <><h2>Nothing I need from you right now.</h2><Link className="sanctum-link" href="/inner-sanctum/tasks">Things you&apos;ve told me</Link></>}</div></section>
    <section className="sanctum-discoveries" aria-labelledby="sanctum-discoveries-title">
      <p className="sanctum-eyebrow">Things you&apos;ve kept</p><h2 id="sanctum-discoveries-title">Your collection</h2>
      <p>Some things in here are meant to stay with you.</p><Link className="sanctum-link" href="/inner-sanctum/collection">Open my collection</Link>
    </section>
    <section className="sanctum-benefit"><div className="sanctum-post-copy"><p className="sanctum-eyebrow">Beyond the screen</p>{waiting ? <><h2>Something is waiting for you.</h2><div className="sanctum-prose"><p>{waiting.title}</p></div><Link className="sanctum-link" href="/inner-sanctum/benefits">See what&apos;s waiting</Link></> : <><h2>Nothing waiting right now.</h2><div className="sanctum-prose"><p>I&apos;ll leave it here when there is.</p></div></>}</div></section>
  </div>;
}
