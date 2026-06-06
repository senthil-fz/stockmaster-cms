import { createFileRoute, Navigate, Outlet, redirect } from '@tanstack/react-router';
import { useAuth } from '../lib/auth';

/**
 * Auth gate for the whole editor app.
 *
 * `beforeLoad` guards direct navigation (deep links, refreshes) before the route loads.
 * The component-level guard handles auth changing *underneath* a mounted page — e.g. the
 * user logs out. Because this layout is an ancestor of every app page, returning <Navigate>
 * here unmounts the protected subtree in the same render, so child pages never re-render with
 * a null user (which would crash on `auth.user!`). React context (useAuth) updates
 * synchronously, unlike the router's beforeLoad which only re-runs on navigation.
 */
function AppGuard() {
  const { isAuthed, status } = useAuth();
  if (status === 'ready' && !isAuthed) return <Navigate to="/login" />;
  return <Outlet />;
}

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthed) throw redirect({ to: '/login' });
  },
  component: AppGuard,
});
