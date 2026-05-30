import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { OperationOverlay } from "@/components/OperationOverlay";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { createProjectFromDirectory, warmEditableGeoTaskListPlanCache } from "@/lib/firestore";
import { formatLoadError } from "@/lib/loadError";
import type { DirectoryTeamMember, Project } from "@/types";

const labelClass = "grid gap-2 text-sm font-semibold text-[#475467]";
const inputClass = "input w-full px-[14px] py-3";

type ProjectCreateFormState = {
  name: string;
  status: NonNullable<Project["status"]>;
  description: string;
};

export function ProjectCreatePage() {
  const navigate = useNavigate();
  const { clearLoadError, firebaseUser, reportLoadError } = useAuth();
  const [directoryMembers, setDirectoryMembers] = useState<DirectoryTeamMember[]>([]);
  const [draftMembers, setDraftMembers] = useState<DirectoryTeamMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [formState, setFormState] = useState<ProjectCreateFormState>({
    name: "",
    status: "active",
    description: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "teamMembers"), orderBy("name")), (snapshot) => {
      clearLoadError("project-create-team-members");
      setDirectoryMembers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DirectoryTeamMember));
    }, (error) => {
      reportLoadError("project-create-team-members", formatLoadError("Team member directory", error));
    });
    return unsubscribe;
  }, [clearLoadError, reportLoadError]);

  useEffect(() => {
    warmEditableGeoTaskListPlanCache().catch((error) => {
      reportLoadError("project-create-template-cache", formatLoadError("GEO task templates", error));
    });
  }, [reportLoadError]);

  const availableMembers = useMemo(
    () => directoryMembers.filter((member) => !draftMembers.some((draftMember) => draftMember.id === member.id)),
    [directoryMembers, draftMembers],
  );

  function handleAddMember() {
    const member = availableMembers.find((item) => item.id === selectedMemberId);
    if (!member) return;
    setDraftMembers((current) => [...current, member]);
    setSelectedMemberId("");
  }

  function handleRemoveMember(memberId: string) {
    setDraftMembers((current) => current.filter((member) => member.id !== memberId));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseUser || !formState.name.trim()) return;

    setBusy(true);
    try {
      const projectId = await createProjectFromDirectory(
        {
          name: formState.name.trim(),
          client: "GO MO Group",
          status: formState.status,
          description: formState.description.trim(),
        },
        firebaseUser.uid,
        draftMembers,
      );
      navigate(`/projects/${projectId}`);
    } catch (error) {
      reportLoadError("project-create-submit", formatLoadError("Project creation", error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGuard>
      <DashboardLayout
        title="Add New Project"
        description="Create a new GEO project, define its status, and attach team members in one flow."
        actions={<Link className="btn-secondary h-12 px-5" to="/projects/">Back to Projects</Link>}
      >
        {busy ? <OperationOverlay title="Creating project" message="Cloning the GEO task templates and setting up the project workspace." /> : null}
        <div>
          <section className="overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
            <form className="grid" onSubmit={handleSubmit}>
              <div className="grid gap-3 rounded-[8px] bg-white p-[18px]">
                <h3 className="mb-0.5 text-lg font-bold text-[#070c11]">Project Information</h3>

                <label className={labelClass}>
                  Project name
                  <input
                    className={inputClass}
                    value={formState.name}
                    onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Client or workspace name"
                    required
                  />
                </label>

                <label className={labelClass}>
                  Project status
                  <select
                    className={inputClass}
                    value={formState.status}
                    onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as ProjectCreateFormState["status"] }))}
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="upcoming">Upcoming</option>
                  </select>
                </label>

                <label className={labelClass}>
                  Description
                  <textarea
                    className={`${inputClass} min-h-24 resize-y`}
                    value={formState.description}
                    onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Short summary of scope and delivery needs"
                  />
                </label>
              </div>

              <div className="border-t border-[#d7dfeb] bg-white p-[18px]">
                <div className="mb-3.5 flex items-center justify-between gap-4">
                  <h3 className="text-lg font-bold text-[#070c11]">Team Members</h3>
                  <span className="inline-flex items-center justify-center rounded-[8px] bg-[#f2f4f7] px-3 py-2 text-[0.84rem] font-bold text-[#475467]">
                    {draftMembers.length} attached
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 xl:grid-cols-4">
                  <select className={`xl:col-span-3 ${inputClass}`} value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>
                    <option value="">Select from team member directory</option>
                    {availableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} - {member.department || "No department"} - {member.status === "ex" ? "Ex-Team Member" : "Current Team Member"}
                      </option>
                    ))}
                  </select>
                  <button className="btn-primary" disabled={!selectedMemberId} type="button" onClick={handleAddMember}>Add Member</button>
                </div>

                <div className="mt-3 grid gap-3">
                  {draftMembers.length ? (
                    draftMembers.map((member) => (
                      <div className="grid grid-cols-1 items-center gap-2 rounded-[8px] border border-[#d7dfeb] bg-[#fcfdff] p-[14px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)_180px_auto]" key={member.id}>
                        <div className="text-sm font-semibold text-[#070c11]">{member.name}</div>
                        <div className="text-sm text-[#667085]">{member.email || "No email"}</div>
                        <div className="text-sm text-[#667085]">{member.department || "No department"}</div>
                        <div className="text-sm text-[#667085]">{member.status === "ex" ? "Ex-Team Member" : "Current Team Member"}</div>
                        <button className="btn-secondary border-[#ffd5d2] text-[#f04438]" type="button" onClick={() => handleRemoveMember(member.id)}>Remove</button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[8px] border border-dashed border-[#c5d0de] bg-[#fbfcfe] p-[14px] text-[#667085]">
                      Pick team members from the shared directory to attach them to this project.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-[#d7dfeb] bg-[#fcfdff] px-[22px] py-[18px] md:flex-row md:justify-end">
                <button className="btn-secondary" type="button" onClick={() => navigate("/projects/")}>Cancel</button>
                <button className="btn-primary" disabled={busy || !firebaseUser} type="submit">{busy ? "Creating..." : "Create Project"}</button>
              </div>
            </form>
          </section>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
