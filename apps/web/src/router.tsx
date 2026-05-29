import { createRouter } from '@tanstack/react-router';
import type { AuthState } from './lib/auth';
import { queryClient } from './lib/queryClient';
import { routeTree } from './routeTree.gen';

export interface RouterContext {
  queryClient: typeof queryClient;
  auth: AuthState;
}

export const router = createRouter({
  routeTree,
  context: { queryClient, auth: undefined! },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
