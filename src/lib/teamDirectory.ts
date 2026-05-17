import { addDoc, collection, doc, getDoc, setDoc } from "firebase/firestore";
import { auditDiff, createAuditLog } from "@/lib/auditLog";
import { db } from "@/lib/firebase";
import { nowIso } from "@/lib/time";
import type { DirectoryTeamMember } from "@/types";

export type TeamMemberDraft = Omit<DirectoryTeamMember, "id" | "createdAt" | "updatedAt">;

export async function createDirectoryTeamMember(member: TeamMemberDraft) {
  const createdAt = nowIso();
  const ref = await addDoc(collection(db, "teamMembers"), {
    ...member,
    createdAt,
    updatedAt: createdAt,
  });
  await createAuditLog({
    actionLabel: "Directory Team Member Added",
    projectName: "Workspace",
    details: `Added ${member.name} to team directory`,
    detailsEntries: [
      { task: "Team Directory", field: "Name", from: "", to: member.name },
      { task: "Team Directory", field: "Email", from: "", to: member.email },
      { task: "Team Directory", field: "Department", from: "", to: member.department },
      { task: "Team Directory", field: "Designation", from: "", to: member.designation },
      { task: "Team Directory", field: "Status", from: "", to: member.status || "current" },
      { task: "Team Directory", field: "Record ID", from: "", to: ref.id },
    ],
  });
}

export async function updateDirectoryTeamMember(member: DirectoryTeamMember) {
  const ref = doc(db, "teamMembers", member.id);
  const beforeSnapshot = await getDoc(ref);
  const before = beforeSnapshot.exists() ? beforeSnapshot.data() : null;
  const updatedAt = nowIso();
  await setDoc(
    ref,
    {
      name: member.name,
      email: member.email,
      department: member.department,
      designation: member.designation,
      status: member.status || "current",
      updatedAt,
    },
    { merge: true },
  );
  const detailsEntries = auditDiff(before, member as unknown as Record<string, unknown>, {
    name: "Name",
    email: "Email",
    department: "Department",
    designation: "Designation",
    status: "Status",
  }, member.name || "Team directory member");
  if (detailsEntries.length) {
    await createAuditLog({
      actionLabel: "Directory Team Member Updated",
      projectName: "Workspace",
      detailsEntries,
    });
  }
}
