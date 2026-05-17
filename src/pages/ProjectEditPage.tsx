import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { deleteProject, updateProjectBasics } from "@/lib/firestore";
import type { DirectoryTeamMember, Project, TeamMember } from "@/types";

const labelClass = "grid gap-2 text-sm font-semibold text-[#475467]";
const inputClass = "input w-full px-[14px] py-3";

type ProjectFormState = {
  name: string;
  status: NonNullable<Project["status"]>;
  description: string;
};

export function ProjectEditPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [directoryMembers, setDirectoryMembers] = useState<DirectoryTeamMember[]>([]);
  const [draftMembers, setDraftMembers] = useState<DirectoryTeamMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [formState, setFormState] = useState<ProjectFormState>({
    name: "",
    status: "active",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const canDeleteProject = profile?.role === "admin" || profile?.role === "super_admin";

  useEffect(() => {
    if (!projectId) return undefined;
    const unsubscribe = onSnapshot(doc(db, "projects", projectId), (snapshot) => {
      if (!snapshot.exists()) {
        setProject(null);
        return;
      }

      const nextProject = { id: snapshot.id, ...snapshot.data() } as Project;
      setProject(nextProject);
      setFormState({
        name: nextProject.name || "",
        status: nextProject.status || "active",
        description: nextProject.description || "",
      });
    });
    return unsubscribe;
  }, [projectId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "teamMembers"), orderBy("name")), (snapshot) => {
      setDirectoryMembers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DirectoryTeamMember));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!projectId || !directoryMembers.length) return undefined;
    const unsubscribe = onSnapshot(query(collection(db, "projects", projectId, "teamMembers"), orderBy("name")), (snapshot) => {
      const projectMembers = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TeamMember);
      setDraftMembers(
        projectMembers.map((member) => {
          const directoryMember = directoryMembers.find((item) => item.id === (member.directoryMemberId || member.id));
          return directoryMember || {
            id: member.directoryMemberId || member.id,
            name: member.name,
            email: member.email,
            department: member.department || member.role || "",
            designation: member.designation || member.role || "",
            status: member.status || "current",
          };
        }),
      );
    });
    return unsubscribe;
  }, [directoryMembers, projectId]);

  const availableMembers = useMemo(
    () => directoryMembers.filter((member) => !draftMembers.some((draftMember) => draftMember.id === member.id)),
    [directoryMembers, draftMembers],
  );

  if (project === null) {
    return <Navigate to="/projects/" replace />;
  }

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
    if (!projectId || !formState.name.trim()) return;

    setBusy(true);
    await updateProjectBasics(
      projectId,
      {
        name: formState.name.trim(),
        status: formState.status,
        description: formState.description.trim(),
      },
      draftMembers,
    );
    setBusy(false);
    navigate(`/projects/${projectId}`);
  }

  async function handleConfirmDelete() {
    if (!projectId) return;
    setBusy(true);
    await deleteProject(projectId);
    setBusy(false);
    navigate("/projects/");
  }

  return (
    <AuthGuard>
      <DashboardLayout
        title="Edit Project"
        description="Update project details and attach team members from the shared directory."
        actions={<Link className="btn-secondary h-12 px-5" to={projectId ? `/projects/${projectId}` : "/projects"}>Back to Project</Link>}
      >
        {project === undefined ? (
          <section className="panel p-6 text-sm text-[#667085]">Loading project...</section>
        ) : (
          <div>
            <section className="overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
              <form className="grid" onSubmit={handleSubmit}>
                <div className="grid gap-3 rounded-[8px] bg-white p-[18px]">
                  <h3 className="mb-0.5 text-lg font-semibold text-[#070c11]">Project Information</h3>

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
                      onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as ProjectFormState["status"] }))}
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
                    <h3 className="text-lg font-semibold text-[#070c11]">Team Members</h3>
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
                  {canDeleteProject ? (
                    <button className="btn-secondary border-[#ffd5d2] text-[#f04438] md:mr-auto" type="button" onClick={() => setIsDeleteConfirmOpen(true)}>
                      Delete Project
                    </button>
                  ) : null}
                  <button className="btn-secondary" type="button" onClick={() => navigate(`/projects/${projectId}`)}>Cancel</button>
                  <button className="btn-primary" disabled={busy} type="submit">{busy ? "Saving..." : "Save Changes"}</button>
                </div>
              </form>
            </section>

            {isDeleteConfirmOpen && canDeleteProject ? (
              <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-[rgba(7,12,17,0.22)] px-4 py-6">
                <div className="w-full max-w-[520px] overflow-hidden rounded-[8px] bg-white shadow-[0_24px_64px_rgba(16,24,40,0.24)]">
                  <div className="border-b border-[#d7dfeb] px-6 py-4">
                    <h3 className="m-0 text-[18px] leading-[1.25] font-semibold text-[#070c11]">Delete Project</h3>
                  </div>
                  <div className="px-6 py-5 text-sm leading-6 text-[#667085]">
                    Do you really want to delete this project from the tool? This removes the project record from the dashboard.
                  </div>
                  <div className="flex justify-end gap-3 border-t border-[#d7dfeb] bg-[#fcfdff] px-6 py-4">
                    <button className="btn-secondary" type="button" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</button>
                    <button className="btn-primary bg-[#f04438] shadow-[0_10px_20px_rgba(240,68,56,0.18)] hover:bg-[#d92d20]" disabled={busy} type="button" onClick={handleConfirmDelete}>
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DashboardLayout>
    </AuthGuard>
  );
}
