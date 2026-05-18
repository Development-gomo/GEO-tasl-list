import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";
import { phaseTitle, progressForTasks } from "@/lib/geo";
import { deleteTask, recordImportExport, updatePlanProgress, updateTask } from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";
import { formatLoadError } from "@/lib/loadError";
import type { Phase, PlanType, Task, TeamMember } from "@/types";

const statuses = ["To Do", "In Progress", "Blocked", "Done"] as const;

export function TaskTableEditor({
  projectId,
  planType,
  disabled = false,
  onPlanSelect,
}: {
  projectId: string;
  planType: PlanType;
  disabled?: boolean;
  onPlanSelect?: (type: PlanType) => Promise<void> | void;
}) {
  const { clearLoadError, firebaseUser, reportLoadError } = useAuth();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activePhaseId, setActivePhaseId] = useState<string>("");
  const [expandedTaskKey, setExpandedTaskKey] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPhases([]);
    setTasks([]);
    setActivePhaseId("");
    setExpandedTaskKey("");
  }, [planType, projectId]);

  useEffect(() => {
    if (disabled) return;
    const unsubscribe = onSnapshot(query(collection(db, "projects", projectId, "plans", planType, "phases"), orderBy("order")), (snapshot) => {
      clearLoadError("project-task-phases");
      const nextPhases = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Phase);
      setPhases(nextPhases);
      setActivePhaseId((current) => {
        if (current && nextPhases.some((phase) => phase.id === current)) return current;
        return nextPhases[0]?.id || "";
      });
    }, (error) => {
      reportLoadError("project-task-phases", formatLoadError("Project task phases", error));
    });
    return unsubscribe;
  }, [clearLoadError, disabled, planType, projectId, reportLoadError]);

  useEffect(() => {
    if (disabled || !phases.length) {
      setTasks([]);
      return;
    }
    const unsubscribers = phases.map((phase) =>
      onSnapshot(query(collection(db, "projects", projectId, "plans", planType, "phases", phase.id, "tasks"), orderBy("number")), (snapshot) => {
        clearLoadError(`project-tasks-${phase.id}`);
        const phaseTasks = snapshot.docs.map((item) => ({ ...item.data(), id: item.id, phaseId: phase.id, phaseOrder: phase.order }) as Task);
        setTasks((current) => {
          const other = current.filter((task) => task.phaseId !== phase.id);
          return [...other, ...phaseTasks].sort((a, b) => a.phaseOrder - b.phaseOrder || Number(a.number) - Number(b.number));
        });
      }, (error) => {
        reportLoadError(`project-tasks-${phase.id}`, formatLoadError("Project tasks", error));
      }),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [clearLoadError, disabled, phases, planType, projectId, reportLoadError]);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "projects", projectId, "teamMembers"), orderBy("name")), (snapshot) => {
      clearLoadError("project-task-members");
      setMembers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TeamMember));
    }, (error) => {
      reportLoadError("project-task-members", formatLoadError("Project team members", error));
    });
    return unsubscribe;
  }, [clearLoadError, projectId, reportLoadError]);

  useEffect(() => {
    if (!disabled && tasks.length) updatePlanProgress(projectId, planType, tasks);
  }, [disabled, planType, projectId, tasks]);

  const selectedPhaseId = activePhaseId || phases[0]?.id || "";
  const visibleTasks = useMemo(() => (!selectedPhaseId ? tasks : tasks.filter((task) => task.phaseId === selectedPhaseId)), [selectedPhaseId, tasks]);
  const progress = progressForTasks(tasks);
  const activePhase = phases.find((phase) => phase.id === selectedPhaseId);
  const activePhaseTasks = activePhase ? tasks.filter((task) => task.phaseId === activePhase.id) : tasks;
  const activeProgress = progressForTasks(activePhaseTasks);

  async function patchTask(task: Task, field: keyof Task, value: string) {
    const nextTask = { ...task, [field]: value };
    setTasks((current) => current.map((item) => (item.id === task.id && item.phaseId === task.phaseId ? nextTask : item)));
    await updateTask(projectId, planType, nextTask);
  }

  async function handleDeleteTask(task: Task) {
    const confirmed = window.confirm(`Delete Task ${task.number}: ${task.task || "Untitled task"}?`);
    if (!confirmed) return;
    setTasks((current) => current.filter((item) => !(item.id === task.id && item.phaseId === task.phaseId)));
    setExpandedTaskKey((current) => (current === `${task.phaseId}-${task.id}` ? "" : current));
    await deleteTask(projectId, planType, task);
  }

  async function exportSheet() {
    const rows = tasks.map((task) => ({
      Plan: `${planType}-Day Plan`,
      Chapter: phaseTitle(phases.find((phase) => phase.id === task.phaseId) || { title: task.phaseId, name: "" }),
      "Day Target": task.dayTarget,
      "Task #": task.number,
      Category: task.category,
      Task: task.task,
      "How to Execute": task.howToExecute,
      Tools: task.tools,
      "Dependency / Notes": task.dependencyNotes,
      Owner: task.owner,
      Notes: task.notes || "",
      Status: task.status,
      "External To-do Link": task.externalTodoLink,
      "Google Drive Link": task.googleDriveLink,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${planType}-Day Plan`);
    XLSX.writeFile(workbook, `geo-${projectId}-${planType}-day-plan.xlsx`);
    if (firebaseUser) {
      await recordImportExport(projectId, {
        planType,
        kind: "export",
        filename: `geo-${projectId}-${planType}-day-plan.xlsx`,
        rows: rows.length,
        createdBy: firebaseUser.uid,
      });
    }
  }

  async function importSheet(file: File) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const first = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(first);
    let updatedRows = 0;
    for (const row of rows) {
      const number = String(row["Task #"] || "").trim();
      const task = tasks.find((item) => item.number === number);
      if (!task) continue;
      const nextTask: Task = {
        ...task,
        status: statuses.includes(row.Status as Task["status"]) ? row.Status as Task["status"] : task.status,
        owner: row.Owner ?? task.owner,
        notes: row.Notes ?? task.notes ?? "",
        externalTodoLink: row["External To-do Link"] ?? task.externalTodoLink,
        googleDriveLink: row["Google Drive Link"] ?? task.googleDriveLink,
      };
      await updateTask(projectId, planType, nextTask);
      updatedRows += 1;
    }
    if (firebaseUser) {
      await recordImportExport(projectId, {
        planType,
        kind: "import",
        filename: file.name,
        rows: rows.length,
        updatedRows,
        createdBy: firebaseUser.uid,
      });
    }
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const worksheet = XLSX.utils.json_to_sheet(parsed.data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CSV");
    const csvFile = new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], file.name);
    await importSheet(csvFile);
  }

  if (disabled) {
    return (
      <section className="panel grid min-h-64 place-items-center p-6 text-center">
        <div>
          <span className="badge bg-amber-50 text-amber-700">Coming soon</span>
          <h2 className="mt-4 text-xl font-semibold">90-day plan is locked</h2>
          <p className="mt-2 text-sm text-[#65728a]">The data model is ready for it, but the task template is not enabled yet.</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="panel overflow-hidden">
        <ProjectTaskOverview
          activePhase={activePhase}
          planType={planType}
          progress={activeProgress}
          onPlanSelect={onPlanSelect}
        />
        <div className="flex flex-col justify-between gap-4 border-b border-[#d6deeb] p-5 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-xl font-bold">{planType}-day task plan</h2>
            <p className="text-sm text-[#65728a]">{progress.done}/{progress.total} complete, {progress.pct}% progress</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input w-[350px] max-w-full" value={selectedPhaseId} onChange={(event) => setActivePhaseId(event.target.value)}>
              {phases.map((phase) => <option key={phase.id} value={phase.id}>{phaseTitle(phase)}</option>)}
            </select>
            <button className="btn-secondary" type="button" onClick={() => fileRef.current?.click()}>Upload edited sheet</button>
            <button className="btn-primary" type="button" onClick={exportSheet}>Export Excel</button>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                if (file.name.endsWith(".csv")) importCsv(file);
                else importSheet(file);
              }}
            />
          </div>
        </div>
      </section>
      <div className="grid gap-4">
        {visibleTasks.map((task) => {
          const taskKey = `${task.phaseId}-${task.id}`;
          return (
            <TaskAccordionCard
              expanded={expandedTaskKey === taskKey}
              key={taskKey}
              members={members}
              task={task}
              onDelete={handleDeleteTask}
              onPatch={patchTask}
              onToggle={() => setExpandedTaskKey((current) => (current === taskKey ? "" : taskKey))}
            />
          );
        })}
        {!visibleTasks.length ? (
          <div className="rounded-[8px] border border-[#d6deeb] bg-white px-6 py-10 text-center text-sm text-[#65728a]">
            No tasks found for this phase.
          </div>
        ) : null}
      </div>
    </>
  );
}

function TaskAccordionCard({
  expanded,
  members,
  task,
  onDelete,
  onPatch,
  onToggle,
}: {
  expanded: boolean;
  members: TeamMember[];
  task: Task;
  onDelete: (task: Task) => Promise<void>;
  onPatch: (task: Task, field: keyof Task, value: string) => Promise<void>;
  onToggle: () => void;
}) {
  const ownerLabel = ownerName(task.owner, members);
  const checked = task.status === "Done";
  const [editingSection, setEditingSection] = useState<"howToExecute" | "tools" | "dependencyNotes" | "links" | null>(null);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <article className={`rounded-[8px] border bg-white shadow-[0_2px_8px_rgba(16,24,40,0.04)] ${expanded ? "border-[#1b22ff]" : "border-[#d3deeb]"}`}>
      <div className={`grid gap-4 p-5 ${expanded ? "border-b border-[#d6deeb]" : ""} md:grid-cols-[36px_minmax(0,1fr)_84px]`}>
        <button
          className={`mt-1 flex h-7 w-7 items-center justify-center rounded-[8px] border-2 ${checked ? "border-[#1115ff] bg-[#1115ff] text-white" : "border-[#b8c6d4] bg-white text-transparent"}`}
          type="button"
          aria-label={`Mark task ${task.number} ${checked ? "to do" : "done"}`}
          onClick={() => onPatch(task, "status", checked ? "To Do" : "Done")}
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m4.5 10.2 3.3 3.3 7.7-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold tracking-[0.12em] text-[#53627a] uppercase">Task {task.number}</span>
            {task.edited ? <span className="rounded-full bg-[#fff0d6] px-3 py-1 text-[10px] font-bold tracking-[0.12em] text-[#924f00] uppercase">Edited</span> : null}
          </div>
          {isTitleEditing ? (
            <input
              className="input mt-1 min-h-[42px] w-full text-[16px] font-medium"
              value={task.task}
              onChange={(event) => onPatch(task, "task", event.target.value)}
              onBlur={() => setIsTitleEditing(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setIsTitleEditing(false);
                if (event.key === "Escape") setIsTitleEditing(false);
              }}
              autoFocus
            />
          ) : (
            <div className="mt-1 text-[16px] leading-[1.35] font-medium text-[#070c11]">{task.task}</div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <TaskBadge tone="status">{task.status}</TaskBadge>
            {task.category ? <TaskBadge tone="category">{task.category}</TaskBadge> : null}
            <TaskBadge tone="owner">{ownerLabel}</TaskBadge>
          </div>
        </div>

        <div className="relative grid justify-items-end gap-3">
          <button className="grid h-[40px] w-[40px] place-items-center rounded-full border border-[#b8c6d4] bg-white text-[#1d2b3d]" type="button" aria-label={expanded ? "Collapse task" : "Expand task"} onClick={onToggle}>
            <svg className={`h-6 w-6 transition ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className={`grid h-[40px] w-[40px] place-items-center rounded-full border bg-white text-[#53627a] ${isMenuOpen ? "border-[#4f7edb] ring-2 ring-[#4f7edb]" : "border-[#b8c6d4]"}`}
            type="button"
            aria-label={`Open task ${task.number} menu`}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 12h.01M12 12h.01M17.5 12h.01" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
          {isMenuOpen ? (
            <div className="absolute top-[136px] right-0 z-20 grid w-[220px] gap-1 rounded-[18px] border border-[#d6deeb] bg-white p-3 shadow-[0_18px_40px_rgba(16,24,40,0.16)]">
              <button
                className="flex items-center gap-3 rounded-[8px] px-3 py-3 text-left text-base font-semibold text-[#070c11] hover:bg-[#f4f6fa]"
                type="button"
                onClick={() => {
                  setIsTitleEditing(true);
                  setIsMenuOpen(false);
                }}
              >
                <MenuEditIcon />
                <span>Edit task</span>
              </button>
              <button
                className="flex items-center gap-3 rounded-[8px] px-3 py-3 text-left text-base font-semibold text-[#b42318] hover:bg-[#fff5f4]"
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onDelete(task);
                }}
              >
                <MenuDeleteIcon />
                <span>Delete task</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="grid gap-7 px-5 py-7 md:px-12">
          <TaskDetailSection
            editing={editingSection === "howToExecute"}
            title="How to execute"
            onEdit={() => setEditingSection((current) => (current === "howToExecute" ? null : "howToExecute"))}
          >
            {editingSection === "howToExecute" ? (
              <textarea className="input min-h-[240px] w-full resize-y leading-7" value={task.howToExecute} onChange={(event) => onPatch(task, "howToExecute", event.target.value)} />
            ) : (
              <DisplayText value={task.howToExecute} fallback="No execution guidance added" />
            )}
          </TaskDetailSection>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              <span>Status</span>
              <select className="input min-h-[46px]" value={task.status} onChange={(event) => onPatch(task, "status", event.target.value)}>
                {statuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Owner</span>
              <select className="input min-h-[46px]" value={task.owner} onChange={(event) => onPatch(task, "owner", event.target.value)}>
                <option value="">Unassigned</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name || member.email} ({member.role})</option>)}
              </select>
            </label>
          </div>

          <TaskDetailSection
            editing={editingSection === "tools"}
            title="Tools"
            onEdit={() => setEditingSection((current) => (current === "tools" ? null : "tools"))}
          >
            {editingSection === "tools" ? (
              <input className="input min-h-[46px] w-full" value={task.tools} onChange={(event) => onPatch(task, "tools", event.target.value)} placeholder="Tools" />
            ) : (
              <DisplayText value={task.tools} fallback="No tools added" />
            )}
          </TaskDetailSection>

          <TaskDetailSection
            editing={editingSection === "dependencyNotes"}
            title="Dependency / Notes"
            onEdit={() => setEditingSection((current) => (current === "dependencyNotes" ? null : "dependencyNotes"))}
          >
            {editingSection === "dependencyNotes" ? (
              <textarea className="input min-h-[110px] w-full resize-y" value={task.dependencyNotes} onChange={(event) => onPatch(task, "dependencyNotes", event.target.value)} />
            ) : (
              <DisplayText value={task.dependencyNotes} fallback="No prior steps" />
            )}
          </TaskDetailSection>

          <TaskDetailSection
            editing={editingSection === "links"}
            title="Links"
            onEdit={() => setEditingSection((current) => (current === "links" ? null : "links"))}
          >
            {editingSection === "links" ? (
              <div className="grid">
                <label className="grid gap-1.5 text-sm text-[#53627a] md:grid-cols-[72px_minmax(0,1fr)] md:items-center">
                  <span>To-do</span>
                  <input className="input min-h-[46px]" value={task.externalTodoLink} onChange={(event) => onPatch(task, "externalTodoLink", event.target.value)} placeholder="No to-do link added" />
                </label>
                <label className="grid gap-1.5 text-sm text-[#53627a] md:grid-cols-[72px_minmax(0,1fr)] md:items-center">
                  <span>Drive</span>
                  <input className="input min-h-[46px]" value={task.googleDriveLink} onChange={(event) => onPatch(task, "googleDriveLink", event.target.value)} placeholder="No Drive link added" />
                </label>
              </div>
            ) : (
              <div className="grid gap-4 text-sm text-[#1d2b3d]">
                <div className="grid gap-1.5 md:grid-cols-[72px_minmax(0,1fr)]">
                  <span className="font-semibold text-[#53627a]">To-do</span>
                  <span>{task.externalTodoLink || "No to-do link added"}</span>
                </div>
                <div className="grid gap-1.5 md:grid-cols-[72px_minmax(0,1fr)]">
                  <span className="font-semibold text-[#53627a]">Drive</span>
                  <span>{task.googleDriveLink || "No Drive link added"}</span>
                </div>
              </div>
            )}
          </TaskDetailSection>
        </div>
      ) : null}
    </article>
  );
}

function TaskDetailSection({
  children,
  editing,
  title,
  onEdit,
}: {
  children: React.ReactNode;
  editing: boolean;
  title: string;
  onEdit: () => void;
}) {
  return (
    <section className="grid">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-bold tracking-[0.12em] text-[#000000] uppercase">{title}</p>
        <button
          className={`grid h-9 w-9 place-items-center rounded-full border bg-white transition ${editing ? "border-[#1115ff] text-[#1115ff]" : "border-[#b8c6d4] text-[#1d2b3d] hover:border-[#1115ff] hover:text-[#1115ff]"}`}
          type="button"
          aria-label={`${editing ? "Close editor for" : "Edit"} ${title}`}
          onClick={onEdit}
        >
          <EditIcon />
        </button>
      </div>
      {children}
    </section>
  );
}

function DisplayText({ fallback, value }: { fallback: string; value: string }) {
  return (
    <div className="whitespace-pre-line text-[15px] leading-8 text-[#1d2b3d]">
      {value.trim() || fallback}
    </div>
  );
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l9.8-9.8-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="m12.8 6.2 4 4 1.8-1.8a1.9 1.9 0 0 0 0-2.8l-1.2-1.2a1.9 1.9 0 0 0-2.8 0l-1.8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    </svg>
  );
}

function MenuEditIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l9.8-9.8-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="m12.8 6.2 4 4 1.8-1.8a1.9 1.9 0 0 0 0-2.8l-1.2-1.2a1.9 1.9 0 0 0-2.8 0l-1.8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    </svg>
  );
}

function MenuDeleteIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9 7V5.8C9 4.81 9.81 4 10.8 4h2.4C14.19 4 15 4.81 15 5.8V7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M7 7l.8 11.2A2 2 0 0 0 9.79 20h4.42a2 2 0 0 0 1.99-1.8L17 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function TaskBadge({ children, tone }: { children: React.ReactNode; tone: "status" | "category" | "owner" }) {
  const toneClass = {
    status: "bg-[#d8f4ff] text-[#005c7a]",
    category: "bg-[#efd8ff] text-[#6b1597]",
    owner: "bg-[#edf2ff] text-[#244280]",
  }[tone];

  return <span className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${toneClass}`}>{children}</span>;
}

function ownerName(owner: string, members: TeamMember[]) {
  if (!owner) return "Unassigned";
  const member = members.find((item) => item.id === owner || item.name === owner || item.email === owner);
  return member?.name || member?.email || owner;
}

function ProjectTaskOverview({
  activePhase,
  planType,
  progress,
  onPlanSelect,
}: {
  activePhase?: Phase;
  planType: PlanType;
  progress: { done: number; total: number; pct: number };
  onPlanSelect?: (type: PlanType) => Promise<void> | void;
}) {
  const phaseLabel = activePhase ? activePhase.title.replace("PHASE ", "Phase ") : "All phases";
  const phaseHeading = activePhase?.name || `${planType}-day task plan`;

  return (
    <div className="border-b border-[#d6deeb] bg-white p-5">
      <div className="grid gap-5 xl:grid-cols-[3fr_1fr]">
        <div className="grid gap-6 lg:grid-cols-[3fr_1fr]">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-[#eef3f8] px-4 py-2 text-[12px] font-bold text-[#344054]">
              {phaseLabel}{activePhase?.name ? ` · ${activePhase.name}` : ""}
            </span>
            <h2 className="mt-4 text-[26px] leading-[1.2] font-bold text-[#070c11]">
              {phaseHeading}
            </h2>
            <p className="mt-2 max-w-[940px] text-[14px] leading-[1.7] text-[#53627a]">
              {planType}-Day Plan chapter with editable execution guidance, tools, links, and owner/status tracking.
            </p>
          </div>

          <div className="flex lg:justify-end">
            <div className="grid h-[136px] w-full max-w-[184px] place-items-center rounded-[18px] bg-[#edf2f7] px-5 py-6 text-center">
              <div>
                <strong className="block text-[42px] leading-none font-bold text-[#070c11]">{progress.pct}%</strong>
                <span className="block text-xl font-medium text-[#53627a]">{progress.done}/{progress.total} done</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="h-3 overflow-hidden rounded-full bg-[#e9eef5]">
              <span
                className="block h-full rounded-full bg-[linear-gradient(90deg,#1115ff_0%,#008ca4_100%)]"
                style={{ width: `${Math.min(Math.max(progress.pct, 0), 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid content-start gap-3">
          {(["30", "60", "90"] as PlanType[]).map((type) => (
            <button
              className={`rounded-[8px] border px-4 py-3 text-left text-sm font-semibold transition ${
                planType === type
                  ? "border-[#18b866] bg-[#e8f8ef] text-[#17b26a]"
                  : "border-[#d7dfeb] bg-[#f7fafc] text-[#42506a] hover:bg-white"
              }`}
              key={type}
              onClick={() => onPlanSelect?.(type)}
              type="button"
            >
              {type}-day {type === "90" ? "locked" : "plan"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
