/**
 * Typed API functions.
 *
 * This is the only layer that knows URLs. Hooks call these; components call
 * hooks. That is what makes "add a filter to the reports list" a two-file
 * change rather than a hunt through the codebase.
 */
import { api } from './api';
import type {
  ActivityItem,
  CurrentUser,
  DashboardSummary,
  LoginResponse,
  MemberProfile,
  Page,
  Project,
  ProjectInput,
  ProjectWorkloadRow,
  QueueItem,
  RecurringBlocker,
  ReportContentInput,
  ReportDetail,
  ReportFilters,
  ReportListItem,
  ReviewInput,
  ReviewOut,
  StatusByMemberRow,
  SubmitResponse,
  TaskTrendPoint,
  TeamStatusRow,
  TimeByTypeRow,
  User,
  VersionDetail,
  VersionSummary,
  WorkloadBalance,
} from '../types';

export const authService = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  register: (email: string, password: string, full_name: string) =>
    api.post<User>('/auth/register', { email, password, full_name }).then((r) => r.data),

  logout: () => api.post<void>('/auth/logout').then(() => undefined),

  me: () => api.get<CurrentUser>('/auth/me').then((r) => r.data),

  changePassword: (current_password: string, new_password: string) =>
    api
      .post<void>('/auth/change-password', { current_password, new_password })
      .then(() => undefined),
};

export const projectService = {
  list: (includeArchived = false) =>
    api
      .get<Project[]>('/projects', { params: { include_archived: includeArchived } })
      .then((r) => r.data),

  create: (payload: ProjectInput) =>
    api.post<Project>('/projects', payload).then((r) => r.data),

  update: (id: number, payload: Partial<ProjectInput> & { is_archived?: boolean }) =>
    api.patch<Project>(`/projects/${id}`, payload).then((r) => r.data),

  /** Archives when the project is referenced by reports; the header says which. */
  remove: (id: number) =>
    api
      .delete<void>(`/projects/${id}`)
      .then((r) => (r.headers['x-delete-mode'] as 'archived' | 'deleted') ?? 'deleted'),
};

export const reportService = {
  list: (filters: ReportFilters = {}) =>
    api.get<Page<ReportListItem>>('/reports', { params: filters }).then((r) => r.data),

  get: (id: number) => api.get<ReportDetail>(`/reports/${id}`).then((r) => r.data),

  create: (week_start: string, project_id: number) =>
    api.post<ReportDetail>('/reports', { week_start, project_id }).then((r) => r.data),

  update: (id: number, payload: ReportContentInput) =>
    api.put<ReportDetail>(`/reports/${id}`, payload).then((r) => r.data),

  submit: (id: number) =>
    api.post<SubmitResponse>(`/reports/${id}/submit`).then((r) => r.data),

  remove: (id: number) => api.delete<void>(`/reports/${id}`).then(() => undefined),

  versions: (id: number) =>
    api.get<VersionSummary[]>(`/reports/${id}/versions`).then((r) => r.data),

  version: (id: number, versionNo: number) =>
    api.get<VersionDetail>(`/reports/${id}/versions/${versionNo}`).then((r) => r.data),

  comments: (id: number) =>
    api.get<ReviewOut[]>(`/reports/${id}/comments`).then((r) => r.data),
};

export const reviewService = {
  review: (id: number, payload: ReviewInput) =>
    api.post<{ report_id: number; status: string; review: ReviewOut }>(
      `/reports/${id}/review`,
      payload,
    ).then((r) => r.data),

  queue: (status = 'SUBMITTED', limit = 20, offset = 0) =>
    api
      .get<Page<QueueItem>>('/review-queue', { params: { status, limit, offset } })
      .then((r) => r.data),
};

export const dashboardService = {
  summary: (weekStart?: string, projectId?: number) =>
    api
      .get<DashboardSummary>('/dashboard/summary', {
        params: { week_start: weekStart, project_id: projectId },
      })
      .then((r) => r.data),

  teamStatus: (weekStart?: string, projectId?: number) =>
    api
      .get<TeamStatusRow[]>('/dashboard/team-status', {
        params: { week_start: weekStart, project_id: projectId },
      })
      .then((r) => r.data),

  statusByMember: (from?: string, to?: string) =>
    api
      .get<StatusByMemberRow[]>('/dashboard/charts/status-by-member', { params: { from, to } })
      .then((r) => r.data),

  taskTrend: (weeks = 8, ending?: string) =>
    api
      .get<TaskTrendPoint[]>('/dashboard/charts/task-trend', { params: { weeks, ending } })
      .then((r) => r.data),

  workloadByProject: (from?: string, to?: string) =>
    api
      .get<ProjectWorkloadRow[]>('/dashboard/charts/workload-by-project', {
        params: { from, to },
      })
      .then((r) => r.data),

  timeByType: (from?: string, to?: string) =>
    api
      .get<TimeByTypeRow[]>('/dashboard/charts/time-by-type', { params: { from, to } })
      .then((r) => r.data),

  activity: (limit = 20, offset = 0) =>
    api
      .get<Page<ActivityItem>>('/dashboard/activity', { params: { limit, offset } })
      .then((r) => r.data),

  workloadBalance: (weekStart?: string) =>
    api
      .get<WorkloadBalance>('/dashboard/analytics/workload-balance', {
        params: { week_start: weekStart },
      })
      .then((r) => r.data),

  recurringBlockers: (weeks = 8) =>
    api
      .get<RecurringBlocker[]>('/dashboard/analytics/recurring-blockers', { params: { weeks } })
      .then((r) => r.data),
};

export const userService = {
  list: (params: { role?: string; is_active?: boolean; q?: string; limit?: number; offset?: number } = {}) =>
    api.get<Page<User>>('/users', { params }).then((r) => r.data),

  profile: (id: number, weeks = 12) =>
    api.get<MemberProfile>(`/users/${id}/profile`, { params: { weeks } }).then((r) => r.data),

  update: (id: number, payload: { full_name?: string; job_title?: string | null }) =>
    api.patch<User>(`/users/${id}`, payload).then((r) => r.data),

  assignRole: (id: number, role_code: string) =>
    api.patch<User>(`/users/${id}/role`, { role_code }).then((r) => r.data),

  deactivate: (id: number) => api.delete<void>(`/users/${id}`).then(() => undefined),
};
