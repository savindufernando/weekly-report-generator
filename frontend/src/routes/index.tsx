import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet } from 'react-router-dom';

import { LoadingState } from '../components/common';
import { AppLayout } from '../layouts/AppLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { ForbiddenPage, NotFoundPage } from '../pages/errors/ErrorPages';
import { ProtectedRoute, PublicOnlyRoute } from './guards';
import { RootRedirect } from './RootRedirect';

/*
 * Route-level code splitting: a member never downloads the dashboard bundle,
 * which is where Recharts lives — comfortably the heaviest dependency here.
 */
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage'));
const MyReportsPage = lazy(() => import('../pages/reports/MyReportsPage'));
const NewReportPage = lazy(() => import('../pages/reports/NewReportPage'));
const ReportEditorPage = lazy(() => import('../pages/reports/ReportEditorPage'));
const ReportDetailPage = lazy(() => import('../pages/reports/ReportDetailPage'));
const SettingsPage = lazy(() => import('../pages/settings/SettingsPage'));
const TeamDashboardPage = lazy(() => import('../pages/manager/TeamDashboardPage'));
const MemberProfilePage = lazy(() => import('../pages/manager/MemberProfilePage'));
const ReviewQueuePage = lazy(() => import('../pages/manager/ReviewQueuePage'));
const ReviewReportPage = lazy(() => import('../pages/manager/ReviewReportPage'));
const ProjectsPage = lazy(() => import('../pages/projects/ProjectsPage'));
const UsersPage = lazy(() => import('../pages/admin/UsersPage'));

function Lazy() {
  return (
    <Suspense fallback={<LoadingState variant="page" />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <Lazy />,
    children: [
      // ------------------------------------------------------------ public
      {
        element: <PublicOnlyRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/login', element: <LoginPage /> },
              { path: '/register', element: <RegisterPage /> },
            ],
          },
        ],
      },

      // -------------------------------------------------- any signed-in user
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <RootRedirect /> },
              { path: '/reports', element: <MyReportsPage /> },
              // Static segment first, so /reports/new is not swallowed by
              // /reports/:reportId.
              { path: '/reports/new', element: <NewReportPage /> },
              { path: '/reports/:reportId/edit', element: <ReportEditorPage /> },
              { path: '/reports/:reportId', element: <ReportDetailPage /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '/403', element: <ForbiddenPage /> },
            ],
          },
        ],
      },

      /*
       * Permission-gated sections. Each guard mirrors a server permission, so
       * the sidebar, the route and the API all agree on who may go where —
       * and the API refuses independently regardless of what the UI allows.
       */
      {
        element: <ProtectedRoute permission="dashboard.view" />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/dashboard', element: <TeamDashboardPage /> },
              { path: '/team/:userId', element: <MemberProfilePage /> },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute permission="report.review" />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/review', element: <ReviewQueuePage /> },
              { path: '/review/:reportId', element: <ReviewReportPage /> },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute permission="project.manage" />,
        children: [
          {
            element: <AppLayout />,
            children: [{ path: '/projects', element: <ProjectsPage /> }],
          },
        ],
      },
      {
        element: <ProtectedRoute permission="user.manage_roles" />,
        children: [
          {
            element: <AppLayout />,
            children: [{ path: '/admin/users', element: <UsersPage /> }],
          },
        ],
      },

      // Catch-all last, inside the layout so a stray URL keeps the chrome.
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [{ path: '*', element: <NotFoundPage /> }],
          },
        ],
      },
    ],
  },
]);
