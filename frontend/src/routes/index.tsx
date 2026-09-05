import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';

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
const ReviewQueuePage = lazy(() => import('../pages/manager/ReviewQueuePage'));
const ReviewReportPage = lazy(() => import('../pages/manager/ReviewReportPage'));
const TeamDashboardPage = lazy(() => import('../pages/manager/TeamDashboardPage'));

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
      // ---------------------------------------------------------- public
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

      // ------------------------------------------------------ signed in
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <RootRedirect /> },
              { path: '/reports', element: <MyReportsPage /> },
              // Static segment before the dynamic one, so /reports/new is not
              // swallowed by /reports/:reportId.
              { path: '/reports/new', element: <NewReportPage /> },
              { path: '/reports/:reportId/edit', element: <ReportEditorPage /> },
              { path: '/reports/:reportId', element: <ReportDetailPage /> },
              { path: '/403', element: <ForbiddenPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },

      // ------------------------------------------- manager-gated section
      // A second ProtectedRoute with a permission: a member reaching these
      // URLs directly is redirected, and the API refuses them independently.
      // Dashboard sits behind its own permission, separate from review.
      {
        element: <ProtectedRoute permission="dashboard.view" />,
        children: [
          {
            element: <AppLayout />,
            children: [{ path: '/dashboard', element: <TeamDashboardPage /> }],
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

      { path: '/404', element: <NotFoundPage /> },
      { path: '*', element: <Navigate to="/404" replace /> },
    ],
  },
]);
