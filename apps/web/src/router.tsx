import { createRouter, type ErrorComponentProps } from '@tanstack/react-router';
import type { AuthState } from './lib/auth';
import { queryClient } from './lib/queryClient';
import { routeTree } from './routeTree.gen';
import { Button } from './components/ui/Button';

const fallbackCls =
  'flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 py-12 text-center';
const fallbackTitleCls = 'm-0 text-[22px] font-bold tracking-[-0.02em]';
const fallbackBodyCls = 'm-0 mb-2 text-muted';

export interface RouterContext {
  queryClient: typeof queryClient;
  auth: AuthState;
}

function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className={fallbackCls}>
      <h1 className={fallbackTitleCls}>Something went wrong</h1>
      <p className={fallbackBodyCls}>
        {error instanceof Error ? error.message : 'An unexpected error occurred.'}
      </p>
      <Button
        variant="primary"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        Try again
      </Button>
    </div>
  );
}

function RouteNotFound() {
  return (
    <div className={fallbackCls}>
      <h1 className={fallbackTitleCls}>Not found</h1>
      <p className={fallbackBodyCls}>That page doesn&apos;t exist.</p>
      <Button variant="primary" onClick={() => void router.navigate({ to: '/' })}>
        Back to library
      </Button>
    </div>
  );
}

export const router = createRouter({
  routeTree,
  context: { queryClient, auth: undefined! },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
