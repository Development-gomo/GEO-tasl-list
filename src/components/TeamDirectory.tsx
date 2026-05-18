import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { formatLoadError } from "@/lib/loadError";
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

type TeamTab = "all" | "current" | "ex";

export function TeamDirectory({
  isCreateOpen,
  onCreateOpenChange,
}: {
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { clearLoadError, reportLoadError } = useAuth();
  const [members, setMembers] = useState<DirectoryTeamMember[]>([]);
  const [draft, setDraft] = useState<TeamMemberDraft>(emptyDraft);
  const [editing, setEditing] = useState<DirectoryTeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TeamTab>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "teamMembers"), orderBy("name")), (snapshot) => {
      clearLoadError("team-directory");
      setMembers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DirectoryTeamMember));
    }, (error) => {
      reportLoadError("team-directory", formatLoadError("Team directory", error));
    });
    return unsubscribe;
  }, [clearLoadError, reportLoadError]);

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
      onCreateOpenChange(false);
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
  const departments = useMemo(() => {
    return Array.from(new Set(members.map((member) => member.department).filter(Boolean))).sort();
  }, [members]);
  const filteredMembers = members.filter((member) => {
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "current" && (member.status || "current") === "current") ||
      (activeTab === "ex" && member.status === "ex");
    const matchesDepartment = departmentFilter === "all" || member.department === departmentFilter;
    return matchesTab && matchesDepartment;
  });
  const tabs = [
    { id: "all", label: "Total Members", count: members.length },
    { id: "current", label: "Current Team", count: currentMembers.length },
    { id: "ex", label: "Ex-Team Members", count: exMembers.length },
  ] as const;

  return (
    <div>
      <CreateTeamMemberModal
        busy={busy}
        draft={draft}
        isOpen={isCreateOpen}
        message={message}
        setDraft={setDraft}
        onClose={() => onCreateOpenChange(false)}
        onSubmit={handleCreate}
      />

      <TeamMembersTable
        activeTab={activeTab}
        busy={busy}
        departmentFilter={departmentFilter}
        departments={departments}
        editing={editing}
        members={filteredMembers}
        setActiveTab={setActiveTab}
        setDepartmentFilter={setDepartmentFilter}
        setEditing={setEditing}
        tabs={tabs}
        onUpdate={handleUpdate}
      />
    </div>
  );
}

function TeamMembersTable({
  activeTab,
  members,
  editing,
  busy,
  departmentFilter,
  departments,
  tabs,
  setActiveTab,
  setDepartmentFilter,
  setEditing,
  onUpdate,
}: {
  activeTab: TeamTab;
  members: DirectoryTeamMember[];
  editing: DirectoryTeamMember | null;
  busy: boolean;
  departmentFilter: string;
  departments: string[];
  tabs: readonly { id: TeamTab; label: string; count: number }[];
  setActiveTab: (tab: TeamTab) => void;
  setDepartmentFilter: (department: string) => void;
  setEditing: (member: DirectoryTeamMember | null) => void;
  onUpdate: (member: DirectoryTeamMember) => Promise<void>;
}) {
  return (
    <section className="panel overflow-hidden shadow-[0_18px_40px_rgba(16,24,40,0.06)]">
      <div className="flex flex-col gap-4 border-b border-[#d7dfeb] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit rounded-[8px] border border-[#cfd9e8] bg-white p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`rounded-[8px] px-4 py-2.5 text-sm font-semibold transition ${activeTab === tab.id ? "bg-[#e8f8ef] text-[#17b26a]" : "text-[#475467] hover:bg-[#f7fafc]"}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <select className="input min-h-[48px] w-full lg:w-[260px]" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
          <option value="all">All departments</option>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-[#f4f6fa] text-xs uppercase tracking-wide text-[#65728a]">
            <tr>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Department</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d6deeb]">
            {members.map((member) => {
              const isEditing = editing?.id === member.id;
              const value = isEditing ? editing : member;
              return (
                <tr key={member.id}>
                  <td className="px-6 py-5 font-semibold text-[#070c11]">
                    {isEditing ? <input className="input w-full" value={value.name} onChange={(event) => setEditing({ ...value, name: event.target.value })} /> : member.name}
                  </td>
                  <td className="px-6 py-5 text-[#65728a]">
                    {isEditing ? <input className="input w-full" type="email" value={value.email} onChange={(event) => setEditing({ ...value, email: event.target.value })} /> : member.email}
                  </td>
                  <td className="px-6 py-5">
                    {isEditing ? (
                      <select className="input w-full" value={value.department || departmentOptions[0]} onChange={(event) => setEditing({ ...value, department: event.target.value })}>
                        {departmentOptions.map((department) => <option key={department}>{department}</option>)}
                      </select>
                    ) : member.department}
                  </td>
                  <td className="px-6 py-5">
                    {isEditing ? (
                      <select className="input w-full" value={value.status || "current"} onChange={(event) => setEditing({ ...value, status: event.target.value as DirectoryTeamMember["status"] })}>
                        <option value="current">Current Team Member</option>
                        <option value="ex">Ex-Team Member</option>
                      </select>
                    ) : (
                      <span className={`badge ${member.status === "ex" ? "bg-[#fffaeb] text-[#b54708]" : "bg-[#ecfdf3] text-[#067647]"}`}>
                        {member.status === "ex" ? "ex" : "current"}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary px-3 py-1.5" type="button" onClick={() => setEditing(null)}>Cancel</button>
                        <button className="btn-primary px-3 py-1.5" disabled={busy} type="button" onClick={() => onUpdate(value)}>Save</button>
                      </div>
                    ) : (
                      <IconButton label={`Edit ${member.name}`} title="Edit team member" onClick={() => setEditing(member)}>
                        <EditIcon />
                      </IconButton>
                    )}
                  </td>
                </tr>
              );
            })}
            {!members.length ? (
              <tr>
                <td className="px-6 py-8 text-center text-[#667085]" colSpan={5}>No team members found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CreateTeamMemberModal({
  busy,
  draft,
  isOpen,
  message,
  setDraft,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  draft: TeamMemberDraft;
  isOpen: boolean;
  message: string;
  setDraft: (draft: TeamMemberDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!isOpen) return null;

  return (
    <Modal title="Add team member" onClose={onClose}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <label className="field">
          <span>Name</span>
          <input className="input min-h-[46px]" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
        </label>
        <label className="field">
          <span>Email</span>
          <input className="input min-h-[46px]" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required />
        </label>
        <label className="field">
          <span>Department</span>
          <select className="input min-h-[46px]" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}>
            {departmentOptions.map((department) => <option key={department}>{department}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Designation</span>
          <input className="input min-h-[46px]" value={draft.designation} onChange={(event) => setDraft({ ...draft, designation: event.target.value })} required />
        </label>
        <label className="field">
          <span>Status</span>
          <select className="input min-h-[46px]" value={draft.status || "current"} onChange={(event) => setDraft({ ...draft, status: event.target.value as DirectoryTeamMember["status"] })}>
            <option value="current">Current Team Member</option>
            <option value="ex">Ex-Team Member</option>
          </select>
        </label>
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-sm text-[#667085]">{message}</p>
          <div className="flex gap-2">
            <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy} type="submit">{busy ? "Saving..." : "Add Team Member"}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ children, title, onClose }: { children: ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0f172a]/35 px-4 py-6">
      <section className="w-full max-w-[560px] rounded-[8px] border border-[#d7dfeb] bg-white shadow-[0_24px_70px_rgba(16,24,40,0.22)]">
        <div className="flex items-center justify-between border-b border-[#d7dfeb] px-6 py-4">
          <h2 className="text-xl font-semibold text-[#070c11]">{title}</h2>
          <button className="btn-secondary h-9 w-9 px-0 py-0 text-lg" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        <div className="p-6">{children}</div>
      </section>
    </div>
  );
}

function IconButton({ children, label, title, onClick }: { children: ReactNode; label: string; title: string; onClick: () => void }) {
  return (
    <button className="gantt-grid-edit h-10 w-10" type="button" aria-label={label} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l9.8-9.8-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="m12.8 6.2 4 4 1.8-1.8a1.9 1.9 0 0 0 0-2.8l-1.2-1.2a1.9 1.9 0 0 0-2.8 0l-1.8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    </svg>
  );
}
