import Link from "next/link";
import { getMyInnerSanctumTasks } from "@/lib/inner-sanctum-task-data";
import { isTaskOpen } from "@/lib/inner-sanctum-tasks";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";

export default async function TasksPage() {
  if (!await hasInnerSanctumAccess()) return <section className="inner-sanctum-boundary"><p className="eyebrow">Inner Sanctum</p><h1>This door isn&apos;t open for you yet.</h1><p>Inner Sanctum membership is required to enter.</p></section>;
  const tasks = await getMyInnerSanctumTasks(); const current = tasks.filter((task) => isTaskOpen(task) && !task.response_text); const past = tasks.filter((task) => Boolean(task.response_text));
  return <div className="sanctum-tasks-page"><header><p className="sanctum-eyebrow">Currently asking</p><h1>A little something for you.</h1></header><section aria-labelledby="current-tasks"><h2 className="sr-only" id="current-tasks">Currently asking</h2>{current.length ? current.map((task) => <article className="sanctum-task-list-item" key={task.id}><p className="sanctum-eyebrow">{task.eyebrow ?? "Currently asking"}</p><h2>{task.title}</h2><Link className="sanctum-link" href={`/inner-sanctum/tasks/${task.slug}`}>Tell me</Link></article>) : <p className="sanctum-neutral-state">Nothing I need from you right now.</p>}</section>{past.length ? <section className="sanctum-tasks-past"><p className="sanctum-eyebrow">Past</p>{past.map((task) => <article className="sanctum-task-list-item" key={task.id}><h2>{task.title}</h2><p>{task.acknowledged_at ? "Seen." : "Sent."}</p><Link className="sanctum-link" href={`/inner-sanctum/tasks/${task.slug}`}>Read again</Link></article>)}</section> : null}</div>;
}
