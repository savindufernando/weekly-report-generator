import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSnackbar } from '../contexts/SnackbarContext';
import { projectService, userService } from '../services';
import { ApiError } from '../services/api';
import { projectKeys } from './useReports';
import { userKeys } from './useReview';
import type { ProjectInput } from '../types';

/* ------------------------------------------------------------------ projects */

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: (payload: ProjectInput) => projectService.create(payload),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      notify(`Project “${project.name}” created`, 'success');
    },
    onError: (error: ApiError) =>
      notify(
        error.status === 409
          ? 'A project with that name or code already exists'
          : (error.detail ?? 'Could not create the project'),
        'error',
      ),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ProjectInput> & { is_archived?: boolean } }) =>
      projectService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      notify('Project updated', 'success');
    },
    onError: (error: ApiError) => notify(error.detail ?? 'Could not update', 'error'),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: (id: number) => projectService.remove(id),
    onSuccess: (mode) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      // The API tells us whether it archived or deleted; say which, rather
      // than claiming "deleted" for something that is still there.
      notify(
        mode === 'archived'
          ? 'Project archived — existing reports keep their history'
          : 'Project deleted',
        'success',
      );
    },
    onError: (error: ApiError) => notify(error.detail ?? 'Could not remove the project', 'error'),
  });
}

/* --------------------------------------------------------------------- users */

export function useUsers(params: {
  role?: string;
  is_active?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
} = {}) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => userService.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => userService.assignRole(id, role),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      notify(`${user.full_name} is now ${user.role.name}`, 'success');
    },
    onError: (error: ApiError) => notify(error.detail ?? 'Could not change the role', 'error'),
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: (id: number) => userService.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      notify('User deactivated — their reports and history are kept', 'success');
    },
    onError: (error: ApiError) => notify(error.detail ?? 'Could not deactivate', 'error'),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { full_name?: string; job_title?: string | null } }) =>
      userService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      notify('Profile updated', 'success');
    },
    onError: (error: ApiError) => notify(error.detail ?? 'Could not save', 'error'),
  });
}
