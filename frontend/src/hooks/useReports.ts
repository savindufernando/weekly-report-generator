import {
  keepPreviousData, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query';

import { useSnackbar } from '../contexts/SnackbarContext';
import { projectService, reportService } from '../services';
import { ApiError } from '../services/api';
import type { ReportContentInput, ReportFilters } from '../types';

/**
 * Structured, hierarchical query keys.
 *
 * Invalidating ['reports'] refreshes every reports view and nothing else —
 * which is what makes cache invalidation precise rather than a blunt refetch.
 */
export const reportKeys = {
  all: ['reports'] as const,
  lists: () => [...reportKeys.all, 'list'] as const,
  list: (filters: ReportFilters) => [...reportKeys.lists(), filters] as const,
  detail: (id: number) => [...reportKeys.all, 'detail', id] as const,
  versions: (id: number) => [...reportKeys.all, id, 'versions'] as const,
  comments: (id: number) => [...reportKeys.all, id, 'comments'] as const,
};

export const projectKeys = {
  all: ['projects'] as const,
  list: (includeArchived: boolean) => [...projectKeys.all, { includeArchived }] as const,
};

export function useReports(filters: ReportFilters) {
  return useQuery({
    queryKey: reportKeys.list(filters),
    queryFn: () => reportService.list(filters),
    // Keeps the previous page on screen while the next loads, instead of
    // flashing an empty table on every page change.
    placeholderData: keepPreviousData,
  });
}

export function useReport(id: number | undefined) {
  return useQuery({
    queryKey: reportKeys.detail(id!),
    queryFn: () => reportService.get(id!),
    enabled: Boolean(id),
  });
}

export function useVersions(id: number | undefined) {
  return useQuery({
    queryKey: reportKeys.versions(id!),
    queryFn: () => reportService.versions(id!),
    enabled: Boolean(id),
  });
}

export function useComments(id: number | undefined) {
  return useQuery({
    queryKey: reportKeys.comments(id!),
    queryFn: () => reportService.comments(id!),
    enabled: Boolean(id),
  });
}

export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: projectKeys.list(includeArchived),
    queryFn: () => projectService.list(includeArchived),
    // Projects change rarely; no need to refetch them constantly.
    staleTime: 5 * 60_000,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: ({ weekStart, projectId }: { weekStart: string; projectId: number }) =>
      reportService.create(weekStart, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.all });
    },
    onError: (error: ApiError) => {
      notify(
        error.status === 409
          ? 'You already have a report for that week'
          : error.detail ?? 'Could not create the report',
        'error',
      );
    },
  });
}

export function useUpdateReport(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ReportContentInput) => reportService.update(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(reportKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: reportKeys.lists() });
    },
  });
}

export function useSubmitReport(id: number) {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: () => reportService.submit(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.all });
      // Compliance and the review queue both changed.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });

      if (result.warnings.includes('no_changes_detected')) {
        notify('Submitted, though nothing changed since the last version', 'warning');
      } else {
        notify(`Submitted for review (version ${result.current_version_no})`, 'success');
      }
    },
    onError: (error: ApiError) => {
      // A 409 means the report moved underneath us — refetch so the UI stops
      // showing a stale action.
      if (error.status === 409) queryClient.invalidateQueries({ queryKey: reportKeys.detail(id) });
      notify(error.detail ?? 'Could not submit the report', 'error');
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: (id: number) => reportService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.all });
      notify('Draft deleted', 'success');
    },
    onError: (error: ApiError) => notify(error.detail ?? 'Could not delete', 'error'),
  });
}
