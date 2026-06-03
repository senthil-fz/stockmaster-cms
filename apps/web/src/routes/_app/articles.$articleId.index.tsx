import { createFileRoute } from '@tanstack/react-router';
import { articleQueryOptions } from '../../lib/queries';
import { ArticleEditorPage } from '../../pages/ArticleEditorPage';

export const Route = createFileRoute('/_app/articles/$articleId/')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(articleQueryOptions(params.articleId)),
  component: ArticleEditorPage,
});
