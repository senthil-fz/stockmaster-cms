import { createFileRoute } from '@tanstack/react-router';
import { bookQueryOptions, pageQueryOptions } from '../../lib/queries';
import { EditorPage } from '../../pages/EditorPage';

export const Route = createFileRoute('/_app/books/$bookId/pages/$pageId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(bookQueryOptions(params.bookId)),
      context.queryClient.ensureQueryData(pageQueryOptions(params.pageId)),
    ]);
  },
  component: EditorPage,
});
