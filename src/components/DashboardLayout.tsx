import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import logoUrl from "../../images/Primary-logo.webp";

function SidebarIcon({ type }: { type: "projects" | "team-members" | "geo-task-list" | "user-management" | "profile" | "logs" }) {
  if (type === "projects") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-current">
        <rect x="3" y="4" width="8" height="7" rx="2" />
        <rect x="13" y="4" width="8" height="7" rx="2" />
        <rect x="3" y="13" width="8" height="7" rx="2" />
        <rect x="13" y="13" width="8" height="7" rx="2" />
      </svg>
    );
  }

  if (type === "team-members") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0">
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19a4.5 4.5 0 0 1 9 0M13 19a3.5 3.5 0 0 1 7 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "logs") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0">
        <path d="M7 5.5h10M7 12h10M7 18.5h10M4 5.5h.01M4 12h.01M4 18.5h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "user-management") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0">
        <path d="M12 3.8 5.5 6.4v5.4c0 4 2.7 7.7 6.5 8.8 3.8-1.1 6.5-4.8 6.5-8.8V6.4L12 3.8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9.5 11.8 11.1 13.4 14.8 9.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "profile") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0">
      <path d="M7 4h10l3 3v13H7z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 4v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 12h7M10 16h7M10 8h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 shrink-0">
      <path d="M15 7V5.8A1.8 1.8 0 0 0 13.2 4H6.8A1.8 1.8 0 0 0 5 5.8v12.4A1.8 1.8 0 0 0 6.8 20h6.4A1.8 1.8 0 0 0 15 18.2V17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12h9M16 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GomoLogo() {
  return (
    <div className="flex h-[69px] items-center border-b border-[#d7dfeb] px-6" aria-label="Gomo Group">
      <Link to="/projects/" aria-label="Project Dashboard">
        <img className="w-full max-w-[155px]" src={logoUrl} alt="Gomo Group" />
      </Link>
    </div>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex w-full items-center gap-3 rounded-[8px] px-4 py-3 text-left text-sm font-semibold no-underline transition duration-200",
    isActive ? "bg-[#e8f8ef] text-[#17b26a]" : "text-[#475467] hover:-translate-y-px",
  ].join(" ");

export function DashboardLayout({
  children,
  title,
  description,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  const { loadError, logout, profile } = useAuth();
  const { pathname } = useLocation();
  const isProjects = pathname.startsWith("/projects");
  const firstName = profile?.name.trim().split(/\s+/)[0] || "";
  const profileLabel = firstName ? `My Profile (${firstName})` : "My Profile";
  const statusLabel = loadError || "System Healthy";
  const statusDotClass = loadError
    ? "mt-[7px] h-2.5 w-2.5 rounded-full bg-[#f04438] shadow-[0_0_0_6px_rgba(240,68,56,0.12)]"
    : "mt-[7px] h-2.5 w-2.5 rounded-full bg-[#17b26a] shadow-[0_0_0_6px_rgba(23,178,106,0.12)]";

  return (
    <main className="grid h-screen overflow-hidden md:grid-cols-[255px_minmax(0,1fr)]">
      <aside className="flex h-screen flex-col justify-between overflow-hidden border-r border-[#d7dfeb] bg-white">
        <div className="flex min-h-0 flex-col">
          <GomoLogo />

          <nav className="grid content-start gap-2 px-3 py-4" aria-label="Primary navigation">
            <NavLink to="/projects/" className={() => navLinkClass({ isActive: isProjects })}>
              <SidebarIcon type="projects" />
              <span>Projects</span>
            </NavLink>
            <NavLink to="/team-members" className={navLinkClass}>
              <SidebarIcon type="team-members" />
              <span>Team Members</span>
            </NavLink>
            <NavLink to="/geo-task-list" className={navLinkClass}>
              <SidebarIcon type="geo-task-list" />
              <span>GEO Task List</span>
            </NavLink>
          </nav>
        </div>

        <div className="flex-none">
          <div className="px-3 pb-3">
            <NavLink to="/user-management" className={navLinkClass}>
              <SidebarIcon type="user-management" />
              <span>User Management</span>
            </NavLink>
            <NavLink to="/profile" className={navLinkClass}>
              <SidebarIcon type="profile" />
              <span>{profileLabel}</span>
            </NavLink>
            <NavLink to="/logs" className={navLinkClass}>
              <SidebarIcon type="logs" />
              <span>Logs</span>
            </NavLink>
          </div>

          <div className="border-t border-[#d7dfeb] px-6 py-3.5">
            <div className="flex items-start gap-3 text-[#475467]" title={loadError || statusLabel}>
              <span className={statusDotClass} />
              <div>
                <strong className="block text-sm font-semibold text-[#070c11]">{statusLabel}</strong>
              </div>
            </div>

            <button className="mt-5 inline-flex w-full items-center gap-3 rounded-[8px] border border-[#fecaca] bg-white px-5 py-4 text-left text-[15px] font-semibold text-[#ef4444] transition duration-200 hover:-translate-y-px hover:shadow-[0_8px_18px_rgba(239,68,68,0.08)]" onClick={logout} type="button">
              <LogoutIcon />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      <section className="grid h-screen min-w-0 grid-rows-[69px_minmax(0,1fr)] overflow-hidden bg-[#f5f7fb]">
        <header className="sticky top-0 z-20 flex h-[69px] items-center justify-between gap-4 border-b border-[#d7dfeb] bg-white px-6">
          <div>
            <h1 className="m-0 text-[20px] leading-[1.25] font-bold text-[#070c11]">{title}</h1>
            <p className="mt-1 text-sm text-[#667085]">{description}</p>
          </div>
          <div className="flex items-center gap-3">
            {actions}
            <button className="rounded-[8px] border border-[#c5d0de] bg-white px-4 py-2.5 text-sm font-semibold text-[#344054] transition duration-200 hover:-translate-y-px" type="button" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </div>
        </header>

        <div className="min-h-0 overflow-x-hidden overflow-y-auto px-6 py-5">
          {children}
        </div>
      </section>
    </main>
  );
}
