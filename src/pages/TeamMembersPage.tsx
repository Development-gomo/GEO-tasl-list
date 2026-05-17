import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TeamDirectory } from "@/components/TeamDirectory";

export function TeamMembersPage() {
  return (
    <AuthGuard>
      <DashboardLayout
        title="Team Members"
        description="Manage the shared team directory, including current and former members."
      >
        <TeamDirectory />
      </DashboardLayout>
    </AuthGuard>
  );
}
