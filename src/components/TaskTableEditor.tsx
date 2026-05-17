import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";
import { phaseTitle, progressForTasks } from "@/lib/geo";
import { recordImportExport, updatePlanProgress, updateTask } from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";
import type { Phase, PlanType, Task, TeamMember } from "@/types";

const statuses = ["To Do", "In Progress", "Blocked", "Done"] as const;

export function TaskTableEditor({ projectId, planType, disabled = false }: { projectId: string; planType: PlanType; disabled?: boolean }) {
  const { firebaseUser } = useAuth();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activePhaseId, setActivePhaseId] = useState<string>("all");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPhases([]);
    setTasks([]);
    setActivePhaseId("all");
  }, [planType, projectId]);

  useEffect(() => {
    if (disabled) return;
    const unsubscribe = onSnapshot(query(collection(db, "projects", projectId, "plans", planType, "phases"), orderBy("order")), (snapshot) => {
      setPhases(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Phase));
    });
    return unsubscribe;
  }, [disabled, planType, projectId]);

  useEffect(() => {
    if (disabled || !phases.length) {
      setTasks([]);
      return;
    }
    const unsubscribers = phases.map((phase) =>
      onSnapshot(query(collection(db, "projects", projectId, "plans", planType, "phases", phase.id, "tasks"), orderBy("number")), (snapshot) => {
        const phaseTasks = snapshot.docs.map((item) => ({ id: item.id, phaseId: phase.id, phaseOrder: phase.order, ...item.data() }) as Task);
        setTasks((current) => {
          const other = current.filter((task) => task.phaseId !== phase.id);
          return [...other, ...phaseTasks].sort((a, b) => a.phaseOrder - b.phaseOrder || Number(a.number) - Number(b.number));
        });
      }),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [disabled, phases, planType, projectId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "projects", projectId, "teamMembers"), orderBy("name")), (snapshot) => {
      setMembers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TeamMember));
    });
    return unsubscribe;
  }, [projectId]);

  useEffect(() => {
    if (!disabled && tasks.length) updatePlanProgress(projectId, planType, tasks);
  }, [disabled, planType, projectId, tasks]);

  const visibleTasks = useMemo(() => (activePhaseId === "all" ? tasks : tasks.filter((task) => task.phaseId === activePhaseId)), [activePhaseId, tasks]);
  const progress = progressForTasks(tasks);

  async function patchTask(task: Task, field: keyof Task, value: string) {
    const nextTask = { ...task, [field]: value };
    setTasks((current) => current.map((item) => (item.id === task.id && item.phaseId === task.phaseId ? nextTask : item)));
    await updateTask(projectId, planType, nextTask);
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
    <section className="panel overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b border-[#d6deeb] p-5 lg:flex-row lg:items-center">
        <div>
          <h2 className="text-xl font-bold">{planType}-day task plan</h2>
          <p className="text-sm text-[#65728a]">{progress.done}/{progress.total} complete, {progress.pct}% progress</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input" value={activePhaseId} onChange={(event) => setActivePhaseId(event.target.value)}>
            <option value="all">All chapters</option>
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
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[40%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead className="bg-[#f4f6fa] text-xs uppercase tracking-wide text-[#65728a]">
            <tr>
              <th className="px-2 py-3">#</th>
              <th className="px-2 py-3">Task</th>
              <th className="px-2 py-3">Status</th>
              <th className="px-2 py-3">Owner</th>
              <th className="px-2 py-3">Notes</th>
              <th className="px-2 py-3">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d6deeb]">
            {visibleTasks.map((task) => (
              <tr className="align-top" key={`${task.phaseId}-${task.id}`}>
                <td className="px-2 py-3 font-semibold text-slate-500">{task.number}</td>
                <td className="px-2 py-3">
                  <input className="input mb-2 w-full font-medium" value={task.task} onChange={(event) => patchTask(task, "task", event.target.value)} />
                  <textarea className="input min-h-28 w-full" value={task.howToExecute} onChange={(event) => patchTask(task, "howToExecute", event.target.value)} />
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <input className="input" value={task.tools} onChange={(event) => patchTask(task, "tools", event.target.value)} placeholder="Tools" />
                    <input className="input" value={task.dependencyNotes} onChange={(event) => patchTask(task, "dependencyNotes", event.target.value)} placeholder="Dependencies" />
                  </div>
                </td>
                <td className="px-2 py-3">
                  <select className="input w-full min-w-0" value={task.status} onChange={(event) => patchTask(task, "status", event.target.value)}>
                    {statuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </td>
                <td className="px-2 py-3">
                  <select className="input w-full min-w-0" value={task.owner} onChange={(event) => patchTask(task, "owner", event.target.value)}>
                    <option value="">Unassigned</option>
                    {members.map((member) => <option key={member.id} value={member.id}>{member.name || member.email} ({member.role})</option>)}
                  </select>
                </td>
                <td className="px-2 py-3">
                  <textarea className="input min-h-24 w-full" value={task.notes || ""} onChange={(event) => patchTask(task, "notes", event.target.value)} />
                </td>
                <td className="px-2 py-3">
                  <div className="grid gap-2">
                    <input className="input" value={task.externalTodoLink} onChange={(event) => patchTask(task, "externalTodoLink", event.target.value)} placeholder="To-do link" />
                    <input className="input" value={task.googleDriveLink} onChange={(event) => patchTask(task, "googleDriveLink", event.target.value)} placeholder="Drive link" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
