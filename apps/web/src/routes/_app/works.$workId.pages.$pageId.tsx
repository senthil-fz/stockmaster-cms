import { createFileRoute } from '@tanstack/react-router';
import { pageQueryOptions, workQueryOptions } from '../../lib/queries';
import { EditorPage } from '../../pages/EditorPage';

export const Route = createFileRoute('/_app/works/$workId/pages/$pageId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(workQueryOptions(params.workId)),
      context.queryClient.ensureQueryData(pageQueryOptions(params.pageId)),
    ]);
  },
  component: EditorPage,
});
