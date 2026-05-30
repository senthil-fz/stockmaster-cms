import { createRouter, type ErrorComponentProps } from '@tanstack/react-router';
import type { AuthState } from './lib/auth';
import { queryClient } from './lib/queryClient';
import { routeTree } from './routeTree.gen';

export interface RouterContext {
  queryClient: typeof queryClient;
  auth: AuthState;
}

function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="route-fallback">
      <h1>Something went wrong</h1>
      <p>{error instanceof Error ? error.message : 'An unexpected error occurred.'}</p>
      <button
        className="btn btn-primary"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        Try again
      </button>
    </div>
  );
}

function RouteNotFound() {
  return (
    <div className="route-fallback">
      <h1>Not found</h1>
      <p>That page doesn&apos;t exist.</p>
      <button className="btn btn-primary" onClick={() => void router.navigate({ to: '/' })}>
        Back to library
      </button>
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
