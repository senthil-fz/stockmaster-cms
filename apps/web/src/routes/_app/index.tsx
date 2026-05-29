import { createFileRoute } from '@tanstack/react-router';
import { worksQueryOptions } from '../../lib/queries';
import { LibraryPage } from '../../pages/LibraryPage';

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(worksQueryOptions()),
  component: LibraryPage,
});
