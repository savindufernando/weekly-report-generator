/**
 * TypeScript mirrors of the backend's Pydantic response models.
 *
 * The OpenAPI schema at /api/v1/openapi.json is the source of truth if these
 * ever drift; generating them in CI is the obvious next step.
 */

// ----------------------------------------------------------------- enums

export const REPORT_STATUSES = [
  'NOT_STARTED',
  'DRAFT',
  'SUBMITTED',
  'NEEDS_CORRECTION',
  'APPROVED',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Statuses a report row can actually hold; NOT_STARTED is synthetic. */
export type StoredReportStatus = Exclude<ReportStatus, 'NOT_STARTED'>;

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'BLOCKED',
  'DEFERRED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TYPES = [
  'DEVELOPMENT',
  'TESTING',
  'MEETINGS',
  'DOCUMENTATION',
  'REVIEW',
  'OTHER',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const BLOCKER_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type BlockerSeverity = (typeof BLOCKER_SEVERITIES)[number];

export type ReviewAction = 'APPROVE' | 'REQUEST_CHANGES';
export type RoleCode = 'MEMBER' | 'MANAGER' | 'ADMIN';

/** Capability codes. The UI checks these, never role names. */
export type PermissionCode =
  | 'report.create_own'
  | 'report.edit_own'
  | 'report.submit_own'
  | 'report.view_own'
  | 'report.view_all'
  | 'report.review'
  | 'project.manage'
  | 'user.view_all'
  | 'user.manage_roles'
  | 'dashboard.view'
  | 'ai.query';

// ----------------------------------------------------------------- shared

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserBrief {
  id: number;
  full_name: string;
  avatar_url: string | null;
}

export interface Role {
  code: RoleCode;
  name: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
  role: Role;
  created_at: string;
}

export interface UserInput {
  email: string;
  full_name: string;
  role_code: RoleCode;
  job_title?: string | null;
  /** Omit to have the server generate one and return it once. */
  password?: string;
  manager_id?: number;
}

/** The create response. `temporary_password` is shown once and never again. */
export interface CreatedUser extends User {
  temporary_password: string | null;
}

export interface CurrentUser extends User {
  permissions: PermissionCode[];
}

// ------------------------------------------------------------------ auth

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: CurrentUser;
}

// --------------------------------------------------------------- projects

export interface ProjectBrief {
  id: number;
  name: string;
  code: string;
  color: string;
}

export interface Project extends ProjectBrief {
  description: string | null;
  is_archived: boolean;
  report_count: number;
  member_count: number;
}

export interface ProjectInput {
  name: string;
  code: string;
  description?: string | null;
  color?: string;
}

// ---------------------------------------------------------------- reports

export interface ReportLink {
  label: string;
  url: string;
}

export interface Task {
  id: number;
  name: string;
  priority: TaskPriority;
  status: TaskStatus;
  project_id: number | null;
  planned_pct: number;
  actual_pct: number;
  /** Decimal serialised as a string — never parse into a float for maths. */
  hours_planned: string;
  hours_spent: string;
  deliverable: string | null;
  order_index: number;
}

export interface NextWeekTask {
  id: number;
  description: string;
  priority: TaskPriority;
  order_index: number;
}

export interface Blocker {
  id: number;
  description: string;
  severity: BlockerSeverity;
  is_key: boolean;
  is_resolved: boolean;
  order_index: number;
}

export interface Achievement {
  id: number;
  description: string;
  is_key: boolean;
  order_index: number;
}

export interface ReviewBrief {
  id: number;
  action: ReviewAction;
  comment: string | null;
  /** Which version this comment was written against. */
  against_version: number;
  reviewer: UserBrief;
  created_at: string;
}

export interface ReportListItem {
  id: number;
  week_start: string;
  week_end: string | null;
  status: StoredReportStatus;
  current_version_no: number;
  submission_count: number;
  user: UserBrief;
  project: ProjectBrief;
  task_count: number;
  completed_task_count: number;
  total_hours_spent: string;
  key_blocker: string | null;
  first_submitted_at: string | null;
  last_submitted_at: string | null;
  updated_at: string;
  latest_review: ReviewBrief | null;
}

export interface ReportDetail {
  id: number;
  week_start: string;
  week_end: string | null;
  status: StoredReportStatus;
  current_version_no: number;
  submission_count: number;
  is_editable: boolean;
  user: UserBrief;
  project: ProjectBrief;
  notes: string | null;
  links: ReportLink[];
  tasks: Task[];
  next_week_tasks: NextWeekTask[];
  blockers: Blocker[];
  achievements: Achievement[];
  hours_by_type: Record<string, string>;
  first_submitted_at: string | null;
  last_submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  latest_review: ReviewBrief | null;
}

/** Request body for PUT /reports/{id} — a full replacement, not a patch. */
export interface ReportContentInput {
  project_id: number;
  notes?: string | null;
  links: ReportLink[];
  tasks: TaskInput[];
  next_week_tasks: NextWeekTaskInput[];
  blockers: BlockerInput[];
  achievements: AchievementInput[];
  hours_by_type: Partial<Record<TaskType, string>>;
}

export interface TaskInput {
  name: string;
  priority: TaskPriority;
  status: TaskStatus;
  project_id?: number | null;
  planned_pct: number;
  actual_pct: number;
  hours_planned: string;
  hours_spent: string;
  deliverable?: string | null;
}

export interface NextWeekTaskInput {
  description: string;
  priority: TaskPriority;
}

export interface BlockerInput {
  description: string;
  severity: BlockerSeverity;
  is_key: boolean;
  is_resolved: boolean;
}

export interface AchievementInput {
  description: string;
  is_key: boolean;
}

export interface SubmitResponse {
  id: number;
  status: StoredReportStatus;
  current_version_no: number;
  submission_count: number;
  last_submitted_at: string | null;
  /** e.g. "no_changes_detected" — non-fatal notices. */
  warnings: string[];
}

// --------------------------------------------------------------- versions

export interface ReviewOut {
  id: number;
  action: ReviewAction;
  comment: string | null;
  against_version: number;
  previous_status: StoredReportStatus;
  new_status: StoredReportStatus;
  reviewer: UserBrief;
  created_at: string;
}

export interface VersionSummary {
  version_no: number;
  submitted_at: string;
  submitted_by: UserBrief;
  is_current: boolean;
  content_hash: string;
  /** The action taken against THIS version. */
  review: ReviewOut | null;
}

export interface VersionDetail extends VersionSummary {
  content: VersionContent;
}

/** The frozen snapshot. Denormalised on purpose — a renamed project must not
 *  rewrite what an old version said. */
export interface VersionContent {
  schema_version: number;
  week_start: string;
  week_end: string | null;
  project: { id: number; name: string; code: string };
  notes: string | null;
  links: ReportLink[];
  tasks: Array<{
    name: string;
    priority: TaskPriority;
    status: TaskStatus;
    planned_pct: number;
    actual_pct: number;
    hours_planned: number;
    hours_spent: number;
    deliverable: string | null;
  }>;
  next_week_tasks: Array<{ description: string; priority: TaskPriority }>;
  blockers: Array<{
    description: string;
    severity: BlockerSeverity;
    is_key: boolean;
    is_resolved: boolean;
  }>;
  achievements: Array<{ description: string; is_key: boolean }>;
  hours_by_type: Record<string, number>;
}

export interface ReviewInput {
  action: ReviewAction;
  comment?: string | null;
}

export interface QueueItem {
  id: number;
  week_start: string;
  status: StoredReportStatus;
  current_version_no: number;
  submission_count: number;
  user: { id: number; full_name: string };
  project: { id: number; name: string; color: string };
  last_submitted_at: string | null;
  waiting_hours: number | null;
}

// -------------------------------------------------------------- dashboard

export interface DashboardSummary {
  week_start: string;
  week_end: string;
  total_members: number;
  submitted: number;
  approved: number;
  needs_correction: number;
  pending: number;
  /** Members with no report row at all for this week. */
  not_started: number;
  late: number;
  compliance_rate: number;
  open_blockers: number;
  key_blockers: number;
  total_tasks: number;
  completed_tasks: number;
  total_hours: string;
  deltas: Record<string, number>;
}

export interface TeamStatusRow {
  user: UserBrief;
  job_title: string | null;
  report_id: number | null;
  status: ReportStatus;
  project_id: number | null;
  project_name: string | null;
  project_color: string | null;
  current_version_no: number;
  submission_count: number;
  first_submitted_at: string | null;
  is_late: boolean;
}

export interface StatusByMemberRow {
  user_id: number;
  full_name: string;
  draft: number;
  submitted: number;
  needs_correction: number;
  approved: number;
  not_started: number;
}

export interface TaskTrendPoint {
  week_start: string;
  label: string;
  total_tasks: number;
  completed_tasks: number;
  hours_spent: string;
}

export interface ProjectWorkloadRow {
  project_id: number;
  name: string;
  color: string;
  task_count: number;
  hours_spent: string;
}

export interface TimeByTypeRow {
  task_type: TaskType;
  hours: string;
}

export interface ActivityItem {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number;
  actor: UserBrief | null;
  summary: string;
  created_at: string;
}

export interface WorkloadBalanceRow {
  user_id: number;
  full_name: string;
  task_count: number;
  hours_spent: string;
  deviation: number;
  flag: 'overloaded' | 'underloaded' | null;
}

export interface WorkloadBalance {
  week_start: string;
  mean_hours: number;
  std_dev: number;
  members: WorkloadBalanceRow[];
}

export interface RecurringBlocker {
  description: string;
  occurrences: number;
  affected_members: number;
  times_key: number;
}

export interface MemberProfile {
  user: UserBrief;
  email: string;
  job_title: string | null;
  role: RoleCode;
  manager: UserBrief | null;
  stats: {
    total_reports: number;
    approved: number;
    needs_correction: number;
    drafts: number;
    approval_rate: number;
    avg_submissions_per_report: number;
  };
  weekly_status: Array<{ week_start: string; status: ReportStatus }>;
}

// ----------------------------------------------------------------- filters

export interface ReportFilters {
  week_start?: string;
  from?: string;
  to?: string;
  user_id?: number;
  project_id?: number;
  status?: string;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}
