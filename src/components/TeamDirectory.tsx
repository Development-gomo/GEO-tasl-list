import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { FormEvent, useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { createDirectoryTeamMember, updateDirectoryTeamMember, type TeamMemberDraft } from "@/lib/teamDirectory";
import type { DirectoryTeamMember } from "@/types";

const emptyDraft: TeamMemberDraft = {
  name: "",
  email: "",
  department: "Analyst",
  designation: "",
  status: "current",
};

const departmentOptions = [
  "Analyst",
  "Content Writer",
  "Client",
  "Designer",
  "Developer",
  "Video Producer",
  "Social Media Manager",
  "Marketing Automator",
  "CSL",
  "CSM",
];

export function TeamDirectory() {
  const [members, setMembers] = useState<DirectoryTeamMember[]>([]);
  const [draft, setDraft] = useState<TeamMemberDraft>(emptyDraft);
  const [editing, setEditing] = useState<DirectoryTeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "teamMembers"), orderBy("name")), (snapshot) => {
      setMembers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DirectoryTeamMember));
    });
    return unsubscribe;
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createDirectoryTeamMember({
        name: draft.name.trim(),
        email: draft.email.trim(),
        department: draft.department.trim(),
        designation: draft.designation.trim(),
        status: draft.status || "current",
      });
      setDraft(emptyDraft);
      setMessage("Team member added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add team member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(member: DirectoryTeamMember) {
    setBusy(true);
    setMessage("");
    try {
      await updateDirectoryTeamMember(member);
      setEditing(null);
      setMessage("Team member updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update team member.");
    } finally {
      setBusy(false);
    }
  }

  const currentMembers = members.filter((member) => (member.status || "current") === "current");
  const exMembers = members.filter((member) => member.status === "ex");

  return (
    <div>
      <section className="mb-[18px] grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TeamStatCard label="Total Members" value={members.length} hint="Everyone in the directory" tone="blue" />
        <TeamStatCard label="Current Team" value={currentMembers.length} hint="Available in the organization" tone="green" />
        <TeamStatCard label="Ex-Team Members" value={exMembers.length} hint="Kept for historical reference" tone="amber" />
      </section>

      <form className="mb-[18px] panel grid gap-4 p-6" onSubmit={handleCreate}>
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#17b26a]">Team Directory</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#070c11]">Add new team member</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_220px]">
          <input className="input" placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          <input className="input" placeholder="Email" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required />
          <select className="input" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}>
            {departmentOptions.map((department) => <option key={department}>{department}</option>)}
          </select>
          <input className="input" placeholder="Designation" value={draft.designation} onChange={(event) => setDraft({ ...draft, designation: event.target.value })} required />
          <select className="input" value={draft.status || "current"} onChange={(event) => setDraft({ ...draft, status: event.target.value as DirectoryTeamMember["status"] })}>
            <option value="current">Current Team Member</option>
            <option value="ex">Ex-Team Member</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#667085]">{message}</p>
          <button className="btn-primary" disabled={busy} type="submit">{busy ? "Saving..." : "Add Team Member"}</button>
        </div>
      </form>

      <TeamMembersTable busy={busy} editing={editing} members={members} setEditing={setEditing} onUpdate={handleUpdate} />
    </div>
  );
}

function TeamStatCard({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: "blue" | "green" | "amber" }) {
  const toneClass = {
    blue: "before:bg-[#2e90fa]",
    green: "before:bg-[#17b26a]",
    amber: "before:bg-[#f79009]",
  }[tone];

  return (
    <article className={`relative overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white px-5 py-[18px] shadow-[0_8px_24px_rgba(16,24,40,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-[''] ${toneClass}`}>
      <p className="mb-3.5 text-sm font-semibold text-[#475467]">{label}</p>
      <strong className="mb-1 block text-[36px] leading-none font-semibold text-[#070c11]">{value}</strong>
      <span className="text-sm text-[#667085]">{hint}</span>
    </article>
  );
}

function TeamMembersTable({
  members,
  editing,
  busy,
  setEditing,
  onUpdate,
}: {
  members: DirectoryTeamMember[];
  editing: DirectoryTeamMember | null;
  busy: boolean;
  setEditing: (member: DirectoryTeamMember | null) => void;
  onUpdate: (member: DirectoryTeamMember) => Promise<void>;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d7dfeb] px-6 py-4">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#17b26a]">Member List</p>
        <h2 className="mt-2 text-2xl font-semibold text-[#070c11]">All team members</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[#f4f6fa] text-xs uppercase tracking-wide text-[#65728a]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d6deeb]">
            {members.map((member) => {
              const isEditing = editing?.id === member.id;
              const value = isEditing ? editing : member;
              return (
                <tr key={member.id}>
                  <td className="px-4 py-3">
                    {isEditing ? <input className="input" value={value.name} onChange={(event) => setEditing({ ...value, name: event.target.value })} /> : member.name}
                  </td>
                  <td className="px-4 py-3 text-[#65728a]">
                    {isEditing ? <input className="input" type="email" value={value.email} onChange={(event) => setEditing({ ...value, email: event.target.value })} /> : member.email}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select className="input" value={value.department || departmentOptions[0]} onChange={(event) => setEditing({ ...value, department: event.target.value })}>
                        {departmentOptions.map((department) => <option key={department}>{department}</option>)}
                      </select>
                    ) : member.department}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? <input className="input" value={value.designation} onChange={(event) => setEditing({ ...value, designation: event.target.value })} /> : member.designation}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select className="input" value={value.status || "current"} onChange={(event) => setEditing({ ...value, status: event.target.value as DirectoryTeamMember["status"] })}>
                        <option value="current">Current Team Member</option>
                        <option value="ex">Ex-Team Member</option>
                      </select>
                    ) : (
                      <span className={`badge ${member.status === "ex" ? "bg-[#fffaeb] text-[#b54708]" : "bg-[#ecfdf3] text-[#067647]"}`}>
                        {member.status === "ex" ? "Ex-Team Member" : "Current Team Member"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary px-3 py-1.5" type="button" onClick={() => setEditing(null)}>Cancel</button>
                        <button className="btn-primary px-3 py-1.5" disabled={busy} type="button" onClick={() => onUpdate(value)}>Save</button>
                      </div>
                    ) : (
                      <button className="btn-secondary px-3 py-1.5" type="button" onClick={() => setEditing(member)}>Edit</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!members.length ? (
              <tr>
                <td className="px-4 py-8 text-center text-[#667085]" colSpan={6}>No team members yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
