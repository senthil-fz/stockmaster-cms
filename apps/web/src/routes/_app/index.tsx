import { createFileRoute } from '@tanstack/react-router';
import { articlesQueryOptions, booksQueryOptions } from '../../lib/queries';
import { LibraryPage } from '../../pages/LibraryPage';

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(booksQueryOptions()),
      context.queryClient.ensureQueryData(articlesQueryOptions()),
    ]),
  component: LibraryPage,
});
