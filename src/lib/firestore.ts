import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditDiff, createAuditLog } from "@/lib/auditLog";
import { nowIso } from "@/lib/time";
import {
  getTemplatePlan,
  normalizePhase,
  normalizeTask,
  phaseDocId,
  progressForTasks,
  taskDocId,
  templateLabel,
} from "@/lib/geo";
import type { DirectoryTeamMember, ImportExportMetadata, Phase, PlanType, Project, Task, TeamMember } from "@/types";

const projectFieldLabels = {
  name: "Project name",
  description: "Description",
  status: "Status",
  teamMemberCount: "Team members",
};

const taskFieldLabels = {
  dayTarget: "Day Target",
  category: "Category",
  task: "Task Title",
  howToExecute: "Task Description",
  tools: "Tools",
  dependencyNotes: "Dependencies",
  owner: "Owner",
  trainingRequired: "Training Required",
  quickWin: "Quick Win",
  status: "Status",
  externalTodoLink: "External To-do Link",
  googleDriveLink: "Google Drive Link",
  notes: "Notes",
};

export function projectRef(projectId: string) {
  return doc(db, "projects", projectId);
}

export function teamRef(projectId: string) {
  return collection(db, "projects", projectId, "teamMembers");
}

export function planRef(projectId: string, planType: PlanType) {
  return doc(db, "projects", projectId, "plans", planType);
}

export function phasesRef(projectId: string, planType: PlanType) {
  return collection(db, "projects", projectId, "plans", planType, "phases");
}

export function tasksRef(projectId: string, planType: PlanType, phaseId: string) {
  return collection(db, "projects", projectId, "plans", planType, "phases", phaseId, "tasks");
}

export function geoTaskListPlanRef(planType: PlanType) {
  return doc(db, "geoTaskLists", "master", "plans", planType);
}

export function geoTaskListPhasesRef(planType: PlanType) {
  return collection(db, "geoTaskLists", "master", "plans", planType, "phases");
}

export function geoTaskListTasksRef(planType: PlanType, phaseId: string) {
  return collection(db, "geoTaskLists", "master", "plans", planType, "phases", phaseId, "tasks");
}

export async function createProjectWithPlans(name: string, createdBy: string, team: Omit<TeamMember, "id">[]) {
  const batch = writeBatch(db);
  const project = doc(collection(db, "projects"));
  const createdAt = nowIso();

  batch.set(project, {
    name,
    description: "",
    client: "GO MO Group",
    status: "active",
    teamMemberCount: team.filter((member) => member.name || member.email).length,
    createdBy,
    activePlanType: "30",
    planTypes: ["30", "60", "90"],
    progress: {},
    createdAt,
    updatedAt: createdAt,
    createdAtServer: serverTimestamp(),
  });

  team.filter((member) => member.name || member.email).forEach((member) => {
    const memberRef = doc(collection(db, "projects", project.id, "teamMembers"));
    batch.set(memberRef, {
      ...member,
      createdAt,
      updatedAt: createdAt,
    });
  });

  (["30", "60", "90"] as PlanType[]).forEach((planType) => {
    const plan = getTemplatePlan(planType);
    const disabled = Boolean(plan?.disabled);
    batch.set(doc(db, "projects", project.id, "plans", planType), {
      type: planType,
      label: templateLabel(planType),
      disabled,
      createdAt,
      updatedAt: createdAt,
    });

    if (disabled) return;

    (plan?.phases || []).forEach((phase, phaseIndex) => {
      const normalizedPhase = normalizePhase(phase, phaseIndex);
      batch.set(doc(db, "projects", project.id, "plans", planType, "phases", normalizedPhase.id), normalizedPhase);
      (phase.tasks || []).forEach((task, taskIndex) => {
        const normalizedTask = normalizeTask(task, normalizedPhase, taskIndex);
        batch.set(
          doc(db, "projects", project.id, "plans", planType, "phases", normalizedPhase.id, "tasks", normalizedTask.id),
          { ...normalizedTask, createdAt, updatedAt: createdAt },
        );
      });
    });
  });

  await batch.commit();
  await createAuditLog({
    actionLabel: "Project Created",
    projectId: project.id,
    projectName: name,
    details: `Created project ${name}`,
    detailsEntries: [
      { task: "Project", field: "Project name", from: "", to: name },
      { task: "Project", field: "Team members", from: "0", to: String(team.filter((member) => member.name || member.email).length) },
    ],
  });
  return project.id;
}

export async function createProjectFromDirectory(
  projectData: Pick<Project, "name" | "client" | "description" | "status">,
  createdBy: string,
  members: DirectoryTeamMember[],
) {
  const batch = writeBatch(db);
  const project = doc(collection(db, "projects"));
  const createdAt = nowIso();

  batch.set(project, {
    name: projectData.name,
    description: projectData.description || "",
    client: projectData.client || "GO MO Group",
    status: projectData.status || "active",
    teamMemberCount: members.length,
    createdBy,
    activePlanType: "30",
    planTypes: ["30", "60", "90"],
    progress: {},
    createdAt,
    updatedAt: createdAt,
    createdAtServer: serverTimestamp(),
  });

  members.forEach((member) => {
    batch.set(doc(db, "projects", project.id, "teamMembers", member.id), projectTeamMemberPayload(member, createdAt));
  });

  const plans = await Promise.all((["30", "60", "90"] as PlanType[]).map((planType) => getEditableGeoTaskListPlan(planType)));

  plans.forEach(({ planType, phases }) => {
    const disabled = planType === "90" && phases.length === 0;
    batch.set(doc(db, "projects", project.id, "plans", planType), {
      type: planType,
      label: templateLabel(planType),
      disabled,
      createdAt,
      updatedAt: createdAt,
    });

    if (disabled) return;

    phases.forEach((phase) => {
      batch.set(doc(db, "projects", project.id, "plans", planType, "phases", phase.id), {
        id: phase.id,
        order: phase.order,
        title: phase.title,
        name: phase.name,
        days: phase.days,
      });
      phase.tasks.forEach((task) => {
        batch.set(
          doc(db, "projects", project.id, "plans", planType, "phases", phase.id, "tasks", task.id),
          {
            ...task,
            phaseId: phase.id,
            phaseOrder: phase.order,
            createdAt,
            updatedAt: createdAt,
          },
        );
      });
    });
  });

  await batch.commit();
  await createAuditLog({
    actionLabel: "Project Created",
    projectId: project.id,
    projectName: projectData.name,
    details: `Created project ${projectData.name}`,
    detailsEntries: [
      { task: "Project", field: "Project name", from: "", to: projectData.name },
      { task: "Project", field: "Status", from: "", to: projectData.status || "active" },
      { task: "Project", field: "Team members", from: "0", to: String(members.length) },
    ],
  });
  return project.id;
}

export async function ensureEditableGeoTaskListPlan(planType: PlanType) {
  const existingPhases = await getDocs(geoTaskListPhasesRef(planType));
  if (!existingPhases.empty) return;

  const existingPlan = await getDoc(geoTaskListPlanRef(planType));
  const plan = getTemplatePlan(planType);
  if (existingPlan.exists() && !(plan?.phases || []).length) return;

  const batch = writeBatch(db);
  const createdAt = nowIso();
  const disabled = planType === "90" ? false : Boolean(plan?.disabled);

  batch.set(geoTaskListPlanRef(planType), {
    type: planType,
    label: templateLabel(planType),
    disabled,
    createdAt,
    updatedAt: createdAt,
  });

  (plan?.phases || []).forEach((phase, phaseIndex) => {
    const normalizedPhase = normalizePhase(phase, phaseIndex);
    batch.set(doc(geoTaskListPhasesRef(planType), normalizedPhase.id), {
      ...normalizedPhase,
      createdAt,
      updatedAt: createdAt,
    });
    (phase.tasks || []).forEach((task, taskIndex) => {
      const normalizedTask = normalizeTask(task, normalizedPhase, taskIndex);
      batch.set(doc(geoTaskListTasksRef(planType, normalizedPhase.id), normalizedTask.id), {
        ...normalizedTask,
        createdAt,
        updatedAt: createdAt,
      });
    });
  });

  await batch.commit();
}

export async function getEditableGeoTaskListPlan(planType: PlanType) {
  await ensureEditableGeoTaskListPlan(planType);
  return getGeoTaskListPlan(planType);
}

export async function getGeoTaskListPlan(planType: PlanType) {
  const phaseSnapshot = await getDocs(query(geoTaskListPhasesRef(planType), orderBy("order")));
  const phases = await Promise.all(
    phaseSnapshot.docs.map(async (phaseDoc) => {
      const phase = { id: phaseDoc.id, ...phaseDoc.data() } as Phase;
      const taskSnapshot = await getDocs(query(geoTaskListTasksRef(planType, phase.id), orderBy("number")));
      return {
        ...phase,
        tasks: taskSnapshot.docs.map((task) => ({ id: task.id, ...task.data() }) as Task),
      };
    }),
  );

  return { planType, phases };
}

export async function addGeoTaskListTask(planType: PlanType, phaseId?: string) {
  await ensureEditableGeoTaskListPlan(planType);
  const createdAt = nowIso();
  let targetPhaseId = phaseId;
  let targetPhaseOrder = 0;

  if (!targetPhaseId) {
    const phaseSnapshot = await getDocs(query(geoTaskListPhasesRef(planType), orderBy("order")));
    const firstPhase = phaseSnapshot.docs[0];
    if (firstPhase) {
      targetPhaseId = firstPhase.id;
      targetPhaseOrder = Number(firstPhase.data().order || 0);
    } else {
      targetPhaseId = "phase_1";
      await setDoc(doc(geoTaskListPhasesRef(planType), targetPhaseId), {
        id: targetPhaseId,
        order: 0,
        title: "PHASE 1",
        name: `${planType}-Day Tasks`,
        days: "",
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  const taskSnapshot = await getDocs(geoTaskListTasksRef(planType, targetPhaseId));
  const nextNumber = taskSnapshot.size + 1;
  const task = doc(geoTaskListTasksRef(planType, targetPhaseId));
  await setDoc(task, {
    id: task.id,
    phaseId: targetPhaseId,
    phaseOrder: targetPhaseOrder,
    dayTarget: "",
    number: String(nextNumber),
    category: "",
    task: "",
    howToExecute: "",
    tools: "",
    dependencyNotes: "",
    owner: "",
    trainingRequired: "No",
    quickWin: "No",
    status: "To Do",
    externalTodoLink: "",
    googleDriveLink: "",
    notes: "",
    createdAt,
    updatedAt: createdAt,
  });
  await createAuditLog({
    actionLabel: "GEO Task Added",
    projectName: "GEO Task List",
    details: `Added task to ${planType}-day GEO task list`,
    detailsEntries: [
      { task: `${planType}-Day Task`, field: "Summary", from: "", to: "New blank task" },
    ],
  });
}

export async function updateGeoTaskListTask(planType: PlanType, task: Task) {
  const ref = doc(db, "geoTaskLists", "master", "plans", planType, "phases", task.phaseId, "tasks", task.id);
  const beforeSnapshot = await getDoc(ref);
  const before = beforeSnapshot.exists() ? beforeSnapshot.data() : null;
  const payload = {
    dayTarget: task.dayTarget,
    number: task.number,
    category: task.category,
    task: task.task,
    howToExecute: task.howToExecute,
    tools: task.tools,
    dependencyNotes: task.dependencyNotes,
    owner: task.owner,
    updatedAt: nowIso(),
  };
  await updateDoc(ref, payload);
  const detailsEntries = auditDiff(before, payload, {
    dayTarget: "Day Target",
    number: "Task #",
    category: "Phase",
    task: "Task Title",
    howToExecute: "Task Description",
    tools: "Tools",
    dependencyNotes: "Dependencies",
    owner: "Owner / Dept",
  }, task.task || `${planType}-Day Task`);
  if (detailsEntries.length) {
    await createAuditLog({
      actionLabel: "GEO Task Updated",
      projectName: "GEO Task List",
      detailsEntries,
    });
  }
}

export async function deleteGeoTaskListTask(planType: PlanType, task: Task) {
  await deleteDoc(doc(db, "geoTaskLists", "master", "plans", planType, "phases", task.phaseId, "tasks", task.id));
  await createAuditLog({
    actionLabel: "GEO Task Deleted",
    projectName: "GEO Task List",
    details: `Deleted ${task.task || `${planType}-day task`}`,
    detailsEntries: [
      { task: task.task || `${planType}-Day Task`, field: "Summary", from: task.task || "Task", to: "" },
    ],
  });
}

export async function reorderGeoTaskListTasks(planType: PlanType, phaseId: string, tasks: Task[]) {
  const batch = writeBatch(db);
  const updatedAt = nowIso();
  tasks.forEach((task, index) => {
    batch.update(doc(db, "geoTaskLists", "master", "plans", planType, "phases", phaseId, "tasks", task.id), {
      number: String(index + 1),
      updatedAt,
    });
  });
  await batch.commit();
  await createAuditLog({
    actionLabel: "GEO Tasks Reordered",
    projectName: "GEO Task List",
    details: `Reordered ${tasks.length} tasks in ${planType}-day task list`,
    detailsEntries: [
      { task: `${planType}-Day Task List`, field: "Summary", from: "Previous order", to: "Updated order" },
    ],
  });
}

export async function updateProject(projectId: string, name: string) {
  const ref = projectRef(projectId);
  const beforeSnapshot = await getDoc(ref);
  const before = beforeSnapshot.exists() ? beforeSnapshot.data() : null;
  await updateDoc(ref, { name, updatedAt: nowIso() });
  await createAuditLog({
    actionLabel: "Project Updated",
    projectId,
    projectName: name,
    detailsEntries: auditDiff(before, { name }, { name: "Project name" }, "Project"),
  });
}

export async function updateProjectBasics(
  projectId: string,
  project: Pick<Project, "name" | "description" | "status">,
  members: DirectoryTeamMember[],
) {
  const batch = writeBatch(db);
  const updatedAt = nowIso();
  const projectSnapshot = await getDoc(projectRef(projectId));
  const beforeProject = projectSnapshot.exists() ? projectSnapshot.data() : null;
  const existingMembers = await getDocs(teamRef(projectId));
  const beforeMemberNames = existingMembers.docs.map((member) => String(member.data().name || member.data().email || member.id)).sort();
  const afterMemberNames = members.map((member) => member.name || member.email || member.id).sort();

  existingMembers.docs.forEach((member) => {
    batch.delete(member.ref);
  });

  members.forEach((member) => {
    batch.set(doc(db, "projects", projectId, "teamMembers", member.id), projectTeamMemberPayload(member, updatedAt));
  });

  batch.update(projectRef(projectId), {
    name: project.name,
    description: project.description || "",
    status: project.status || "active",
    teamMemberCount: members.length,
    updatedAt,
  });

  await batch.commit();
  const detailsEntries = auditDiff(beforeProject, {
    name: project.name,
    description: project.description || "",
    status: project.status || "active",
    teamMemberCount: members.length,
  }, projectFieldLabels, "Project");
  if (beforeMemberNames.join(" | ") !== afterMemberNames.join(" | ")) {
    detailsEntries.push({
      task: "Team Members",
      field: "Assigned members",
      from: beforeMemberNames.join(", "),
      to: afterMemberNames.join(", "),
    });
  }
  await createAuditLog({
    actionLabel: "Project Updated",
    projectId,
    projectName: project.name,
    detailsEntries: detailsEntries.length
      ? detailsEntries
      : [{ task: "Team Members", field: "Summary", from: "Previous team", to: `${members.length} attached` }],
  });
}

function projectTeamMemberPayload(member: DirectoryTeamMember, updatedAt: string) {
  return {
    id: member.id,
    directoryMemberId: member.id,
    name: member.name,
    email: member.email,
    role: member.designation || member.department || "Team Member",
    department: member.department || "",
    designation: member.designation || "",
    status: member.status || "current",
    createdAt: updatedAt,
    updatedAt,
  };
}

export async function updateProjectActivePlan(projectId: string, planType: PlanType) {
  const projectSnapshot = await getDoc(projectRef(projectId));
  const project = projectSnapshot.exists() ? ({ id: projectSnapshot.id, ...projectSnapshot.data() } as Project) : null;
  await updateDoc(projectRef(projectId), {
    activePlanType: planType,
    updatedAt: nowIso(),
  });
  await createAuditLog({
    actionLabel: "Project Plan Changed",
    projectId,
    projectName: project?.name || "",
    detailsEntries: [
      { task: "Project", field: "Active Plan", from: project?.activePlanType || "", to: planType },
    ],
  });
}

export async function deleteProject(projectId: string) {
  const deletes: Promise<void>[] = [];
  const planTypes: PlanType[] = ["30", "60", "90"];
  const projectSnapshot = await getDoc(projectRef(projectId));
  const project = projectSnapshot.exists() ? ({ id: projectSnapshot.id, ...projectSnapshot.data() } as Project) : null;

  const teamMembers = await getDocs(teamRef(projectId));
  teamMembers.docs.forEach((member) => {
    deletes.push(deleteDoc(member.ref));
  });

  const importExportMetadata = await getDocs(collection(db, "projects", projectId, "importExportMetadata"));
  importExportMetadata.docs.forEach((metadata) => {
    deletes.push(deleteDoc(metadata.ref));
  });

  for (const planType of planTypes) {
    const phases = await getDocs(phasesRef(projectId, planType));
    for (const phase of phases.docs) {
      const tasks = await getDocs(tasksRef(projectId, planType, phase.id));
      tasks.docs.forEach((task) => {
        deletes.push(deleteDoc(task.ref));
      });
      deletes.push(deleteDoc(phase.ref));
    }
    deletes.push(deleteDoc(planRef(projectId, planType)));
  }

  await Promise.all(deletes);
  await deleteDoc(projectRef(projectId));
  await createAuditLog({
    actionLabel: "Project Deleted",
    projectId,
    projectName: project?.name || "",
    details: `Deleted project ${project?.name || projectId}`,
    detailsEntries: [
      { task: "Project", field: "Summary", from: project?.name || projectId, to: "" },
    ],
  });
}

export async function getPhases(projectId: string, planType: PlanType): Promise<Phase[]> {
  const snapshot = await getDocs(query(phasesRef(projectId, planType), orderBy("order")));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Phase);
}

export async function getTasks(projectId: string, planType: PlanType, phases: Phase[]): Promise<Task[]> {
  const phaseTasks = await Promise.all(
    phases.map(async (phase) => {
      const snapshot = await getDocs(query(tasksRef(projectId, planType, phase.id), orderBy("number")));
      return snapshot.docs.map((item) => ({ id: item.id, phaseId: phase.id, phaseOrder: phase.order, ...item.data() }) as Task);
    }),
  );
  return phaseTasks.flat().sort((a, b) => a.phaseOrder - b.phaseOrder || Number(a.number) - Number(b.number));
}

export async function updateTask(projectId: string, planType: PlanType, task: Task) {
  const updatedAt = nowIso();
  const ref = doc(db, "projects", projectId, "plans", planType, "phases", task.phaseId, "tasks", task.id);
  const beforeSnapshot = await getDoc(ref);
  const before = beforeSnapshot.exists() ? beforeSnapshot.data() : null;
  const projectSnapshot = await getDoc(projectRef(projectId));
  const project = projectSnapshot.exists() ? ({ id: projectSnapshot.id, ...projectSnapshot.data() } as Project) : null;
  const payload = {
    dayTarget: task.dayTarget,
    category: task.category,
    task: task.task,
    howToExecute: task.howToExecute,
    tools: task.tools,
    dependencyNotes: task.dependencyNotes,
    owner: task.owner,
    trainingRequired: task.trainingRequired,
    quickWin: task.quickWin,
    status: task.status,
    externalTodoLink: task.externalTodoLink,
    googleDriveLink: task.googleDriveLink,
    notes: task.notes || "",
    edited: true,
    updatedAt,
  };
  await updateDoc(ref, payload);
  const detailsEntries = auditDiff(before, payload, taskFieldLabels, task.task || `Task ${task.number}`);
  if (detailsEntries.length) {
    await createAuditLog({
      actionLabel: "Project Task Updated",
      projectId,
      projectName: project?.name || "",
      detailsEntries,
    });
  }
}

export async function deleteTask(projectId: string, planType: PlanType, task: Task) {
  const ref = doc(db, "projects", projectId, "plans", planType, "phases", task.phaseId, "tasks", task.id);
  const projectSnapshot = await getDoc(projectRef(projectId));
  const project = projectSnapshot.exists() ? ({ id: projectSnapshot.id, ...projectSnapshot.data() } as Project) : null;
  await deleteDoc(ref);
  await createAuditLog({
    actionLabel: "Project Task Deleted",
    projectId,
    projectName: project?.name || "",
    details: `Deleted ${task.task || `Task ${task.number}`}`,
    detailsEntries: [
      { task: task.task || `Task ${task.number}`, field: "Summary", from: task.task || `Task ${task.number}`, to: "" },
    ],
  });
}

export async function upsertTeamMember(projectId: string, member: TeamMember | Omit<TeamMember, "id">) {
  const id = "id" in member && member.id ? member.id : doc(teamRef(projectId)).id;
  const ref = doc(db, "projects", projectId, "teamMembers", id);
  const beforeSnapshot = await getDoc(ref);
  const before = beforeSnapshot.exists() ? beforeSnapshot.data() : null;
  const projectSnapshot = await getDoc(projectRef(projectId));
  const project = projectSnapshot.exists() ? ({ id: projectSnapshot.id, ...projectSnapshot.data() } as Project) : null;
  await setDoc(
    ref,
    {
      ...member,
      id,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  await createAuditLog({
    actionLabel: before ? "Project Team Member Updated" : "Project Team Member Added",
    projectId,
    projectName: project?.name || "",
    detailsEntries: before
      ? auditDiff(before, { ...member, id }, { name: "Name", email: "Email", role: "Role", status: "Status" }, member.name || "Team member")
      : [{ task: "Team Member", field: "Summary", from: "", to: member.name || member.email || id }],
  });
}

export async function deleteTeamMember(projectId: string, memberId: string) {
  const ref = doc(db, "projects", projectId, "teamMembers", memberId);
  const beforeSnapshot = await getDoc(ref);
  const before = beforeSnapshot.exists() ? beforeSnapshot.data() : null;
  const projectSnapshot = await getDoc(projectRef(projectId));
  const project = projectSnapshot.exists() ? ({ id: projectSnapshot.id, ...projectSnapshot.data() } as Project) : null;
  await deleteDoc(ref);
  await createAuditLog({
    actionLabel: "Project Team Member Removed",
    projectId,
    projectName: project?.name || "",
    detailsEntries: [
      { task: "Team Member", field: "Summary", from: String(before?.name || before?.email || memberId), to: "" },
    ],
  });
}

export async function updatePlanProgress(projectId: string, planType: PlanType, tasks: Task[]) {
  await updateDoc(projectRef(projectId), {
    [`progress.${planType}`]: progressForTasks(tasks),
    updatedAt: nowIso(),
  });
}

export async function recordImportExport(projectId: string, metadata: Omit<ImportExportMetadata, "id" | "projectId" | "createdAt">) {
  const ref = doc(collection(db, "projects", projectId, "importExportMetadata"));
  const projectSnapshot = await getDoc(projectRef(projectId));
  const project = projectSnapshot.exists() ? ({ id: projectSnapshot.id, ...projectSnapshot.data() } as Project) : null;
  await setDoc(ref, {
    ...metadata,
    id: ref.id,
    projectId,
    createdAt: nowIso(),
  });
  await createAuditLog({
    actionLabel: metadata.kind === "import" ? "Tasks Imported" : "Tasks Exported",
    projectId,
    projectName: project?.name || "",
    details: `${metadata.kind === "import" ? "Imported" : "Exported"} ${metadata.filename}`,
    detailsEntries: [
      { task: `${metadata.planType}-Day Plan`, field: "Filename", from: "", to: metadata.filename },
      { task: `${metadata.planType}-Day Plan`, field: "Rows", from: "", to: String(metadata.rows || metadata.updatedRows || 0) },
    ],
  });
}

export function importedTaskPath(projectId: string, planType: PlanType, phaseId: string, taskNumber: string) {
  const plan = getTemplatePlan(planType);
  const phase = (plan?.phases || []).find((item) => phaseDocId(item, 0) === phaseId);
  const taskIndex = phase?.tasks?.findIndex((item) => String(item.number) === String(taskNumber)) || 0;
  return doc(db, "projects", projectId, "plans", planType, "phases", phaseId, "tasks", taskDocId({ number: taskNumber }, taskIndex));
}
