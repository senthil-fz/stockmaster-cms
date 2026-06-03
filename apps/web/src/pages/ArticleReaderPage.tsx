import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { EditorContent } from '@tiptap/react';
import type { ArticleDetail } from '@stockmaster/shared';
import { articleQueryOptions } from '../lib/queries';
import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { Icons } from '../components/icons';
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
          <div className="book-head">
            <button className="book-back" onClick={() => navigate({ to: '/' })} title="Back to library">
              <Icons.ArrowLeft />
            </button>
            <div
              className="book-cover-sm"
              style={{ display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)' }}
            >
              <Icons.Doc />
            </div>
            <div className="t">
              <div
                className="name"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {article.title || 'Untitled'}
              </div>
              <div className="sub">
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
          <button
            className="btn btn-secondary"
            onClick={() =>
              navigate({ to: '/articles/$articleId', params: { articleId: article.id } })
            }
          >
            <Icons.Pencil /> Edit
          </button>
        </Topbar.Actions>
      </Topbar>

      <div className="canvas-scroll">
        <div className="editor-wrap">
          <div className="editor reader-doc">
            <div className="doc-meta-row">
              <span className="kind-tag">
                <Icons.Doc />
                Article
              </span>
              {article.status === 'draft' && <span className="reader-draft">Draft</span>}
            </div>
            <h1 className="reader-title">{article.title || 'Untitled'}</h1>
            {article.subtitle && <p className="reader-sub">{article.subtitle}</p>}
            <div className="doc-divider" />
            {editor && <EditorContent editor={editor} />}
          </div>
        </div>
      </div>
    </>
  );
}
