import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { templateTasks } from "@/lib/geo";
import { formatLoadError } from "@/lib/loadError";
import type { PlanType, Project } from "@/types";

type ProjectFilter = "active" | "completed" | "upcoming";
type StatTone = "green" | "blue" | "amber" | "red";

const statToneClasses: Record<StatTone, string> = {
  green: "before:bg-[#17b26a]",
  blue: "before:bg-[#2e90fa]",
  amber: "before:bg-[#f79009]",
  red: "before:bg-[#f04438]",
};

export function ProjectList() {
  const { clearLoadError, reportLoadError } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<ProjectFilter>("active");

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "projects"), orderBy("updatedAt", "desc")), (snapshot) => {
      clearLoadError("projects");
      setProjects(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Project));
    }, (error) => {
      reportLoadError("projects", formatLoadError("Projects", error));
    });
    return unsubscribe;
  }, [clearLoadError, reportLoadError]);

  const projectStatus = (project: Project): ProjectFilter => {
    if (project.status === "completed" || (project.progress?.[project.activePlanType || "30"]?.pct || 0) >= 100) return "completed";
    if (project.status === "upcoming") return "upcoming";
    return "active";
  };
  const activeProjects = projects.filter((project) => projectStatus(project) === "active");
  const completedProjects = projects.filter((project) => projectStatus(project) === "completed");
  const upcomingProjects = projects.filter((project) => projectStatus(project) === "upcoming");
  const filteredProjects = filter === "completed" ? completedProjects : filter === "upcoming" ? upcomingProjects : activeProjects;

  return (
    <div>
      <section className="mb-[18px] grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard label="Active Projects" value={activeProjects.length} hint="Currently in motion" tone="blue" />
        <MetricCard label="Completed Projects" value={completedProjects.length} hint="Finished deliveries" tone="green" />
        <MetricCard label="Upcoming Projects" value={upcomingProjects.length} hint="Queued to kick off" tone="amber" />
        <MetricCard label="Total Projects" value={projects.length} hint="Across this app" tone="red" />
      </section>

      <section className="rounded-[8px] border border-[#d7dfeb] bg-white p-[22px] shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
        <div className="mb-[18px] flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="mb-2 text-[0.78rem] font-extrabold uppercase tracking-[0.12em] text-[#17b26a]">Project Grid</p>
            <h2 className="m-0 text-[18px] leading-[1.25] font-bold text-[#070c11]">All created projects</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-1 rounded-[8px] border border-[#d7dfeb] bg-white p-[5px]" aria-label="Project status filter">
              {([
                { id: "active", label: "Active" },
                { id: "completed", label: "Completed" },
                { id: "upcoming", label: "Upcoming" },
              ] as { id: ProjectFilter; label: string }[]).map((item) => (
                <button
                  className={filter === item.id
                    ? "rounded-[8px] bg-[#e8f8ef] px-3.5 py-2 text-sm font-semibold text-[#17b26a] transition duration-200 hover:-translate-y-px"
                    : "rounded-[8px] bg-transparent px-3.5 py-2 text-sm font-semibold text-[#475467] transition duration-200 hover:-translate-y-px"}
                  key={item.id}
                  onClick={() => setFilter(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Link className="inline-flex items-center justify-center rounded-[8px] bg-[#17b26a] px-4 py-2.5 text-sm font-semibold text-white no-underline shadow-[0_10px_20px_rgba(23,178,106,0.16)] transition duration-200 hover:-translate-y-px" to="/projects/new">
              Add New Project
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {filteredProjects.map((project) => {
            const status = projectStatus(project);
            const planSummaries = (["30", "60", "90"] as PlanType[]).map((planType) => {
              const progress = project.progress?.[planType];
              const fallbackTotal = templateTasks(planType).length;
              const hasEnabledTemplateTasks = planType !== "90" || fallbackTotal > 0;
              return {
                planType,
                totalTasks: hasEnabledTemplateTasks ? progress?.total ?? fallbackTotal : 0,
                doneTasks: hasEnabledTemplateTasks ? progress?.done ?? 0 : 0,
              };
            });
            return (
              <article className="grid min-h-[220px] gap-4 rounded-[8px] border border-[#d7dfeb] bg-gradient-to-b from-[rgba(255,255,255,0.98)] to-[rgba(248,250,252,0.98)] p-[18px]" key={project.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={[
                      "inline-flex items-center justify-center rounded-[8px] px-[11px] py-[7px] text-[0.82rem] font-extrabold capitalize",
                      status === "completed" ? "bg-[#eff8ff] text-[#175cd3]" : status === "upcoming" ? "bg-[#fffaeb] text-[#b54708]" : "bg-[#ecfdf3] text-[#067647]",
                    ].join(" ")}>
                      {status}
                    </span>
                    <span className="inline-flex items-center justify-center rounded-[8px] bg-[#f2f4f7] px-3 py-2 text-[0.84rem] font-bold text-[#475467]">
                      {project.teamMemberCount || 0} team
                    </span>
                  </div>
                  <Link className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#d7dfeb] bg-white text-[#475467] no-underline transition duration-200 hover:-translate-y-px hover:border-[rgba(23,178,106,0.3)] hover:text-[#17b26a] hover:shadow-[0_8px_16px_rgba(16,24,40,0.08)]" to={`/projects/${project.id}/edit`} aria-label={`Edit ${project.name}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]">
                      <path d="M4 20h4l9.8-9.8-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="m12.8 6.2 4 4 1.8-1.8a1.9 1.9 0 0 0 0-2.8l-1.2-1.2a1.9 1.9 0 0 0-2.8 0l-1.8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </div>

                <div>
                  <h3 className="mb-2.5 text-[20px] leading-[1.25] font-bold text-[#070c11]">{project.name}</h3>
                  <p className="m-0 text-[0.95rem] text-[#667085]">{project.description || "No project description added yet."}</p>
                </div>

                <div className="grid gap-3 border-t border-[#d7dfeb] pt-3.5">
                  <div className="grid grid-cols-3 gap-2 text-[0.84rem] text-[#667085]">
                    {planSummaries.map((summary) => (
                      <div className="" key={summary.planType}>
                        <strong className="mb-1 block text-sm font-bold text-[#070c11]">{summary.planType} days plan</strong>
                        <span className="block">{summary.totalTasks} tasks</span>
                        <span className="block">{summary.doneTasks} completed</span>
                      </div>
                    ))}
                  </div>
                  <Link className="inline-flex items-center justify-center rounded-[8px] border border-[#d7dfeb] bg-white px-4 py-2.5 text-sm font-semibold text-[#344054] no-underline transition duration-200 hover:-translate-y-px hover:border-[rgba(23,178,106,0.3)] hover:text-[#17b26a]" to={`/projects/${project.id}`}>
                    View Tasks
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        {!filteredProjects.length && (
          <div className="rounded-[8px] border border-dashed border-[#c5d0de] bg-[#fbfcfe] p-4 text-[#667085]">
            No {filter} projects yet.
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, hint, tone = "blue" }: { label: string; value: number; hint: string; tone?: StatTone }) {
  return (
    <article className={[
      "relative overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white px-5 py-[18px] shadow-[0_8px_24px_rgba(16,24,40,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-['']",
      statToneClasses[tone] || "before:bg-[#d0d5dd]",
    ].join(" ")}>
      <p className="mb-3.5 text-sm font-semibold text-[#475467]">{label}</p>
      <strong className="mb-1 block text-[36px] leading-none font-semibold text-[#070c11]">{value}</strong>
      <span className="text-sm text-[#667085]">{hint}</span>
    </article>
  );
}
