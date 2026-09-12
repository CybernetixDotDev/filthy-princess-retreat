import { transitionInnerSanctumMembership } from "@/app/admin/members/actions";
import { requireAdmin } from "@/lib/auth";
import type { InnerSanctumAdminMember } from "@/lib/database.types";

function actionFor(member: InnerSanctumAdminMember) {
  if (!member.membership_status || member.membership_status === "cancelled") {
    return [{ value: "grant", label: member.membership_status ? "Reactivate" : "Grant lifetime" }] as const;
  }
  if (member.membership_status === "suspended") {
    return [
      { value: "restore", label: "Restore" },
      { value: "cancel", label: "Cancel" },
    ] as const;
  }
  return [
    { value: "suspend", label: "Suspend" },
    { value: "cancel", label: "Cancel" },
  ] as const;
}

export default async function AdminMembersPage() {
  const state = await requireAdmin();
  if (!state) return null;

  const { data, error } = await state.supabase.rpc("admin_list_inner_sanctum_members");
  if (error) throw new Error("Inner Sanctum members could not be loaded.");
  const members = data ?? [];

  return (
    <section>
      <div className="admin-title">
        <div>
          <p className="eyebrow">Inner Sanctum</p>
          <h1>Members</h1>
        </div>
      </div>
      <div className="admin-panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Membership</th><th>Source</th><th>Started</th><th>Actions</th></tr></thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id}>
                  <td><strong>{member.email ?? "Email unavailable"}</strong><br /><small>{member.user_id}</small></td>
                  <td><span className={`status ${member.membership_status ?? "none"}`}>{member.membership_status ?? "none"}</span></td>
                  <td>{member.membership_source ?? "—"}</td>
                  <td>{member.started_at ? new Date(member.started_at).toLocaleDateString("en-ZA") : "—"}</td>
                  <td>
                    <div className="admin-row-actions">
                      {actionFor(member).map((action) => (
                        <form action={transitionInnerSanctumMembership} key={action.value}>
                          <input name="user_id" type="hidden" value={member.user_id} />
                          <input name="membership_action" type="hidden" value={action.value} />
                          <button className={action.value === "grant" || action.value === "restore" ? "button small" : "button secondary small"} type="submit">{action.label}</button>
                        </form>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 ? <tr><td colSpan={5}>No Auth users were found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
