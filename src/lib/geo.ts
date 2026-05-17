import { GEO_TEMPLATE } from "@/data/geoTemplate";
import type { Phase, PlanType, ProgressSummary, Task, TaskStatus } from "@/types";

type TemplateTask = {
  phase?: string;
  dayTarget?: string;
  number?: string;
  category?: string;
  task?: string;
  howToExecute?: string;
  tools?: string;
  dependencyNotes?: string;
  owner?: string;
  trainingRequired?: string;
  quickWin?: string;
  status?: TaskStatus;
  externalTodoLink?: string;
  googleDriveLink?: string;
};

type TemplatePhase = {
  id?: string;
  title?: string;
  days?: string;
  name?: string;
  tasks?: TemplateTask[];
};

type TemplatePlan = {
  label?: string;
  disabled?: boolean;
  phases?: TemplatePhase[];
};

export const OWNER_ROLES = [
  "Analyst",
  "Content Writer",
  "Client",
  "Designer",
  "Developer",
  "Video Producer",
  "Social Media Manager",
  "Marketing Automator",
  "CSL",
];

export const planTypes: PlanType[] = ["30", "60", "90"];

export function getTemplatePlan(type: PlanType) {
  return GEO_TEMPLATE.plans[type] as TemplatePlan | undefined;
}

export function templateLabel(type: PlanType) {
  const plan = getTemplatePlan(type);
  return plan?.label || `${type}-day plan`;
}

export function phaseDocId(phase: TemplatePhase, index: number) {
  return phase.id || `phase_${index + 1}`;
}

export function taskDocId(task: TemplateTask, index: number) {
  const number = String(task.number || index + 1).replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `task_${number || index + 1}`;
}

export function normalizePhase(phase: TemplatePhase, index: number): Phase {
  return {
    id: phaseDocId(phase, index),
    order: index,
    title: phase.title || `Phase ${index + 1}`,
    name: phase.name || "",
    days: phase.days || "",
  };
}

export function normalizeTask(task: TemplateTask, phase: Phase, index: number): Task {
  return {
    id: taskDocId(task, index),
    phaseId: phase.id,
    phaseOrder: phase.order,
    dayTarget: task.dayTarget || "",
    number: String(task.number || index + 1),
    category: task.category || "",
    task: task.task || "",
    howToExecute: task.howToExecute || "",
    tools: task.tools || "",
    dependencyNotes: task.dependencyNotes || "",
    owner: task.owner || "",
    trainingRequired: task.trainingRequired || "No",
    quickWin: task.quickWin || "No",
    status: task.status || "To Do",
    externalTodoLink: task.externalTodoLink || "",
    googleDriveLink: task.googleDriveLink || "",
    notes: "",
  };
}

export function templatePhases(type: PlanType): Phase[] {
  const plan = getTemplatePlan(type);
  return ((plan?.phases || []) as TemplatePhase[]).map(normalizePhase);
}

export function templateTasks(type: PlanType) {
  const plan = getTemplatePlan(type);
  return ((plan?.phases || []) as TemplatePhase[]).flatMap((phase, phaseIndex) => {
    const normalizedPhase = normalizePhase(phase, phaseIndex);
    return (phase.tasks || []).map((task, taskIndex) => normalizeTask(task, normalizedPhase, taskIndex));
  });
}

export function progressForTasks(tasks: Pick<Task, "status">[]): ProgressSummary {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "Done").length;
  return {
    total,
    done,
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

export function phaseTitle(phase: Pick<Phase, "title" | "name">) {
  return `${phase.title.replace("PHASE ", "Phase ")}${phase.name ? ` - ${phase.name}` : ""}`;
}
