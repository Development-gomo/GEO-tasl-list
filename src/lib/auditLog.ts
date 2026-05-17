import { collection, deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { nowIso } from "@/lib/time";

type AuditDetail = {
  task?: string;
  field: string;
  from?: string;
  to?: string;
};

type AuditLogInput = {
  actionLabel: string;
  projectId?: string;
  projectName?: string;
  details?: string;
  detailsEntries?: AuditDetail[];
};

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "Empty";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function auditDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  labels: Record<string, string>,
  task = "Record",
) {
  return Object.entries(labels).flatMap(([key, label]) => {
    const from = displayValue(before?.[key]);
    const to = displayValue(after?.[key]);
    if (from === to) return [];
    return [{ task, field: label, from, to }];
  });
}

export async function createAuditLog(input: AuditLogInput) {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const timestamp = nowIso();
  const ref = doc(collection(db, "logs"));
  let userName = currentUser.displayName || "";
  const userSnapshot = await getDoc(doc(db, "users", currentUser.uid)).catch(() => null);
  if (userSnapshot?.exists()) {
    userName = String(userSnapshot.data().name || userName);
  }

  const detailsEntries = input.detailsEntries || [];
  const summary = input.details || detailsEntries.map((entry) => `${entry.field}: ${entry.from || "Empty"} -> ${entry.to || "Empty"}`).join(" | ");

  await setDoc(ref, {
    id: ref.id,
    actionLabel: input.actionLabel,
    projectId: input.projectId || "",
    projectName: input.projectName || "",
    details: summary || "Activity recorded.",
    history: [
      {
        id: `${ref.id}-history`,
        changedAt: timestamp,
        summary: summary || input.actionLabel,
        detailsEntries,
      },
    ],
    userId: currentUser.uid,
    userEmail: currentUser.email || "",
    userName: userName || currentUser.email || "Unknown user",
    createdAt: timestamp,
  });
}

export async function deleteAuditLog(logId: string) {
  await deleteDoc(doc(db, "logs", logId));
}
