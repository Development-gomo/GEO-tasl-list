import { FirebaseError } from "firebase/app";
import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import logo from "../../images/Primary-logo.webp";

const inputClass =
  "form-field w-full rounded-[8px] border border-[#c5d0de] bg-white px-[14px] py-3 text-sm text-[#070c11] outline-none transition focus:border-[rgba(23,178,106,0.5)] focus:shadow-[0_0_0_4px_rgba(23,178,106,0.08)] disabled:cursor-not-allowed disabled:bg-[#f8fafc]";

export function LoginPage() {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  function loginErrorMessage(error: unknown) {
    if (error instanceof FirebaseError) {
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
        return "Invalid email or password.";
      }
      if (error.code === "auth/too-many-requests") return "Too many attempts. Please wait and try again.";
      if (error.code === "auth/network-request-failed") return "Could not reach Firebase. Check your connection and Firebase config.";
      return error.message;
    }
    return "Could not sign in.";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      await login(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from || "/";
      navigate(from, { replace: true });
    } catch (error) {
      setFormError(loginErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(23,178,106,0.12),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#f4f7fb_100%)] px-6 py-10">
      <div className="grid w-full max-w-[1040px] overflow-hidden rounded-[16px] border border-[#d7dfeb] bg-white shadow-[0_24px_64px_rgba(16,24,40,0.12)] lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden bg-[linear-gradient(160deg,_#f4fff9_0%,_#eff7ff_100%)] p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <img className="max-w-[168px]" src={logo} alt="Gomo Group" />
            <p className="mt-8 mb-3 text-[0.78rem] font-extrabold uppercase tracking-[0.12em] text-[#17b26a]">
              GEO Service Command Centre
            </p>
            <h1 className="m-0 max-w-[420px] text-[32px] leading-[1.15] font-semibold text-[#070c11]">
              Run every GEO rollout from one secure workspace.
            </h1>
            <p className="mt-3 mb-5 max-w-[460px] text-[15px] leading-6 text-[#667085]">
              Plan, assign, edit, track, export, and sync 30/60/90-day client delivery.
            </p>
          </div>

          <ul className="grid gap-4 text-sm text-[#667085]">
            <li className="relative pl-5">
              <span className="absolute left-0 top-2 h-2 w-2 rounded-full bg-[#17b26a]" />
              <strong className="block text-sm font-semibold text-[#070c11]">Project-safe plans</strong>
              <span>Each client gets its own editable copy.</span>
            </li>
            <li className="relative pl-5">
              <span className="absolute left-0 top-2 h-2 w-2 rounded-full bg-[#17b26a]" />
              <strong className="block text-sm font-semibold text-[#070c11]">Clear ownership</strong>
              <span>Assign people, roles, status, and links per task.</span>
            </li>
            <li className="relative pl-5">
              <span className="absolute left-0 top-2 h-2 w-2 rounded-full bg-[#17b26a]" />
              <strong className="block text-sm font-semibold text-[#070c11]">Spreadsheet-ready</strong>
              <span>Export, update offline, and upload changes back.</span>
            </li>
          </ul>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-[420px]">
            <img className="mb-8 max-w-[152px] lg:hidden" src={logo} alt="Gomo Group" />
            <p className="mb-2 text-[0.78rem] font-extrabold uppercase tracking-[0.12em] text-[#17b26a]">
              Sign in
            </p>
            <h2 className="m-0 text-[20px] leading-[1.25] font-semibold text-[#070c11]">
              Access the project workspace
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#667085]">
              Only authenticated team members can view and edit this tool.
            </p>

            {error ? (
              <div className="mt-4 rounded-[8px] border border-[#ffd5d2] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">
                {error}
              </div>
            ) : null}

            <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-semibold text-[#475467]">
                Email
                <input
                  className={inputClass}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  disabled={busy}
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#475467]">
                Password
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  disabled={busy}
                  required
                />
              </label>

              {formError ? (
                <div className="rounded-[8px] border border-[#ffd5d2] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">
                  {formError}
                </div>
              ) : null}

              <button
                type="submit"
                className="mt-2 inline-flex items-center justify-center rounded-[8px] bg-[#17b26a] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(23,178,106,0.16)] transition duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
                disabled={busy}
              >
                {busy ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
