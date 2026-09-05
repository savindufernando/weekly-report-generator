import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { LoadingState } from '../components/common';
import { useAuth } from '../contexts/AuthContext';
import type { PermissionCode } from '../types';

/**
 * Route guards.
 *
 * These enforce nothing — they reflect server rules so the UI does not offer
 * doors that will slam. Every route they protect is independently gated by the
 * API, and the RBAC tests prove it.
 */

export function ProtectedRoute({ permission }: { permission?: PermissionCode }) {
  const { user, isLoading, can } = useAuth();
  const location = useLocation();

  // Waiting on the initial session restore. Redirecting here would bounce a
  // signed-in user to /login on every hard refresh.
  if (isLoading) return <LoadingState variant="page" />;

  if (!user) {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permission && !can(permission)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingState variant="page" />;
  // Already signed in — no reason to show the login form again.
  if (user) return <Navigate to={homeFor(user.permissions)} replace />;
  return <Outlet />;
}

/** Managers land on the dashboard; members on their own reports. */
export function homeFor(permissions: PermissionCode[]): string {
  return permissions.includes('dashboard.view') ? '/dashboard' : '/reports';
}
