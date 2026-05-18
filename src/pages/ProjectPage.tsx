import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TaskTableEditor } from "@/components/TaskTableEditor";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { updateProjectActivePlan } from "@/lib/firestore";
import { formatLoadError } from "@/lib/loadError";
import type { PlanType, Project } from "@/types";

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const { clearLoadError, reportLoadError } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [planType, setPlanType] = useState<PlanType>("30");
  const hydratedProjectIdRef = useRef("");

  useEffect(() => {
    if (!projectId) return undefined;
    hydratedProjectIdRef.current = "";
    const unsubscribe = onSnapshot(doc(db, "projects", projectId), (snapshot) => {
      clearLoadError("project-detail");
      if (!snapshot.exists()) {
        setProject(null);
        return;
      }
      const nextProject = { id: snapshot.id, ...snapshot.data() } as Project;
      setProject(nextProject);
      if (hydratedProjectIdRef.current !== snapshot.id) {
        setPlanType(nextProject.activePlanType || "30");
        hydratedProjectIdRef.current = snapshot.id;
      }
    }, (error) => {
      reportLoadError("project-detail", formatLoadError("Project details", error));
    });
    return unsubscribe;
  }, [clearLoadError, projectId, reportLoadError]);

  async function handlePlanSelect(type: PlanType) {
    setPlanType(type);
    await updateProjectActivePlan(projectId, type);
  }

  return (
    <AuthGuard>
      <DashboardLayout
        title={project?.name || "GEO Workspace"}
        description="Manage team ownership, plan execution, links, notes, and spreadsheet handoffs."
        actions={project ? <Link className="btn-secondary h-12 px-5" to={`/projects/${projectId}/edit`}>Edit Project</Link> : undefined}
      >
        {!project ? (
          <section className="panel p-6">
            <h1 className="text-xl font-semibold">Project not found</h1>
            <Link className="btn-secondary mt-4" to="/projects/">Back to workspaces</Link>
          </section>
        ) : (
          <div className="grid gap-6">
            <TaskTableEditor planType={planType} projectId={projectId} onPlanSelect={handlePlanSelect} />
          </div>
        )}
      </DashboardLayout>
    </AuthGuard>
  );
}
