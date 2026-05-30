import { createFileRoute } from '@tanstack/react-router';
import { pageQueryOptions, workQueryOptions } from '../../lib/queries';
import { ReaderPage } from '../../pages/ReaderPage';

export const Route = createFileRoute('/_app/works/$workId/read/$pageId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(workQueryOptions(params.workId)),
      context.queryClient.ensureQueryData(pageQueryOptions(params.pageId)),
    ]);
  },
  component: ReaderPage,
});
