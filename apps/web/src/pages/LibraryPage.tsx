import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ArticleSummary, BookSummary } from '@stockmaster/shared';
import { articlesApi, booksApi } from '../lib/api';
import { articlesQueryOptions, booksQueryOptions, bookQueryOptions } from '../lib/queries';
import { useAuth } from '../lib/auth';
import { AppShell } from '../components/AppShell';
import { WorkspaceSidebar } from '../components/WorkspaceSidebar';
import { Topbar } from '../components/Topbar';
import { Library, type LibraryTab } from '../components/Library';
import { Authors } from '../components/Authors';
import { ReportingDashboard } from '../components/ReportingDashboard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icons } from '../components/icons';

/** Library sidebar tabs that can be deep-linked via the URL hash (e.g. /#drafts). */
const HASH_TABS = ['all', 'drafts', 'published', 'reporting', 'authors'];

type PendingDelete =
  | { kind: 'book'; item: BookSummary }
  | { kind: 'article'; item: ArticleSummary }
  | null;

export function LibraryPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Initialise from the URL hash so the API-keys sidebar can land on a specific
  // tab (e.g. clicking "Drafts" from settings). In-page tab switches stay local.
  const [tab, setTab] = useState<string>(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    return HASH_TABS.includes(h) ? h : 'all';
  });

  const { data: books = [] } = useQuery(booksQueryOptions());
  const { data: articles = [] } = useQuery(articlesQueryOptions());

  const openBook = async (book: BookSummary) => {
    const detail = await queryClient.ensureQueryData(bookQueryOptions(book.id));
    const firstPage = detail.chapters[0]?.pages[0];
    if (firstPage) {
      void navigate({
        to: '/books/$bookId/pages/$pageId',
        params: { bookId: book.id, pageId: firstPage.id },
      });
    }
  };

  const readBook = (book: BookSummary) =>
    navigate({ to: '/books/$bookId/read', params: { bookId: book.id } });

  const openArticle = (article: ArticleSummary) =>
    navigate({ to: '/articles/$articleId', params: { articleId: article.id } });

  const readArticle = (article: ArticleSummary) =>
    navigate({ to: '/articles/$articleId/read', params: { articleId: article.id } });

  const createBook = useMutation({
    mutationFn: () => booksApi.create({}),
    onSuccess: async (book) => {
      await queryClient.invalidateQueries({ queryKey: ['books'] });
      await openBook(book);
    },
  });

  const createArticle = useMutation({
    mutationFn: () => articlesApi.create({}),
    onSuccess: async (article) => {
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      void openArticle(article);
    },
  });

  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const deleteBook = useMutation({
    mutationFn: (id: string) => booksApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['books'] });
      setPendingDelete(null);
    },
  });
  const deleteArticle = useMutation({
    mutationFn: (id: string) => articlesApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      setPendingDelete(null);
    },
  });

  const draftCount =
    books.filter((b) => b.status === 'draft').length +
    articles.filter((a) => a.status === 'draft').length;

  const visibleBooks = books.filter((b) => {
    if (tab === 'articles') return false;
    if (tab === 'drafts') return b.status === 'draft';
    if (tab === 'published') return b.status === 'published';
    return true;
  });
  const visibleArticles = articles.filter((a) => {
    if (tab === 'books') return false;
    if (tab === 'drafts') return a.status === 'draft';
    if (tab === 'published') return a.status === 'published';
    return true;
  });

  const tabs: LibraryTab[] = [
    { key: 'all', label: 'All', count: books.length + articles.length },
    { key: 'books', label: 'Books', count: books.length },
    { key: 'articles', label: 'Articles', count: articles.length },
    { key: 'drafts', label: 'Drafts', count: draftCount },
  ];

  const isEmpty = visibleBooks.length === 0 && visibleArticles.length === 0;

  return (
    <>
      <AppShell
        sidebar={() => (
          <WorkspaceSidebar
            user={auth.user!}
            count={books.length + articles.length}
            active={tab}
            onTab={setTab}
            onOpenApiKeys={() => void navigate({ to: '/api-keys' })}
          />
        )}
      >
        <Topbar>
          <Topbar.Crumbs>
            <Topbar.Crumb current>
              {tab === 'authors' ? 'Authors' : tab === 'reporting' ? 'Reporting' : 'Library'}
            </Topbar.Crumb>
          </Topbar.Crumbs>
        </Topbar>

        <div className="canvas-scroll">
          {tab === 'reporting' ? (
            <ReportingDashboard />
          ) : tab === 'authors' ? (
            <Authors currentUserId={auth.user!.id} />
          ) : (
            <Library>
              <Library.Hero>
                <button className="btn btn-secondary" onClick={() => createArticle.mutate()}>
                  <Icons.Doc /> New article
                </button>
                <button className="btn btn-primary" onClick={() => createBook.mutate()}>
                  <Icons.Plus /> New book
                </button>
              </Library.Hero>
              <Library.Tabs tabs={tabs} active={tab} onSelect={setTab} />
              {isEmpty ? (
                <Library.Empty />
              ) : (
                <Library.Grid>
                  {visibleBooks.map((b) => (
                    <Library.BookCard
                      key={b.id}
                      book={b}
                      onOpen={openBook}
                      onRead={readBook}
                      onDelete={(item) => setPendingDelete({ kind: 'book', item })}
                    />
                  ))}
                  {visibleArticles.map((a) => (
                    <Library.ArticleCard
                      key={a.id}
                      article={a}
                      onOpen={openArticle}
                      onRead={readArticle}
                      onDelete={(item) => setPendingDelete({ kind: 'article', item })}
                    />
                  ))}
                </Library.Grid>
              )}
            </Library>
          )}
        </div>
      </AppShell>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === 'book' ? 'Delete book?' : 'Delete article?'}
        message={
          pendingDelete
            ? `This permanently removes "${pendingDelete.item.title}"${
                pendingDelete.kind === 'book' ? ' and all its chapters and pages' : ''
              }. This cannot be undone.`
            : ''
        }
        confirmLabel={pendingDelete?.kind === 'book' ? 'Delete book' : 'Delete article'}
        busy={deleteBook.isPending || deleteArticle.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.kind === 'book') deleteBook.mutate(pendingDelete.item.id);
          else deleteArticle.mutate(pendingDelete.item.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
