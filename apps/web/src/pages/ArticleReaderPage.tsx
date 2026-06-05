import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { EditorContent } from '@tiptap/react';
import type { ArticleDetail } from '@stockmaster/shared';
import { articleQueryOptions } from '../lib/queries';
import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { Icons } from '../components/icons';
import { Button } from '../components/ui/Button';
import { useBlockEditor } from '../editor/useBlockEditor';

const ROUTE_ID = '/_app/articles/$articleId/read';

export function ArticleReaderPage() {
  const { articleId } = useParams({ from: ROUTE_ID });
  const navigate = useNavigate();

  const { data: article } = useQuery(articleQueryOptions(articleId));

  if (!article) return null;

  return (
    <AppShell
      sidebar={() => (
        <Sidebar>
          <Sidebar.Brand />
          <div className="flex gap-2.5 items-center px-3.5 py-3 mb-1">
            <button
              type="button"
              className="border border-line bg-canvas w-[30px] h-[30px] rounded-md flex-none grid place-items-center text-muted shadow-xs hover:bg-hover hover:text-fg [&_svg]:w-[18px] [&_svg]:h-[18px]"
              onClick={() => navigate({ to: '/' })}
              title="Back to library"
            >
              <Icons.ArrowLeft />
            </button>
            <div
              className="w-[34px] h-[46px] rounded-[4px] flex-none object-cover shadow-sm bg-subtle text-faint"
              style={{ display: 'grid', placeItems: 'center' }}
            >
              <Icons.Doc />
            </div>
            <div className="min-w-0">
              <div
                className="font-semibold text-sm tracking-[-0.01em] leading-[1.2]"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {article.title || 'Untitled'}
              </div>
              <div className="text-faint text-xs">
                {article.author}
                {article.year ? ` · ${article.year}` : ''}
              </div>
            </div>
          </div>
        </Sidebar>
      )}
    >
      <ArticleReaderWorkspace key={article.id} article={article} />
    </AppShell>
  );
}

function ArticleReaderWorkspace({ article }: { article: ArticleDetail }) {
  const navigate = useNavigate();
  const editor = useBlockEditor({ content: article.content, editable: false });

  return (
    <>
      <Topbar>
        <Topbar.Crumbs>
          <Topbar.Crumb onClick={() => navigate({ to: '/' })}>Library</Topbar.Crumb>
          <Topbar.Sep />
          <Topbar.Crumb current>{article.title || 'Untitled'}</Topbar.Crumb>
        </Topbar.Crumbs>
        <Topbar.Spacer />
        <Topbar.Actions>
          <Button
            onClick={() =>
              navigate({ to: '/articles/$articleId', params: { articleId: article.id } })
            }
          >
            <Icons.Pencil /> Edit
          </Button>
        </Topbar.Actions>
      </Topbar>

      <div className="canvas-scroll">
        <div className="pt-[30px] px-6 pb-[200px]">
          <div className="max-w-[var(--content-width)] mx-auto">
            <div className="flex items-center gap-2.5 mb-3 text-faint text-[13px]">
              <span className="mt-auto self-start inline-flex items-center gap-[5px] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted bg-subtle border border-line rounded-full px-[9px] py-[3px] [&_svg]:w-3.5 [&_svg]:h-3.5">
                <Icons.Doc />
                Article
              </span>
              {article.status === 'draft' && (
                <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold uppercase tracking-[0.04em] text-amber border border-line rounded-full px-2 py-0.5">
                  Draft
                </span>
              )}
            </div>
            <h1 className="font-[family-name:var(--font-content)] text-[34px] font-bold tracking-[-0.02em] leading-[1.12] text-fg m-0">
              {article.title || 'Untitled'}
            </h1>
            {article.subtitle && <p>{article.subtitle}</p>}
            <div className="h-px bg-line mt-[18px] mb-2" />
            {editor && <EditorContent editor={editor} />}
          </div>
        </div>
      </div>
    </>
  );
}
