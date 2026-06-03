import type { ReactNode } from 'react';
import { isHttpUrl, type ArticleSummary, type BookSummary } from '@blockpress/shared';
import { Icons } from './icons';
import { BookCover } from './ui/BookCover';

function Library({ children }: { children: ReactNode }) {
  return <div className="lib">{children}</div>;
}

function Hero({ children }: { children: ReactNode }) {
  return (
    <div className="lib-hero">
      <div style={{ flex: 1 }}>
        <h1>Library</h1>
        <p>Everything you&apos;re writing — books, chapters, and articles in one place.</p>
      </div>
      {children}
    </div>
  );
}

export interface LibraryTab {
  key: string;
  label: string;
  count: number;
}

function Tabs({ tabs, active, onSelect }: { tabs: LibraryTab[]; active: string; onSelect: (key: string) => void }) {
  return (
    <div className="lib-tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={'lib-tab' + (active === t.key ? ' active' : '')}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
          <span className="pill">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="lib-grid">{children}</div>;
}

function Empty() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
      <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Nothing here yet</p>
      <p style={{ fontSize: 13 }}>Create a new book or article to get started.</p>
    </div>
  );
}

/** Shared card chrome: delete button, footer status + read action. */
function CardShell({
  title,
  status,
  deleteLabel,
  onDelete,
  onRead,
  cover,
  meta,
  footExtra,
  onOpen,
}: {
  title: string;
  status: 'draft' | 'published';
  deleteLabel: string;
  onDelete?: () => void;
  onRead: () => void;
  cover: ReactNode;
  meta: ReactNode;
  footExtra?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <div className="work-card">
      {onDelete && (
        <button
          className="wc-del"
          aria-label={`Delete ${title}`}
          title={deleteLabel}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Icons.Trash />
        </button>
      )}
      <button className="wc-open" onClick={onOpen}>
        <div className="cover-wrap">
          {cover}
          {meta}
        </div>
      </button>
      <div className="wc-foot">
        <span className={'status ' + status}>
          <span className="led" />
          {status === 'published' ? 'Published' : 'Draft'}
        </span>
        <span className="dot" />
        {footExtra}
        <button
          className="wc-read"
          aria-label={`Read ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            onRead();
          }}
        >
          <Icons.Eye /> Read
        </button>
      </div>
    </div>
  );
}

function BookCard({
  book,
  onOpen,
  onRead,
  onDelete,
}: {
  book: BookSummary;
  onOpen: (book: BookSummary) => void;
  onRead: (book: BookSummary) => void;
  onDelete?: (book: BookSummary) => void;
}) {
  return (
    <CardShell
      title={book.title}
      status={book.status}
      deleteLabel="Delete book"
      onDelete={onDelete ? () => onDelete(book) : undefined}
      onRead={() => onRead(book)}
      onOpen={() => onOpen(book)}
      cover={<BookCover book={book} className="cover" />}
      meta={
        <div className="wc-meta">
          <h3>{book.title}</h3>
          <div className="byline">
            {book.author}
            {book.year ? ` · ${book.year}` : ''}
          </div>
          <span className="kind-tag">
            <Icons.Book />
            book
          </span>
        </div>
      }
      footExtra={
        <>
          <span>{book.pageCount} pages</span>
          {book.buyLink && isHttpUrl(book.buyLink) && (
            <a
              className="wc-buy"
              href={book.buyLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Buy ${book.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Icons.Cart /> Buy
            </a>
          )}
        </>
      }
    />
  );
}

function ArticleCard({
  article,
  onOpen,
  onRead,
  onDelete,
}: {
  article: ArticleSummary;
  onOpen: (article: ArticleSummary) => void;
  onRead: (article: ArticleSummary) => void;
  onDelete?: (article: ArticleSummary) => void;
}) {
  return (
    <CardShell
      title={article.title}
      status={article.status}
      deleteLabel="Delete article"
      onDelete={onDelete ? () => onDelete(article) : undefined}
      onRead={() => onRead(article)}
      onOpen={() => onOpen(article)}
      cover={
        <div className="doc-glyph">
          <Icons.Doc />
        </div>
      }
      meta={
        <div className="wc-meta">
          <h3>{article.title}</h3>
          <div className="byline">
            {article.author}
            {article.year ? ` · ${article.year}` : ''}
          </div>
          <span className="kind-tag">
            <Icons.Doc />
            article
          </span>
        </div>
      }
      footExtra={<span>{article.wordCount.toLocaleString()} words</span>}
    />
  );
}

export const LibraryRoot = Object.assign(Library, { Hero, Tabs, Grid, Empty, BookCard, ArticleCard });
export { LibraryRoot as Library };
