import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { formatLoadError } from "@/lib/loadError";
import { createManagedUser, deleteManagedUser, resetManagedUserPassword, updateManagedUser, userAdminError } from "@/lib/userAdmin";
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

function canResetPassword(currentRole: UserRole | undefined) {
  return currentRole === "super_admin";
}

type UserTab = "all" | "active" | "disabled";

export function UserManagement({
  isCreateOpen,
  onCreateOpenChange,
}: {
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { clearLoadError, profile, reportLoadError } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<UserProfile | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<UserTab>("all");
  const createRoles = creatableRoles(profile?.role);
  const canCreate = createRoles.length > 0;

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "users"), orderBy("name")), (snapshot) => {
      clearLoadError("user-management");
      setUsers(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }) as UserProfile));
    }, (error) => {
      reportLoadError("user-management", formatLoadError("User management", error));
    });
    return unsubscribe;
  }, [clearLoadError, reportLoadError]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createManagedUser(draft);
      setDraft(emptyDraft);
      setMessage("User created.");
      onCreateOpenChange(false);
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
    const confirmed = window.confirm(`Delete ${user.name || user.email}? This removes their app profile and Firebase Authentication account.`);
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

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordResetUser) return;

    setBusy(true);
    setMessage("");
    try {
      await resetManagedUserPassword(passwordResetUser, passwordDraft);
      setPasswordResetUser(null);
      setPasswordDraft("");
      setMessage("Password updated.");
    } catch (error) {
      setMessage(userAdminError(error));
    } finally {
      setBusy(false);
    }
  }

  const activeUsers = users.filter((user) => user.status === "active");
  const disabledUsers = users.filter((user) => user.status === "disabled");
  const filteredUsers = users.filter((user) => activeTab === "all" || user.status === activeTab);
  const tabs = [
    { id: "all", label: "Total Users", count: users.length },
    { id: "active", label: "Current Users", count: activeUsers.length },
    { id: "disabled", label: "Disabled Users", count: disabledUsers.length },
  ] as const;

  return (
    <div>
      <CreateUserModal
        busy={busy}
        canCreate={canCreate}
        createRoles={createRoles}
        draft={draft}
        isOpen={isCreateOpen}
        message={message}
        setDraft={setDraft}
        onClose={() => onCreateOpenChange(false)}
        onSubmit={handleCreate}
      />

      <UserTable
        activeTab={activeTab}
        busy={busy}
        currentRole={profile?.role}
        currentUid={profile?.uid}
        editing={editing}
        setActiveTab={setActiveTab}
        setEditing={setEditing}
        tabs={tabs}
        users={filteredUsers}
        onDelete={handleDelete}
        onResetPassword={(user) => {
          setPasswordResetUser(user);
          setPasswordDraft("");
          setMessage("");
        }}
        onUpdate={handleUpdate}
      />

      <ResetPasswordModal
        busy={busy}
        isOpen={Boolean(passwordResetUser)}
        message={message}
        password={passwordDraft}
        user={passwordResetUser}
        setPassword={setPasswordDraft}
        onClose={() => {
          setPasswordResetUser(null);
          setPasswordDraft("");
        }}
        onSubmit={handlePasswordReset}
      />
    </div>
  );
}

function UserTable({
  activeTab,
  users,
  editing,
  currentRole,
  currentUid,
  busy,
  tabs,
  setActiveTab,
  setEditing,
  onDelete,
  onResetPassword,
  onUpdate,
}: {
  activeTab: UserTab;
  users: UserProfile[];
  editing: UserProfile | null;
  currentRole?: UserRole;
  currentUid?: string;
  busy: boolean;
  tabs: readonly { id: UserTab; label: string; count: number }[];
  setActiveTab: (tab: UserTab) => void;
  setEditing: (user: UserProfile | null) => void;
  onDelete: (user: UserProfile) => Promise<void>;
  onResetPassword: (user: UserProfile) => void;
  onUpdate: (user: UserProfile) => Promise<void>;
}) {
  return (
    <section className="panel overflow-hidden shadow-[0_18px_40px_rgba(16,24,40,0.06)]">
      <div className="border-b border-[#d7dfeb] px-6 py-5">
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
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[#f4f6fa] text-xs uppercase tracking-wide text-[#65728a]">
            <tr>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d6deeb]">
            {users.map((user) => {
              const isEditing = editing?.uid === user.uid;
              const value = isEditing ? editing : user;
              const editable = canEditUser(currentRole, user);
              const deletable = canDeleteUser(currentRole, user, currentUid);
              const passwordResettable = canResetPassword(currentRole);
              const editableRoles = currentRole === "super_admin" ? ["user", "admin", "super_admin"] as UserRole[] : ["user", "admin"] as UserRole[];
              return (
                <tr key={user.uid}>
                  <td className="px-6 py-5 font-semibold text-[#070c11]">
                    {isEditing ? <input className="input w-full" value={value.name} onChange={(event) => setEditing({ ...value, name: event.target.value })} /> : user.name}
                  </td>
                  <td className="px-6 py-5 text-[#65728a]">{user.email}</td>
                  <td className="px-6 py-5">
                    {isEditing ? (
                      <select className="input w-full" value={value.role} onChange={(event) => setEditing({ ...value, role: event.target.value as UserRole })}>
                        {editableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                      </select>
                    ) : roleLabels[user.role]}
                  </td>
                  <td className="px-6 py-5">
                    {isEditing ? (
                      <select className="input w-full" value={value.status} onChange={(event) => setEditing({ ...value, status: event.target.value as UserStatus })}>
                        <option value="active">active</option>
                        <option value="disabled">disabled</option>
                      </select>
                    ) : <span className={`badge ${user.status === "active" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{user.status}</span>}
                  </td>
                  <td className="px-6 py-5 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary px-3 py-1.5" type="button" onClick={() => setEditing(null)}>Cancel</button>
                        <button className="btn-primary px-3 py-1.5" disabled={busy} type="button" onClick={() => onUpdate(value)}>Save</button>
                      </div>
                    ) : editable ? (
                      <div className="gantt-actions-cell">
                        {passwordResettable ? (
                          <IconButton className="gantt-grid-edit" disabled={busy} label={`Reset password for ${user.name || user.email}`} title="Reset password" onClick={() => onResetPassword(user)}>
                            <PasswordIcon />
                          </IconButton>
                        ) : null}
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
                        {passwordResettable ? (
                          <IconButton className="gantt-grid-edit" disabled={busy} label={`Reset password for ${user.name || user.email}`} title="Reset password" onClick={() => onResetPassword(user)}>
                            <PasswordIcon />
                          </IconButton>
                        ) : null}
                        <IconButton className="gantt-grid-delete" disabled={busy} label={`Delete ${user.name || user.email}`} title="Delete user" onClick={() => onDelete(user)}>
                          <DeleteIcon />
                        </IconButton>
                      </div>
                    ) : passwordResettable ? (
                      <div className="gantt-actions-cell">
                        <IconButton className="gantt-grid-edit" disabled={busy} label={`Reset password for ${user.name || user.email}`} title="Reset password" onClick={() => onResetPassword(user)}>
                          <PasswordIcon />
                        </IconButton>
                      </div>
                    ) : (
                      <span className="text-sm text-[#98a2b3]">View only</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!users.length ? (
              <tr>
                <td className="px-6 py-8 text-center text-[#667085]" colSpan={5}>No users found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResetPasswordModal({
  busy,
  isOpen,
  message,
  password,
  user,
  setPassword,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  isOpen: boolean;
  message: string;
  password: string;
  user: UserProfile | null;
  setPassword: (password: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!isOpen || !user) return null;

  return (
    <Modal title="Reset password" onClose={onClose}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div>
          <p className="text-sm font-semibold text-[#070c11]">{user.name || user.email}</p>
          <p className="text-sm text-[#667085]">{user.email}</p>
        </div>
        <label className="field">
          <span>New password</span>
          <input className="input min-h-[46px]" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
        </label>
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-sm text-[#65728a]">{message}</p>
          <div className="flex gap-2">
            <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy || password.length < 6} type="submit">{busy ? "Working..." : "Update password"}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CreateUserModal({
  busy,
  canCreate,
  createRoles,
  draft,
  isOpen,
  message,
  setDraft,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  canCreate: boolean;
  createRoles: UserRole[];
  draft: UserDraft;
  isOpen: boolean;
  message: string;
  setDraft: (draft: UserDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!isOpen) return null;

  return (
    <Modal title="Add new user" onClose={onClose}>
      {canCreate ? (
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
            <span>Password</span>
            <input className="input min-h-[46px]" type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} minLength={6} required />
          </label>
          <label className="field">
            <span>Role</span>
            <select className="input min-h-[46px]" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}>
              {createRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select className="input min-h-[46px]" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as UserStatus })}>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-sm text-[#65728a]">{message}</p>
            <div className="flex gap-2">
              <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={busy} type="submit">{busy ? "Working..." : "Create user"}</button>
            </div>
          </div>
        </form>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-[#667085]">Your account can review user access, but cannot create users.</p>
          <div className="flex justify-end">
            <button className="btn-secondary" type="button" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Modal({ children, title, onClose }: { children: ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0f172a]/35 px-4 py-6">
      <section className="w-full max-w-[560px] rounded-[8px] border border-[#d7dfeb] bg-white shadow-[0_24px_70px_rgba(16,24,40,0.22)]">
        <div className="flex items-center justify-between border-b border-[#d7dfeb] px-6 py-4">
          <h2 className="text-xl font-bold text-[#070c11]">{title}</h2>
          <button className="btn-secondary h-9 w-9 px-0 py-0 text-lg" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        <div className="p-6">{children}</div>
      </section>
    </div>
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

function PasswordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 11V8.5A4 4 0 0 1 15.74 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M7.5 11h9A2.5 2.5 0 0 1 19 13.5v3A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5v-3A2.5 2.5 0 0 1 7.5 11Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M12 14.5v1.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
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
