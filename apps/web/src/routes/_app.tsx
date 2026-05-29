import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthed) throw redirect({ to: '/login' });
  },
  component: () => <Outlet />,
});
