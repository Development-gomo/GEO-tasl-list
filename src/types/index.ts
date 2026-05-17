export type UserRole = "super_admin" | "admin" | "user";
export type UserStatus = "active" | "disabled";
export type TaskStatus = "To Do" | "In Progress" | "Blocked" | "Done";
export type PlanType = "30" | "60" | "90";

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  designation?: string;
  status?: "current" | "ex";
  directoryMemberId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DirectoryTeamMember = {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status?: "current" | "ex";
  createdAt?: string;
  updatedAt?: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  client?: string;
  status?: "active" | "completed" | "upcoming";
  teamMemberCount?: number;
  createdBy: string;
  activePlanType: PlanType;
  planTypes: PlanType[];
  progress?: Record<string, ProgressSummary>;
  createdAt?: string;
  updatedAt?: string;
};

export type Plan = {
  id: PlanType;
  type: PlanType;
  label: string;
  disabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Phase = {
  id: string;
  order: number;
  title: string;
  name: string;
  days: string;
};

export type Task = {
  id: string;
  phaseId: string;
  phaseOrder: number;
  dayTarget: string;
  number: string;
  category: string;
  task: string;
  howToExecute: string;
  tools: string;
  dependencyNotes: string;
  owner: string;
  trainingRequired: string;
  quickWin: string;
  status: TaskStatus;
  externalTodoLink: string;
  googleDriveLink: string;
  notes?: string;
  edited?: boolean;
  updatedAt?: string;
};

export type ProgressSummary = {
  done: number;
  total: number;
  pct: number;
};

export type ImportExportMetadata = {
  id: string;
  projectId: string;
  planType: PlanType;
  kind: "import" | "export";
  filename: string;
  rows?: number;
  updatedRows?: number;
  createdBy: string;
  createdAt: string;
};

export type AuditLogDetail = {
  task?: string;
  field: string;
  from?: string;
  to?: string;
};

export type AuditLogHistoryItem = {
  id?: string;
  changedAt?: string;
  summary?: string;
  detailsEntries?: AuditLogDetail[];
};

export type AuditLog = {
  id: string;
  actionLabel: string;
  projectId?: string;
  projectName?: string;
  details?: string;
  history?: AuditLogHistoryItem[];
  userId?: string;
  userEmail?: string;
  userName?: string;
  createdAt: string;
};
