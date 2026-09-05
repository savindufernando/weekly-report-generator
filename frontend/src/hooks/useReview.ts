import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSnackbar } from '../contexts/SnackbarContext';
import { dashboardService, reviewService, userService } from '../services';
import { ApiError } from '../services/api';
import { reportKeys } from './useReports';
import type { ReviewInput } from '../types';

export const reviewKeys = {
  all: ['review'] as const,
  queue: (status: string, limit: number, offset: number) =>
    [...reviewKeys.all, 'queue', { status, limit, offset }] as const,
};

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: (week?: string, projectId?: number) =>
    [...dashboardKeys.all, 'summary', { week, projectId }] as const,
  teamStatus: (week?: string, projectId?: number) =>
    [...dashboardKeys.all, 'team-status', { week, projectId }] as const,
  chart: (name: string, params: Record<string, unknown>) =>
    [...dashboardKeys.all, 'chart', name, params] as const,
  activity: (limit: number) => [...dashboardKeys.all, 'activity', limit] as const,
  workload: (week?: string) => [...dashboardKeys.all, 'workload', week] as const,
};

export const userKeys = {
  all: ['users'] as const,
  list: (params: Record<string, unknown>) => [...userKeys.all, 'list', params] as const,
  profile: (id: number) => [...userKeys.all, 'profile', id] as const,
};

export function useReviewQueue(status = 'SUBMITTED', limit = 20, offset = 0) {
  return useQuery({
    queryKey: reviewKeys.queue(status, limit, offset),
    queryFn: () => reviewService.queue(status, limit, offset),
    placeholderData: keepPreviousData,
  });
}

export function useReviewReport(reportId: number) {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: (payload: ReviewInput) => reviewService.review(reportId, payload),
    onSuccess: (result) => {
      // A review changes the report, the queue, and compliance — invalidate
      // all three rather than refetching the whole cache.
      queryClient.invalidateQueries({ queryKey: reportKeys.all });
      queryClient.invalidateQueries({ queryKey: reviewKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });

      notify(
        result.review.action === 'APPROVE'
          ? 'Report approved'
          : 'Sent back for correction',
        'success',
      );
    },
    onError: (error: ApiError) => {
      if (error.status === 409) {
        // Someone else acted first. Refetch so the page stops offering an
        // action that is no longer available.
        queryClient.invalidateQueries({ queryKey: reportKeys.detail(reportId) });
        notify('This report was already reviewed by someone else', 'warning');
        return;
      }
      notify(error.detail ?? 'Could not submit the review', 'error');
    },
  });
}

export function useDashboardSummary(week?: string, projectId?: number) {
  return useQuery({
    queryKey: dashboardKeys.summary(week, projectId),
    queryFn: () => dashboardService.summary(week, projectId),
    placeholderData: keepPreviousData,
  });
}

export function useTeamStatus(week?: string, projectId?: number) {
  return useQuery({
    queryKey: dashboardKeys.teamStatus(week, projectId),
    queryFn: () => dashboardService.teamStatus(week, projectId),
    placeholderData: keepPreviousData,
  });
}

export function useStatusByMember(from?: string, to?: string) {
  return useQuery({
    queryKey: dashboardKeys.chart('status-by-member', { from, to }),
    queryFn: () => dashboardService.statusByMember(from, to),
  });
}

export function useTaskTrend(weeks = 8, ending?: string) {
  return useQuery({
    queryKey: dashboardKeys.chart('task-trend', { weeks, ending }),
    queryFn: () => dashboardService.taskTrend(weeks, ending),
  });
}

export function useWorkloadByProject(from?: string, to?: string) {
  return useQuery({
    queryKey: dashboardKeys.chart('workload-by-project', { from, to }),
    queryFn: () => dashboardService.workloadByProject(from, to),
  });
}

export function useTimeByType(from?: string, to?: string) {
  return useQuery({
    queryKey: dashboardKeys.chart('time-by-type', { from, to }),
    queryFn: () => dashboardService.timeByType(from, to),
  });
}

export function useActivityFeed(limit = 20) {
  return useQuery({
    queryKey: dashboardKeys.activity(limit),
    queryFn: () => dashboardService.activity(limit),
  });
}

export function useWorkloadBalance(week?: string) {
  return useQuery({
    queryKey: dashboardKeys.workload(week),
    queryFn: () => dashboardService.workloadBalance(week),
  });
}

export function useMemberProfile(userId: number | undefined, weeks = 12) {
  return useQuery({
    queryKey: userKeys.profile(userId!),
    queryFn: () => userService.profile(userId!, weeks),
    enabled: Boolean(userId),
  });
}
