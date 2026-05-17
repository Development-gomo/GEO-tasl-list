import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { UserManagement } from "@/components/UserManagement";

export function AdminPage() {
  return (
    <AuthGuard>
      <DashboardLayout
        title="User Management"
        description="Review users and manage access according to your role."
      >
        <UserManagement />
      </DashboardLayout>
    </AuthGuard>
  );
}
