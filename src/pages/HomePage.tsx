import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProjectList } from "@/components/ProjectList";

export function HomePage() {
  return (
    <AuthGuard>
      <DashboardLayout
        title="Project Dashboard"
        description="Review active, completed, and upcoming projects across the portfolio."
      >
        <ProjectList />
      </DashboardLayout>
    </AuthGuard>
  );
}
