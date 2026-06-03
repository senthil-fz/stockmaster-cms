import { createFileRoute } from '@tanstack/react-router';
import { bookQueryOptions, pageQueryOptions } from '../../lib/queries';
import { ReaderPage } from '../../pages/ReaderPage';

export const Route = createFileRoute('/_app/books/$bookId/read/$pageId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(bookQueryOptions(params.bookId)),
      context.queryClient.ensureQueryData(pageQueryOptions(params.pageId)),
    ]);
  },
  component: ReaderPage,
});
