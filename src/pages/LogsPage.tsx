import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { deleteAuditLog } from "@/lib/auditLog";
import { db } from "@/lib/firebase";
import type { AuditLog, AuditLogDetail, DirectoryTeamMember, Project, UserProfile } from "@/types";

const inputClass = "input w-full px-[14px] py-3";

function StatCard({ label, value, hint, accentClass }: { label: string; value: number; hint: string; accentClass: string }) {
  return (
    <article className={`relative overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white px-5 py-[18px] shadow-[0_8px_24px_rgba(16,24,40,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-[''] ${accentClass}`}>
      <p className="mb-3.5 text-sm font-semibold text-[#475467]">{label}</p>
      <strong className="mb-1 block text-[36px] leading-none font-semibold text-[#070c11]">{value}</strong>
      <span className="text-sm text-[#667085]">{hint}</span>
    </article>
  );
}

function formatLogTimestamp(value?: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function displayAuditValue(value?: string) {
  return value || "Empty";
}

function getDetailEntries(log: AuditLog) {
  return (log.history || []).flatMap((historyItem) => historyItem.detailsEntries || []);
}

function getPrimaryLogDetail(log: AuditLog) {
  const detailEntries = getDetailEntries(log);
  return {
    entry: detailEntries[0] || null,
    remainingCount: Math.max(0, detailEntries.length - 1),
  };
}

function buildLogTooltip(log: AuditLog, resolvedUserName: string) {
  const primaryDetail = getPrimaryLogDetail(log);
  return [
    `Project: ${log.projectName || "Workspace"}`,
    `Category: ${log.actionLabel || "Activity"}`,
    `Task: ${primaryDetail.entry?.task || "No task detail"}`,
    `Field: ${primaryDetail.entry?.field || "Summary"}`,
    `From: ${displayAuditValue(primaryDetail.entry?.from || log.details)}`,
    `To: ${displayAuditValue(primaryDetail.entry?.to || "Updated")}`,
    `Owner: ${resolvedUserName}`,
    `Date: ${formatLogTimestamp(log.createdAt)}`,
  ].join("\n");
}

export function LogsPage() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teamMembers, setTeamMembers] = useState<DirectoryTeamMember[]>([]);
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedAction, setSelectedAction] = useState("all");
  const [selectedStartDate, setSelectedStartDate] = useState("");
  const [selectedEndDate, setSelectedEndDate] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<{ content: string; x: number; y: number } | null>(null);
  const isSuperAdmin = profile?.role === "super_admin";
  const desktopGridClass = isSuperAdmin
    ? "grid-cols-[142px_180px_208px_140px_minmax(0,1fr)_minmax(0,1fr)_160px_170px_74px]"
    : "grid-cols-[142px_180px_208px_140px_minmax(0,1fr)_minmax(0,1fr)_160px_170px]";

  useEffect(() => {
    const unsubscribeLogs = onSnapshot(query(collection(db, "logs"), orderBy("createdAt", "desc")), (snapshot) => {
      setLogs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as AuditLog));
    });
    const unsubscribeProjects = onSnapshot(collection(db, "projects"), (snapshot) => {
      setProjects(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Project));
    });
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }) as UserProfile));
    });
    const unsubscribeMembers = onSnapshot(collection(db, "teamMembers"), (snapshot) => {
      setTeamMembers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DirectoryTeamMember));
    });
    return () => {
      unsubscribeLogs();
      unsubscribeProjects();
      unsubscribeUsers();
      unsubscribeMembers();
    };
  }, []);

  useEffect(() => {
    if (!selectedLog) return undefined;
    const handleEscapeClose = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedLog(null);
    };
    document.addEventListener("keydown", handleEscapeClose);
    return () => document.removeEventListener("keydown", handleEscapeClose);
  }, [selectedLog]);

  const userDirectory = useMemo(() => {
    const mapped = new Map<string, string>();
    users.forEach((user) => {
      if (user.email) mapped.set(user.email.toLowerCase(), user.name || user.email);
    });
    teamMembers.forEach((member) => {
      if (member.email && !mapped.has(member.email.toLowerCase())) mapped.set(member.email.toLowerCase(), member.name || member.email);
    });
    return mapped;
  }, [teamMembers, users]);

  const resolveUserName = (log: AuditLog) =>
    userDirectory.get(String(log.userEmail || "").toLowerCase()) || log.userName || log.userEmail || "Unknown user";

  const userOptions = useMemo(() => {
    const mapped = new Map<string, string>();
    logs.forEach((log) => {
      const userEmail = String(log.userEmail || "").trim();
      if (userEmail) mapped.set(userEmail, resolveUserName(log));
    });
    return Array.from(mapped.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((leftUser, rightUser) => leftUser.name.localeCompare(rightUser.name));
  }, [logs, userDirectory]);

  const projectOptions = useMemo(() => {
    const mapped = new Map<string, string>();
    projects.forEach((project) => mapped.set(project.id, project.name));
    logs.forEach((log) => {
      if (log.projectId && log.projectName && !mapped.has(log.projectId)) mapped.set(log.projectId, log.projectName);
    });
    return Array.from(mapped.entries()).map(([id, name]) => ({ id, name }));
  }, [logs, projects]);

  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.actionLabel).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [logs],
  );

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (selectedUser !== "all" && log.userEmail !== selectedUser) return false;
        if (selectedProject !== "all" && log.projectId !== selectedProject) return false;
        if (selectedAction !== "all" && log.actionLabel !== selectedAction) return false;
        const logDate = String(log.createdAt || "").slice(0, 10);
        if (selectedStartDate && logDate < selectedStartDate) return false;
        if (selectedEndDate && logDate > selectedEndDate) return false;
        return true;
      }),
    [logs, selectedAction, selectedEndDate, selectedProject, selectedStartDate, selectedUser],
  );

  const todayLogCount = logs.filter((log) => String(log.createdAt || "").startsWith(new Date().toISOString().slice(0, 10))).length;

  function resetFilters() {
    setSelectedUser("all");
    setSelectedProject("all");
    setSelectedAction("all");
    setSelectedStartDate("");
    setSelectedEndDate("");
  }

  function showTooltip(event: React.MouseEvent, content: string) {
    setHoveredTooltip({ content, x: event.clientX + 16, y: event.clientY + 16 });
  }

  function moveTooltip(event: React.MouseEvent) {
    setHoveredTooltip((current) => (current ? { ...current, x: event.clientX + 16, y: event.clientY + 16 } : current));
  }

  return (
    <AuthGuard>
      <DashboardLayout title="Activity Logs" description="Review changes made across projects, GEO task lists, users, and team records.">
        <div>
          <section className="mb-[18px] grid grid-cols-1 gap-4 xl:grid-cols-4">
            <StatCard label="Total Log Entries" value={logs.length} hint="All stored activity in the workspace" accentClass="before:bg-[#2e90fa]" />
            <StatCard label="Filtered Results" value={filteredLogs.length} hint="Logs matching your current filters" accentClass="before:bg-[#17b26a]" />
            <StatCard label="Users Captured" value={userOptions.length} hint="People recorded in the audit trail" accentClass="before:bg-[#f79009]" />
            <StatCard label="Today's Activity" value={todayLogCount} hint="Entries created today" accentClass="before:bg-[#f04438]" />
          </section>

          <section className="mb-[18px] rounded-[8px] border border-[#d7dfeb] bg-white p-[16px] shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
            <div className="grid w-full grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_180px_180px_auto]">
              <select className={inputClass} value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}>
                <option value="all">All users</option>
                {userOptions.map((user) => <option key={user.email} value={user.email}>{user.name}</option>)}
              </select>
              <select className={inputClass} value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
                <option value="all">All projects</option>
                {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <select className={inputClass} value={selectedAction} onChange={(event) => setSelectedAction(event.target.value)}>
                <option value="all">All activity types</option>
                {actionOptions.map((actionLabel) => <option key={actionLabel} value={actionLabel}>{actionLabel}</option>)}
              </select>
              <input className={inputClass} type="date" value={selectedStartDate} onChange={(event) => setSelectedStartDate(event.target.value)} />
              <input className={inputClass} type="date" value={selectedEndDate} onChange={(event) => setSelectedEndDate(event.target.value)} />
              <button className="btn-secondary" type="button" onClick={resetFilters}>Reset Filters</button>
            </div>
          </section>

          <section className="rounded-[8px] border border-[#d7dfeb] bg-white shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
            {filteredLogs.length ? (
              <>
                <div className="hidden xl:block">
                  <div className={`grid ${desktopGridClass} gap-0 rounded-t-[8px] bg-white px-0`}>
                    {["Project", "Category", "Task", "Field", "From", "To", "Owner", "Date", ...(isSuperAdmin ? ["Action"] : [])].map((heading) => (
                      <div key={heading} className={`border-b border-[#d7dfeb] px-4 py-4 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#667085] ${heading === "Action" ? "text-center" : "text-left"}`}>
                        {heading}
                      </div>
                    ))}
                  </div>
                  <div className="divide-y divide-[#d7dfeb]">
                    {filteredLogs.map((log, index) => {
                      const primaryDetail = getPrimaryLogDetail(log);
                      const tooltipText = buildLogTooltip(log, resolveUserName(log));
                      return (
                        <div
                          key={log.id}
                          className={`grid ${desktopGridClass} gap-0 px-0 transition duration-200 hover:bg-[#f8fafc] ${index % 2 === 1 ? "bg-[#fcfdff]" : "bg-white"}`}
                          onClick={() => setSelectedLog(log)}
                          onMouseEnter={(event) => showTooltip(event, tooltipText)}
                          onMouseMove={moveTooltip}
                          onMouseLeave={() => setHoveredTooltip(null)}
                          role="button"
                          tabIndex={0}
                        >
                          <LogCell strong>{log.projectName || "Workspace"}</LogCell>
                          <LogCell strong>{log.actionLabel}</LogCell>
                          <LogCell>{primaryDetail.entry?.task || "No task detail"}{primaryDetail.remainingCount > 0 ? ` | +${primaryDetail.remainingCount} more` : ""}</LogCell>
                          <LogCell>{primaryDetail.entry?.field || "Summary"}</LogCell>
                          <LogCell>{displayAuditValue(primaryDetail.entry?.from || log.details)}</LogCell>
                          <LogCell strong={false}>{displayAuditValue(primaryDetail.entry?.to || "Updated")}</LogCell>
                          <LogCell strong>{resolveUserName(log)}</LogCell>
                          <LogCell>{formatLogTimestamp(log.createdAt)}</LogCell>
                          {isSuperAdmin ? (
                            <div className="flex items-center justify-center px-3 py-2">
                              <button
                                aria-label="Delete log"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[rgba(240,68,56,0.24)] bg-white text-[#f04438] transition duration-200 hover:-translate-y-px hover:border-[#f04438] hover:bg-[#fff5f5]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteAuditLog(log.id);
                                }}
                                title="Delete log"
                                type="button"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 p-[16px] xl:hidden">
                  {filteredLogs.map((log) => {
                    const primaryDetail = getPrimaryLogDetail(log);
                    const tooltipText = buildLogTooltip(log, resolveUserName(log));
                    return (
                      <article
                        key={log.id}
                        className="grid gap-3 rounded-[8px] border border-[#d7dfeb] bg-[#fcfdff] p-[16px]"
                        onClick={() => setSelectedLog(log)}
                        onMouseEnter={(event) => showTooltip(event, tooltipText)}
                        onMouseMove={moveTooltip}
                        onMouseLeave={() => setHoveredTooltip(null)}
                      >
                        <MobileLogRow label="Project" value={log.projectName || "Workspace"} strong />
                        <MobileLogRow label="Category" value={log.actionLabel} strong />
                        <MobileLogRow label="Task" value={primaryDetail.entry?.task || "No task detail"} />
                        <MobileLogRow label="Field" value={primaryDetail.entry?.field || "Summary"} />
                        <MobileLogRow label="From" value={displayAuditValue(primaryDetail.entry?.from || log.details)} />
                        <MobileLogRow label="To" value={displayAuditValue(primaryDetail.entry?.to || "Updated")} />
                        <MobileLogRow label="Owner" value={resolveUserName(log)} strong />
                        <MobileLogRow label="Date" value={formatLogTimestamp(log.createdAt)} />
                        {primaryDetail.remainingCount > 0 ? <div className="text-xs font-semibold text-[#17b26a]">+{primaryDetail.remainingCount} more change{primaryDetail.remainingCount > 1 ? "s" : ""}</div> : null}
                        {isSuperAdmin ? (
                          <div className="flex justify-end">
                            <button
                              aria-label="Delete log"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[rgba(240,68,56,0.24)] bg-white text-[#f04438]"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteAuditLog(log.id);
                              }}
                              type="button"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="m-[16px] rounded-[8px] border border-dashed border-[#c5d0de] bg-[#fbfcfe] p-[16px] text-[#667085]">
                No log entries match the current filters.
              </div>
            )}
          </section>

          {selectedLog ? (
            <LogDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} resolveUserName={resolveUserName} />
          ) : null}

          {hoveredTooltip ? (
            <div
              className="pointer-events-none fixed z-[3100] max-w-[360px] whitespace-pre-line rounded-[8px] border border-[#d7dfeb] bg-[#070c11] px-3 py-2 text-xs leading-[1.5] text-white shadow-[0_16px_32px_rgba(16,24,40,0.22)]"
              style={{ left: hoveredTooltip.x, top: hoveredTooltip.y }}
            >
              {hoveredTooltip.content}
            </div>
          ) : null}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

function LogCell({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center px-4 py-2 text-[14px] ${strong ? "font-semibold text-[#070c11]" : "text-[#475467]"}`}>
      <span className="truncate">{children}</span>
    </div>
  );
}

function MobileLogRow({ label, value, strong = false }: { label: string; value?: string; strong?: boolean }) {
  return (
    <div className="grid gap-2">
      <div className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#667085]">{label}</div>
      <div className={`text-[14px] ${strong ? "font-semibold text-[#070c11]" : "text-[#475467]"}`}>{value || "Empty"}</div>
    </div>
  );
}

function LogDetailsModal({ log, onClose, resolveUserName }: { log: AuditLog; onClose: () => void; resolveUserName: (log: AuditLog) => string }) {
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-[rgba(7,12,17,0.22)] px-4 py-6" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-[980px] overflow-y-auto rounded-[8px] bg-white shadow-[0_24px_64px_rgba(16,24,40,0.24)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-[#d7dfeb] px-6 py-4">
          <div>
            <h3 className="m-0 text-[18px] leading-[1.25] font-semibold text-[#070c11]">{log.actionLabel}</h3>
            <p className="mt-1 text-sm text-[#667085]">{log.projectName || "Workspace"} | {resolveUserName(log)} | {formatLogTimestamp(log.createdAt)}</p>
          </div>
          <button aria-label="Close log details" className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#d7dfeb] bg-white text-[#475467] transition duration-200 hover:-translate-y-px" onClick={onClose} type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path d="M6 6 18 18M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" /></svg>
          </button>
        </div>
        <div className="grid gap-4 px-6 py-5">
          {(log.history || []).length ? (
            (log.history || []).map((historyItem, historyIndex) => (
              <section key={historyItem.id || `${log.id}-${historyIndex}`} className="rounded-[8px] border border-[#d7dfeb] bg-[#fcfdff] p-[16px]">
                <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <div className="text-sm font-semibold text-[#070c11]">{historyItem.summary || "Detailed change log"}</div>
                  <div className="text-sm text-[#667085]">{formatLogTimestamp(historyItem.changedAt || log.createdAt)}</div>
                </div>
                {historyItem.detailsEntries?.length ? <DetailEntriesTable entries={historyItem.detailsEntries} /> : <div className="text-sm text-[#667085]">No field-level detail was stored for this log entry.</div>}
              </section>
            ))
          ) : (
            <div className="rounded-[8px] border border-[#d7dfeb] bg-[#fcfdff] p-[16px] text-sm text-[#667085]">No detailed history is available for this log entry.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailEntriesTable({ entries }: { entries: AuditLogDetail[] }) {
  return (
    <div className="overflow-x-auto rounded-[8px] border border-[#d7dfeb] bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[#f8fafc] text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
          <tr>{["Task", "Field", "From", "To"].map((heading) => <th className="px-4 py-3" key={heading}>{heading}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#d7dfeb]">
          {entries.map((entry, entryIndex) => (
            <tr key={`${entry.field}-${entryIndex}`}>
              <td className="px-4 py-3 font-semibold text-[#070c11]">{entry.task || "Record"}</td>
              <td className="px-4 py-3 text-[#475467]">{entry.field}</td>
              <td className="px-4 py-3 text-[#475467]">{displayAuditValue(entry.from)}</td>
              <td className="px-4 py-3 text-[#070c11]">{displayAuditValue(entry.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M4 7h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      <path d="M9 7V5.8C9 4.81 9.81 4 10.8 4h2.4C14.19 4 15 4.81 15 5.8V7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      <path d="M7 7l.8 11.2A2 2 0 0 0 9.79 20h4.42a2 2 0 0 0 1.99-1.8L17 7" fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round" strokeWidth="1.9" />
      <path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}
