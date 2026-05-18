import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TeamDirectory } from "@/components/TeamDirectory";
import { useState } from "react";

export function TeamMembersPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <AuthGuard>
      <DashboardLayout
        title="Team Members"
        description="Manage the shared team directory, including current and former members."
        actions={
          <button className="btn-primary" type="button" onClick={() => setIsCreateOpen(true)}>
            Add team member
          </button>
        }
      >
        <TeamDirectory isCreateOpen={isCreateOpen} onCreateOpenChange={setIsCreateOpen} />
      </DashboardLayout>
    </AuthGuard>
  );
}
