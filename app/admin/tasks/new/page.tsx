import { createTask } from "@/app/admin/tasks/actions";
import { AdminTaskForm } from "@/components/admin-task-form";
export default function NewTaskPage() { return <><div className="admin-title"><div><p className="eyebrow">Tasks</p><h1>New task</h1></div></div><section className="admin-panel"><AdminTaskForm action={createTask} /></section></>; }
