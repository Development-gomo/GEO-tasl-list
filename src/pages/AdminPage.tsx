import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { UserManagement } from "@/components/UserManagement";
import { useState } from "react";

export function AdminPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <AuthGuard>
      <DashboardLayout
        title="User Management"
        description="Review users and manage access according to your role."
        actions={
          <button className="btn-primary" type="button" onClick={() => setIsCreateOpen(true)}>
            Add new user
          </button>
        }
      >
        <UserManagement isCreateOpen={isCreateOpen} onCreateOpenChange={setIsCreateOpen} />
      </DashboardLayout>
    </AuthGuard>
  );
}
