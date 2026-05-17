import { FormEvent, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { updateCurrentUserPassword, userAdminError } from "@/lib/userAdmin";

const labelClass = "grid gap-2 text-sm font-semibold text-[#475467]";
const inputClass = "input w-full px-[14px] py-3";

export function ProfilePage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    setMessage("");
    try {
      await updateCurrentUserPassword(password);
      setPassword("");
      setMessage("Password updated.");
    } catch (error) {
      setMessage(`${userAdminError(error)} If Firebase asks for a recent login, log out and sign in again before changing your password.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGuard>
      <DashboardLayout title="My Profile" description="Update your account password.">
        <div className="grid gap-6">
          <form className="panel grid gap-4 p-6" onSubmit={handlePasswordSubmit}>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#18b866]">Security</p>
              <h2 className="mt-2 text-2xl font-bold">Change password</h2>
            </div>
            <label className={labelClass}>
              New password
              <input className={inputClass} minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#667085]">{message}</p>
              <button className="btn-primary" disabled={busy || !password} type="submit">{busy ? "Saving..." : "Update Password"}</button>
            </div>
          </form>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
