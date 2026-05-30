import { createFileRoute, redirect } from '@tanstack/react-router';
import { workQueryOptions } from '../../lib/queries';

export const Route = createFileRoute('/_app/works/$workId/read/')({
  loader: async ({ context, params }) => {
    const work = await context.queryClient.ensureQueryData(workQueryOptions(params.workId));
    const first =
      work.chapters.find((c) => c.pages.length > 0)?.pages[0] ?? work.chapters[0]?.pages[0];
    if (!first) return;
    throw redirect({
      to: '/works/$workId/read/$pageId',
      params: { workId: params.workId, pageId: first.id },
    });
  },
});
