import { Navigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { homeFor } from './guards';

/** "/" sends managers to the dashboard and members to their own reports. */
export function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(user.permissions)} replace />;
}
