import { requirePageUser } from "@/lib/auth";
import { UserNav } from "@/components/workspace-nav";
import { getUserWorkspace } from "@/lib/queries";

export const dynamic = "force-dynamic";
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("/me");
  const workspace = await getUserWorkspace(user.id);
  const activeAssignments = workspace.assignments.filter(({ match }) => match.status !== "PUBLISHED");
  const counts = {
    applications: workspace.applications.filter(({ application }) => application.status === "PENDING").length,
    assignments: activeAssignments.length,
    notifications: workspace.unreadNotificationCount,
    teams: workspace.invites.filter((invite) => invite.status === "PENDING").length
  };
  return <div className="page-wrap workspace-shell"><UserNav counts={counts} /><div className="min-w-0" id="workspace-content">{children}</div></div>;
}
