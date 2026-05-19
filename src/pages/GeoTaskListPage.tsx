import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  addGeoTaskListTask,
  deleteGeoTaskListTask,
  ensureEditableGeoTaskListPlan,
  getGeoTaskListPlan,
  geoTaskListPhasesRef,
  geoTaskListTasksRef,
  getEditableGeoTaskListPlan,
  reorderGeoTaskListTasks,
  updateGeoTaskListTask,
} from "@/lib/firestore";
import { OWNER_ROLES, phaseTitle } from "@/lib/geo";
import { formatLoadError } from "@/lib/loadError";
import type { Phase, PlanType, Task } from "@/types";

type StatTone = "green" | "blue" | "amber" | "red";
type GeoTaskListPhase = Phase & { tasks: Task[] };

const statToneClasses: Record<StatTone, string> = {
  green: "before:bg-[#17b26a]",
  blue: "before:bg-[#2e90fa]",
  amber: "before:bg-[#f79009]",
  red: "before:bg-[#f04438]",
};

const inputClass = "input w-full px-[14px] py-3 !text-[14px]";
const taskGridColumns = "xl:grid-cols-[12%_calc(54%_-_32px)_16%_10%_8%]";
const planTabs: { id: PlanType; label: string }[] = [
  { id: "30", label: "30 Day Tasks" },
  { id: "60", label: "60 Day Tasks" },
  { id: "90", label: "90 Day Tasks" },
];

export function GeoTaskListPage() {
  const { clearLoadError, profile, reportLoadError } = useAuth();
  const [activePlan, setActivePlan] = useState<PlanType>("30");
  const [projectsCount, setProjectsCount] = useState(0);
  const [geoTaskListCounts, setGeoTaskListCounts] = useState<Record<PlanType, number>>({ "30": 0, "60": 0, "90": 0 });
  const [phases, setPhases] = useState<GeoTaskListPhase[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const canEditTemplate = profile?.role === "admin" || profile?.role === "super_admin";

  useEffect(() => {
    if (!profile) return;
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      clearLoadError("geo-task-list-projects");
      setProjectsCount(snapshot.size);
    }, (error) => {
      reportLoadError("geo-task-list-projects", formatLoadError("Projects", error));
    });
    return unsubscribe;
  }, [clearLoadError, profile, reportLoadError]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    async function loadCounts() {
      try {
        const planLoader = canEditTemplate ? getEditableGeoTaskListPlan : getGeoTaskListPlan;
        const plans = await Promise.all(planTabs.map((tab) => planLoader(tab.id)));
        if (cancelled) return;
        clearLoadError("geo-task-list-counts");
        setGeoTaskListCounts({
          "30": plans.find((plan) => plan.planType === "30")?.phases.reduce((total, phase) => total + phase.tasks.length, 0) || 0,
          "60": plans.find((plan) => plan.planType === "60")?.phases.reduce((total, phase) => total + phase.tasks.length, 0) || 0,
          "90": plans.find((plan) => plan.planType === "90")?.phases.reduce((total, phase) => total + phase.tasks.length, 0) || 0,
        });
      } catch (error) {
        if (!cancelled) reportLoadError("geo-task-list-counts", formatLoadError("GEO task list counts", error));
      }
    }
    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [activePlan, canEditTemplate, clearLoadError, phases, profile, reportLoadError]);

  useEffect(() => {
    if (!profile) return;
    let taskUnsubscribers: (() => void)[] = [];
    let phaseUnsubscribe: (() => void) | undefined;
    let cancelled = false;

    async function subscribeToPlan() {
      setPhases([]);
      try {
        if (canEditTemplate) await ensureEditableGeoTaskListPlan(activePlan);
      } catch (error) {
        reportLoadError("geo-task-list-plan", formatLoadError("GEO task list", error));
        return;
      }
      if (cancelled) return;
      phaseUnsubscribe = onSnapshot(query(geoTaskListPhasesRef(activePlan), orderBy("order")), (snapshot) => {
        clearLoadError("geo-task-list-plan");
        taskUnsubscribers.forEach((unsubscribe) => unsubscribe());
        taskUnsubscribers = [];
        const nextPhases = snapshot.docs.map((item) => {
          const data = item.data() as Phase;
          return {
            id: item.id,
            order: data.order,
            title: data.title,
            name: data.name,
            days: data.days,
            tasks: [],
          };
        });
        setPhases(nextPhases);
        taskUnsubscribers = nextPhases.map((phase) =>
          onSnapshot(query(geoTaskListTasksRef(activePlan, phase.id), orderBy("number")), (taskSnapshot) => {
            clearLoadError(`geo-task-list-tasks-${phase.id}`);
            const tasks = taskSnapshot.docs.map((item) => ({ id: item.id, ...item.data(), phaseId: phase.id, phaseOrder: phase.order }) as Task);
            setPhases((current) =>
              current.map((currentPhase) => (currentPhase.id === phase.id ? { ...currentPhase, tasks } : currentPhase)),
            );
          }, (error) => {
            reportLoadError(`geo-task-list-tasks-${phase.id}`, formatLoadError("GEO task list tasks", error));
          }),
        );
      }, (error) => {
        reportLoadError("geo-task-list-plan", formatLoadError("GEO task list phases", error));
      });
    }

    subscribeToPlan();
    return () => {
      cancelled = true;
      phaseUnsubscribe?.();
      taskUnsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [activePlan, canEditTemplate, clearLoadError, profile, reportLoadError]);

  const tasks = useMemo(
    () => phases.flatMap((phase) => phase.tasks.map((task) => ({ ...task, phaseTitle: phaseTitle(phase), phaseId: phase.id }))),
    [phases],
  );
  const totalGeoTaskListTasks = geoTaskListCounts["30"] + geoTaskListCounts["60"] + geoTaskListCounts["90"];
  const activePlanPhases = phases.length;

  async function patchTask(task: Task, field: keyof Task, value: string) {
    if (!canEditTemplate) return;
    await updateGeoTaskListTask(activePlan, { ...task, [field]: value });
  }

  async function handleReorder(sourceTaskId: string | null, targetTask: Task) {
    if (!canEditTemplate || !sourceTaskId || sourceTaskId === targetTask.id) return;
    const phase = phases.find((item) => item.id === targetTask.phaseId);
    const sourceTask = phase?.tasks.find((task) => task.id === sourceTaskId);
    if (!phase || !sourceTask) return;

    const withoutSource = phase.tasks.filter((task) => task.id !== sourceTaskId);
    const targetIndex = withoutSource.findIndex((task) => task.id === targetTask.id);
    const reorderedTasks = [...withoutSource.slice(0, targetIndex), sourceTask, ...withoutSource.slice(targetIndex)];
    await reorderGeoTaskListTasks(activePlan, phase.id, reorderedTasks);
  }

  async function handleAddTask() {
    if (!canEditTemplate) return;
    await addGeoTaskListTask(activePlan);
  }

  async function handleDeleteTask(task: Task) {
    if (!canEditTemplate) return;
    await deleteGeoTaskListTask(activePlan, task);
  }

  return (
    <AuthGuard>
      <DashboardLayout
        title="GEO Task List"
        description="Edit the master GEO task plans that new projects clone when they are created."
      >
        <div>
          <section className="mb-[18px] grid grid-cols-1 gap-4 xl:grid-cols-4">
            <StatCard label="GEO Task List Tasks" value={totalGeoTaskListTasks} hint="Reusable steps across all plans" tone="green" />
            <StatCard label="Active Plan Tasks" value={tasks.length} hint={`${activePlan}-day GEO task rows`} tone="blue" />
            <StatCard label="Projects Using Task List" value={projectsCount} hint="Existing projects keep their own copy" tone="amber" />
            <StatCard label="GEO Task List Phases" value={activePlanPhases} hint={`Sections in the ${activePlan}-day plan`} tone="red" />
          </section>

          <section className="rounded-[8px] border border-[#d7dfeb] bg-white p-[22px] shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
            <div className="mb-3.5 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
              <h3 className="text-lg font-bold text-[#070c11]">GEO Task List</h3>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {!canEditTemplate ? (
                  <span className="rounded-[8px] border border-[#d7dfeb] bg-[#f8fafc] px-3 py-2 text-sm font-semibold text-[#667085]">
                    View only
                  </span>
                ) : null}
                <div className="inline-flex items-center gap-1 rounded-[8px] border border-[#d7dfeb] bg-white p-[5px]" aria-label="GEO task list plan filter">
                  {planTabs.map((tab) => (
                    <button
                      className={
                        activePlan === tab.id
                          ? "rounded-[8px] bg-[#e8f8ef] px-3.5 py-2 text-sm font-semibold text-[#17b26a] transition duration-200 hover:-translate-y-px"
                          : "rounded-[8px] bg-transparent px-3.5 py-2 text-sm font-semibold text-[#475467] transition duration-200 hover:-translate-y-px"
                      }
                      key={tab.id}
                      onClick={() => setActivePlan(tab.id)}
                      type="button"
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button className="btn-primary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-60" disabled={!canEditTemplate} type="button" onClick={handleAddTask}>
                  Add Task
                </button>
              </div>
            </div>

            <div className={`mb-3 hidden rounded-[8px] border border-[#d7dfeb] bg-[#f8fafc] px-4 py-3 text-xs font-extrabold uppercase tracking-[0.08em] text-[#667085] xl:grid ${taskGridColumns} xl:gap-2`}>
              <span>Phase</span>
              <span>Task</span>
              <span>Owner / Dept</span>
              <span>Day Target</span>
              <span>Action</span>
            </div>

            <div className="grid gap-3">
              {tasks.map((task) => (
                <div
                  className={[
                    `grid items-start gap-2 rounded-[8px] border border-[#d7dfeb] bg-[#fcfdff] p-[14px] ${taskGridColumns}`,
                    draggedTaskId === task.id ? "opacity-70" : "",
                  ].join(" ")}
                  key={`${task.phaseId}-${task.id}`}
                  onDragOver={(event) => {
                    if (!canEditTemplate) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    if (!canEditTemplate) return;
                    event.preventDefault();
                    const sourceTaskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
                    handleReorder(sourceTaskId, task);
                    setDraggedTaskId(null);
                  }}
                >
                  <div className="rounded-[8px] bg-[#f2f4f7] px-3 py-2 text-sm font-bold text-[#475467]">{task.phaseTitle}</div>
                  <div className="grid gap-3">
                    <input className={`${inputClass} text-[15px] font-semibold disabled:cursor-not-allowed disabled:bg-[#f8fafc]`} disabled={!canEditTemplate} value={task.task} onChange={(event) => patchTask(task, "task", event.target.value)} placeholder="Task title" />
                    <textarea className={`${inputClass} min-h-[160px] resize-y font-mono leading-6 disabled:cursor-not-allowed disabled:bg-[#f8fafc]`} disabled={!canEditTemplate} value={task.howToExecute || ""} onChange={(event) => patchTask(task, "howToExecute", event.target.value)} placeholder="Task description" />
                    <div className="grid gap-3 md:grid-cols-2">
                      <input className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#f8fafc]`} disabled={!canEditTemplate} value={task.tools || ""} onChange={(event) => patchTask(task, "tools", event.target.value)} placeholder="Tools" />
                      <select className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#f8fafc]`} disabled={!canEditTemplate} value={task.dependencyNotes || ""} onChange={(event) => patchTask(task, "dependencyNotes", event.target.value)}>
                        <option value="">No dependency</option>
                        {tasks
                          .filter((dependencyTask) => dependencyTask.id !== task.id || dependencyTask.phaseId !== task.phaseId)
                          .map((dependencyTask) => (
                            <option key={`${dependencyTask.phaseId}-${dependencyTask.id}`} value={dependencyTask.task}>
                              {dependencyTask.task || `Task ${dependencyTask.number}`}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  <select className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#f8fafc]`} disabled={!canEditTemplate} value={task.owner || ""} onChange={(event) => patchTask(task, "owner", event.target.value)}>
                    <option value="">Select owner / dept</option>
                    {OWNER_ROLES.map((role) => <option key={role}>{role}</option>)}
                  </select>
                  <input className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#f8fafc]`} disabled={!canEditTemplate} value={task.dayTarget || ""} onChange={(event) => patchTask(task, "dayTarget", event.target.value)} placeholder="Day 1" />
                  <div className="flex items-center justify-center gap-2">
                    <button
                      aria-label={`Reorder ${task.task || "task"}`}
                      className="inline-flex h-[46px] w-[46px] cursor-grab items-center justify-center rounded-[8px] border border-[#c5d0de] bg-white text-[#344054] transition duration-200 hover:-translate-y-px active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!canEditTemplate}
                      draggable={canEditTemplate}
                      onDragEnd={() => setDraggedTaskId(null)}
                      onDragStart={(event) => {
                        if (!canEditTemplate) return;
                        setDraggedTaskId(task.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", task.id);
                      }}
                      title="Drag to reorder task"
                      type="button"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                        <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
                      </svg>
                    </button>
                    <button
                      aria-label={`Delete ${task.task || "task"}`}
                      className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-[8px] border border-[#ffd5d2] bg-white text-[#f04438] transition duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!canEditTemplate}
                      onClick={() => handleDeleteTask(task)}
                      type="button"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                        <path d="M4 7h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
                        <path d="M9 7V5.8C9 4.81 9.81 4 10.8 4h2.4C14.19 4 15 4.81 15 5.8V7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
                        <path d="M7 7l.8 11.2A2 2 0 0 0 9.79 20h4.42a2 2 0 0 0 1.99-1.8L17 7" fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round" strokeWidth="1.9" />
                        <path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {!tasks.length ? (
                <div className="rounded-[8px] border border-dashed border-[#c5d0de] bg-[#fbfcfe] p-[14px] text-[#667085]">
                  No {activePlan}-day GEO tasks yet. Add tasks here and future projects will clone them.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

function StatCard({ label, value, hint, tone = "blue" }: { label: string; value: number; hint: string; tone?: StatTone }) {
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
