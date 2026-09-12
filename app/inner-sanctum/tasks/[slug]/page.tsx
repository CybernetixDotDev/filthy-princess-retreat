import Link from "next/link";
import { notFound } from "next/navigation";
import { submitTaskResponse } from "@/app/actions/inner-sanctum-tasks";
import { SubmitButton } from "@/components/submit-button";
import { getMyInnerSanctumTask } from "@/lib/inner-sanctum-task-data";
import { INNER_SANCTUM_TASK_RESPONSE_MAX, isTaskOpen } from "@/lib/inner-sanctum-tasks";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";

export default async function TaskPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!await hasInnerSanctumAccess()) return <section className="inner-sanctum-boundary"><p className="eyebrow">Inner Sanctum</p><h1>This door isn&apos;t open for you yet.</h1><p>Inner Sanctum membership is required to enter.</p><Link className="text-link" href="/store">Visit the store</Link></section>;
  const { slug } = await params; const task = await getMyInnerSanctumTask(slug); if (!task) notFound(); const open = isTaskOpen(task);
  return <article className="sanctum-task-detail"><p className="sanctum-eyebrow">{task.eyebrow ?? "From Cally"}</p><h1>{task.title}</h1><div className="sanctum-prose">{task.body.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div><blockquote>{task.prompt}</blockquote>
    {task.response_text ? <section className="sanctum-task-sent"><p className="sanctum-eyebrow">Got it.</p><p>I&apos;ll keep this.</p><blockquote>{task.response_text}</blockquote>{task.acknowledged_at ? <p className="sanctum-response">Seen.</p> : null}</section> : open ? <form action={submitTaskResponse.bind(null, task.id, task.slug)} className="sanctum-task-response"><label htmlFor="response_text">Your response</label><textarea id="response_text" name="response_text" maxLength={INNER_SANCTUM_TASK_RESPONSE_MAX} rows={9} required /><SubmitButton>Send this to Cally</SubmitButton></form> : <p className="sanctum-neutral-state">This one is closed.</p>}
  </article>;
}
