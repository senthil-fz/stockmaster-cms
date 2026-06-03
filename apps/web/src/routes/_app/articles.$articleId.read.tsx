import { createFileRoute } from '@tanstack/react-router';
import { articleQueryOptions } from '../../lib/queries';
import { ArticleReaderPage } from '../../pages/ArticleReaderPage';

export const Route = createFileRoute('/_app/articles/$articleId/read')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(articleQueryOptions(params.articleId)),
  component: ArticleReaderPage,
});
