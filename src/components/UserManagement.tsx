import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { createManagedUser, deleteManagedUser, updateManagedUser, userAdminError } from "@/lib/userAdmin";
import type { UserProfile, UserRole, UserStatus } from "@/types";

type UserDraft = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
};

const emptyDraft: UserDraft = {
  name: "",
  email: "",
  password: "",
  role: "user",
  status: "active",
};

const roleLabels: Record<UserRole, string> = {
  super_admin: "super admin",
  admin: "admin",
  user: "user",
};

function creatableRoles(role?: UserRole): UserRole[] {
  if (role === "super_admin") return ["user", "admin", "super_admin"];
  if (role === "admin") return ["user", "admin"];
  if (role === "user") return ["user"];
  return [];
}

function canEditUser(currentRole: UserRole | undefined, target: UserProfile) {
  if (currentRole === "super_admin") return true;
  if (currentRole === "admin") return target.role === "user";
  return false;
}

function canDeleteUser(currentRole: UserRole | undefined, target: UserProfile, currentUid?: string) {
  if (target.uid === currentUid) return false;
  if (currentRole === "super_admin") return true;
  if (currentRole === "admin") return target.role === "user";
  return false;
}

export function UserManagement() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const createRoles = creatableRoles(profile?.role);
  const canCreate = createRoles.length > 0;

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "users"), orderBy("name")), (snapshot) => {
      setUsers(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }) as UserProfile));
    });
    return unsubscribe;
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createManagedUser(draft);
      setDraft(emptyDraft);
      setMessage("User created.");
    } catch (error) {
      setMessage(userAdminError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(user: UserProfile) {
    setBusy(true);
    setMessage("");
    try {
      await updateManagedUser(user);
      setEditing(null);
      setMessage("User updated.");
    } catch (error) {
      setMessage(userAdminError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(user: UserProfile) {
    const confirmed = window.confirm(`Delete ${user.name || user.email}? This removes their app profile.`);
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteManagedUser(user);
      if (editing?.uid === user.uid) setEditing(null);
      setMessage("User deleted.");
    } catch (error) {
      setMessage(userAdminError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      {canCreate ? (
        <form className="panel grid gap-4 p-6" onSubmit={handleCreate}>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#18b866]">Create Access</p>
            <h2 className="mt-2 text-2xl font-bold">Create user</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_160px_160px]">
            <input className="input" placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
            <input className="input" placeholder="Email" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required />
            <input className="input" placeholder="Password" type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} minLength={6} required />
            <select className="input" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}>
              {createRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
            </select>
            <select className="input" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as UserStatus })}>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#65728a]">{message}</p>
            <button className="btn-primary" disabled={busy} type="submit">{busy ? "Working..." : "Create user"}</button>
          </div>
        </form>
      ) : (
        <section className="panel p-6">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#18b866]">User Directory</p>
          <h2 className="mt-2 text-2xl font-bold">Users</h2>
          <p className="mt-2 text-sm text-[#667085]">You can review user access, but your account cannot create or edit users.</p>
        </section>
      )}

      <UserTable busy={busy} currentRole={profile?.role} currentUid={profile?.uid} editing={editing} setEditing={setEditing} users={users} onDelete={handleDelete} onUpdate={handleUpdate} />
    </div>
  );
}

function UserTable({
  users,
  editing,
  currentRole,
  currentUid,
  busy,
  setEditing,
  onDelete,
  onUpdate,
}: {
  users: UserProfile[];
  editing: UserProfile | null;
  currentRole?: UserRole;
  currentUid?: string;
  busy: boolean;
  setEditing: (user: UserProfile | null) => void;
  onDelete: (user: UserProfile) => Promise<void>;
  onUpdate: (user: UserProfile) => Promise<void>;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#f4f6fa] text-xs uppercase tracking-wide text-[#65728a]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d6deeb]">
            {users.map((user) => {
              const isEditing = editing?.uid === user.uid;
              const value = isEditing ? editing : user;
              const editable = canEditUser(currentRole, user);
              const deletable = canDeleteUser(currentRole, user, currentUid);
              const editableRoles = currentRole === "super_admin" ? ["user", "admin", "super_admin"] as UserRole[] : ["user", "admin"] as UserRole[];
              return (
                <tr key={user.uid}>
                  <td className="px-4 py-3">
                    {isEditing ? <input className="input" value={value.name} onChange={(event) => setEditing({ ...value, name: event.target.value })} /> : user.name}
                  </td>
                  <td className="px-4 py-3 text-[#65728a]">{user.email}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select className="input" value={value.role} onChange={(event) => setEditing({ ...value, role: event.target.value as UserRole })}>
                        {editableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                      </select>
                    ) : roleLabels[user.role]}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select className="input" value={value.status} onChange={(event) => setEditing({ ...value, status: event.target.value as UserStatus })}>
                        <option value="active">active</option>
                        <option value="disabled">disabled</option>
                      </select>
                    ) : <span className={`badge ${user.status === "active" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{user.status}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary px-3 py-1.5" type="button" onClick={() => setEditing(null)}>Cancel</button>
                        <button className="btn-primary px-3 py-1.5" disabled={busy} type="button" onClick={() => onUpdate(value)}>Save</button>
                      </div>
                    ) : editable ? (
                      <div className="gantt-actions-cell">
                        <IconButton className="gantt-grid-edit" label={`Edit ${user.name || user.email}`} title="Edit user" onClick={() => setEditing(user)}>
                          <EditIcon />
                        </IconButton>
                        {deletable ? (
                          <IconButton className="gantt-grid-delete" disabled={busy} label={`Delete ${user.name || user.email}`} title="Delete user" onClick={() => onDelete(user)}>
                            <DeleteIcon />
                          </IconButton>
                        ) : null}
                      </div>
                    ) : deletable ? (
                      <div className="gantt-actions-cell">
                        <IconButton className="gantt-grid-delete" disabled={busy} label={`Delete ${user.name || user.email}`} title="Delete user" onClick={() => onDelete(user)}>
                          <DeleteIcon />
                        </IconButton>
                      </div>
                    ) : (
                      <span className="text-sm text-[#98a2b3]">View only</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IconButton({
  children,
  className,
  disabled,
  label,
  title,
  onClick,
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button className={className} disabled={disabled} type="button" aria-label={label} title={title} onClick={onClick}>
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

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9 7V5.8C9 4.81 9.81 4 10.8 4h2.4C14.19 4 15 4.81 15 5.8V7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M7 7l.8 11.2A2 2 0 0 0 9.79 20h4.42a2 2 0 0 0 1.99-1.8L17 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
