import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { EditorContent } from '@tiptap/react';
import type { BookDetail, Page } from '@stockmaster/shared';
import { bookQueryOptions, pageQueryOptions } from '../lib/queries';
import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { Icons } from '../components/icons';
import { ReaderToc } from '../components/ReaderToc';
import { useBlockEditor } from '../editor/useBlockEditor';

const ROUTE_ID = '/_app/books/$bookId/read/$pageId';
const ROUTE_TO = '/books/$bookId/read/$pageId';

export function ReaderPage() {
  const { bookId, pageId } = useParams({ from: ROUTE_ID });
  const navigate = useNavigate();

  const { data: book } = useQuery(bookQueryOptions(bookId));
  const { data: page } = useQuery(pageQueryOptions(pageId));

  const goToPage = (pId: string) =>
    navigate({ to: ROUTE_TO, params: { bookId, pageId: pId } });

  if (!book || !page) return null;

  return (
    <AppShell
      sidebar={() => (
        <Sidebar>
          <Sidebar.Brand />
          <Sidebar.BookHead book={book} onBack={() => navigate({ to: '/' })} />
          <Sidebar.Scroll style={{ paddingTop: 0 }}>
            <ReaderToc chapters={book.chapters} activePageId={page.id} onOpenPage={goToPage} />
          </Sidebar.Scroll>
        </Sidebar>
      )}
    >
      <ReaderWorkspace key={page.id} book={book} page={page} goToPage={goToPage} />
    </AppShell>
  );
}

function ReaderWorkspace({
  book,
  page,
  goToPage,
}: {
  book: BookDetail;
  page: Page;
  goToPage: (pageId: string) => void;
}) {
  const navigate = useNavigate();

  const flat = book.chapters.flatMap((ch) => ch.pages.map((p) => ({ page: p, chapter: ch })));
  const idx = flat.findIndex((e) => e.page.id === page.id);
  const current = idx >= 0 ? flat[idx] : undefined;
  const prev = idx > 0 ? flat[idx - 1] : undefined;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : undefined;
  const position = `${idx + 1} / ${flat.length}`;

  const editor = useBlockEditor({ content: page.content, editable: false });

  return (
    <>
      <Topbar>
        <Topbar.Crumbs>
          <Topbar.Crumb onClick={() => navigate({ to: '/' })}>Library</Topbar.Crumb>
          <Topbar.Sep />
          <Topbar.Crumb
            onClick={() => {
              const first = book.chapters[0]?.pages[0];
              if (first) goToPage(first.id);
            }}
          >
            {book.title}
          </Topbar.Crumb>
          <Topbar.Sep />
          <Topbar.Crumb current>{page.title || 'Untitled'}</Topbar.Crumb>
        </Topbar.Crumbs>
        <Topbar.Spacer />
        <Topbar.Actions>
          <button
            className="btn btn-secondary"
            onClick={() =>
              navigate({
                to: '/books/$bookId/pages/$pageId',
                params: { bookId: book.id, pageId: page.id },
              })
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
                <Icons.Book />
                {current?.chapter.title}
              </span>
              {page.status === 'draft' && <span className="reader-draft">Draft</span>}
            </div>
            <h1 className="reader-title">{page.title || 'Untitled'}</h1>
            <div className="doc-divider" />
            {editor && <EditorContent editor={editor} />}

            <div className="reader-nav">
              <button
                className="btn btn-secondary"
                aria-label={prev ? `Previous: ${prev.page.title || 'Untitled'}` : 'Previous page'}
                disabled={!prev}
                onClick={() => prev && goToPage(prev.page.id)}
              >
                <Icons.ArrowLeft /> Previous
              </button>
              <span className="reader-pos">{position}</span>
              <button
                className="btn btn-secondary"
                aria-label={next ? `Next: ${next.page.title || 'Untitled'}` : 'Next page'}
                disabled={!next}
                onClick={() => next && goToPage(next.page.id)}
              >
                Next <Icons.ArrowLeft style={{ transform: 'scaleX(-1)' }} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
