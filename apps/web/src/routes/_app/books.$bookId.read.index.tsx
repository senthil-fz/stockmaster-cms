import { createFileRoute, redirect } from '@tanstack/react-router';
import { bookQueryOptions } from '../../lib/queries';

export const Route = createFileRoute('/_app/books/$bookId/read/')({
  loader: async ({ context, params }) => {
    const book = await context.queryClient.ensureQueryData(bookQueryOptions(params.bookId));
    const first =
      book.chapters.find((c) => c.pages.length > 0)?.pages[0] ?? book.chapters[0]?.pages[0];
    if (!first) return;
    throw redirect({
      to: '/books/$bookId/read/$pageId',
      params: { bookId: params.bookId, pageId: first.id },
    });
  },
});
