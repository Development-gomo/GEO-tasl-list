import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";

const planTypes = ["30", "60", "90"];

function loadEnvFile() {
  const raw = readFileSync(".env.local", "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index);
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

function loadServiceAccount() {
  return {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || required("VITE_FIREBASE_PROJECT_ID"),
    clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL"),
    privateKey: required("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };
}

function cleanData(data) {
  const next = { ...data };
  delete next.createdAtServer;
  return next;
}

async function resolveProject(db) {
  const requestedProjectId = process.argv[2];
  if (requestedProjectId) {
    const project = await db.collection("projects").doc(requestedProjectId).get();
    if (!project.exists) throw new Error(`Project not found: ${requestedProjectId}`);
    return project;
  }

  const projects = await db.collection("projects").orderBy("updatedAt", "desc").get();
  if (projects.empty) throw new Error("No projects found.");
  if (projects.size > 1) {
    const projectList = projects.docs.map((project) => `${project.id} (${project.get("name") || "Unnamed project"})`).join("\n");
    throw new Error(`More than one project exists. Re-run with a project id:\n${projectList}`);
  }
  return projects.docs[0];
}

async function deleteExistingPlan(db, batch, collectionName, planType) {
  const planRef = db.collection(collectionName).doc("master").collection("plans").doc(planType);
  const phaseSnapshot = await planRef.collection("phases").get();
  for (const phase of phaseSnapshot.docs) {
    const taskSnapshot = await phase.ref.collection("tasks").get();
    taskSnapshot.docs.forEach((task) => batch.delete(task.ref));
    batch.delete(phase.ref);
  }
  batch.delete(planRef);
}

async function copyPlan(db, batch, projectId, planType, now) {
  const projectPlanRef = db.collection("projects").doc(projectId).collection("plans").doc(planType);
  const geoTaskListPlanRef = db.collection("geoTaskLists").doc("master").collection("plans").doc(planType);
  const projectPlan = await projectPlanRef.get();
  const phaseSnapshot = await projectPlanRef.collection("phases").orderBy("order").get();
  let taskCount = 0;

  batch.set(geoTaskListPlanRef, {
    type: planType,
    label: projectPlan.get("label") || `${planType}-day plan`,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  for (const phase of phaseSnapshot.docs) {
    const phaseData = cleanData(phase.data());
    const geoTaskListPhaseRef = geoTaskListPlanRef.collection("phases").doc(phase.id);
    batch.set(geoTaskListPhaseRef, {
      ...phaseData,
      id: phase.id,
      updatedAt: now,
    }, { merge: true });

    const taskSnapshot = await phase.ref.collection("tasks").orderBy(FieldPath.documentId()).get();
    taskCount += taskSnapshot.size;
    taskSnapshot.docs.forEach((task) => {
      const taskData = cleanData(task.data());
      batch.set(geoTaskListPhaseRef.collection("tasks").doc(task.id), {
        ...taskData,
        id: task.id,
        phaseId: phase.id,
        phaseOrder: phaseData.order || 0,
        updatedAt: now,
      }, { merge: true });
    });
  }

  return { phases: phaseSnapshot.size, tasks: taskCount };
}

loadEnvFile();

const serviceAccount = loadServiceAccount();

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();
const project = await resolveProject(db);
const now = new Date().toISOString();
const batch = db.batch();

for (const planType of planTypes) {
  await deleteExistingPlan(db, batch, "geoTaskLists", planType);
}

const copied = {};
for (const planType of planTypes) {
  copied[planType] = await copyPlan(db, batch, project.id, planType, now);
}

await batch.commit();

console.log(`Copied project "${project.get("name") || project.id}" (${project.id}) into the master GEO Task List.`);
planTypes.forEach((planType) => {
  console.log(`${planType}-day: ${copied[planType].phases} phases, ${copied[planType].tasks} tasks`);
});
