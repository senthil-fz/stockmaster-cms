import type { ReactNode } from 'react';
import { isHttpUrl, type ArticleSummary, type BookSummary } from '@stockmaster/shared';
import { Icons } from './icons';
import { BookCover } from './ui/BookCover';
import { Badge } from './ui/Badge';
import { cx } from './ui/cx';

function Library({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1080px] px-10 pt-9 pb-20">{children}</div>;
}

function Hero({ children }: { children: ReactNode }) {
  return (
    <div className="mb-7 flex items-end gap-4">
      <div style={{ flex: 1 }}>
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">Library</h1>
        <p className="mt-1.5 mb-0 text-sm text-muted">
          Everything you&apos;re writing — books, chapters, and articles in one place.
        </p>
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
    <div className="mt-0 mb-5 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={cx(
            'mb-[-1px] border-b-2 border-transparent bg-transparent px-3 py-[9px] text-[13px] font-semibold',
            active === t.key ? 'border-b-primary text-fg' : 'text-muted hover:text-fg',
          )}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
          <span className="ml-[7px] rounded-full bg-subtle px-[7px] py-px text-[11px] text-faint">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-[18px]">{children}</div>
  );
}

function Empty() {
  return (
    <div className="py-20 text-center text-faint">
      <p className="font-semibold text-muted">Nothing here yet</p>
      <p className="text-[13px]">Create a new book or article to get started.</p>
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
    <div className="group relative flex cursor-pointer flex-col gap-[14px] rounded-lg border border-line bg-canvas p-4 text-left shadow-xs transition-[box-shadow,transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md">
      {onDelete && (
        <button
          type="button"
          className="absolute right-2.5 top-2.5 z-[1] grid h-7 w-7 cursor-pointer place-items-center rounded-sm border border-line bg-canvas text-faint opacity-0 shadow-xs transition-[opacity,background,color,border-color] duration-100 hover:border-[color-mix(in_oklch,#c0392b_30%,var(--border))] hover:bg-[color-mix(in_oklch,#c0392b_10%,transparent)] hover:text-[#c0392b] focus-visible:opacity-100 group-hover:opacity-100 [&_svg]:h-[15px] [&_svg]:w-[15px]"
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
      <button
        type="button"
        className="block w-full cursor-pointer border-none bg-transparent p-0 text-left"
        onClick={onOpen}
      >
        <div className="flex gap-[14px]">
          {cover}
          {meta}
        </div>
      </button>
      <div className="flex items-center gap-2.5 whitespace-nowrap border-t border-line pt-3 text-xs text-faint [&>span]:flex-shrink-0">
        <Badge tone={status}>{status === 'published' ? 'Published' : 'Draft'}</Badge>
        <span className="h-1 w-1 rounded-full bg-current" />
        {footExtra}
        <button
          type="button"
          className="ml-auto inline-flex cursor-pointer items-center gap-[5px] rounded-sm border border-line bg-transparent px-2.5 py-1 text-xs font-semibold text-muted transition-[background,color,border-color] duration-[120ms] hover:border-line-strong hover:bg-hover hover:text-fg [&_svg]:h-[14px] [&_svg]:w-[14px]"
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
      cover={
        <BookCover
          book={book}
          className="h-[88px] w-16 flex-none rounded-sm bg-subtle object-cover shadow-sm"
        />
      }
      meta={
        <div className="flex min-w-0 flex-col">
          <h3 className="m-0 mb-[3px] text-[15px] font-semibold tracking-[-0.01em]">{book.title}</h3>
          <div className="text-[13px] text-muted">
            {book.author}
            {book.year ? ` · ${book.year}` : ''}
          </div>
          <span className="mt-auto inline-flex items-center gap-[5px] self-start rounded-full border border-line bg-subtle px-[9px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted [&_svg]:h-[14px] [&_svg]:w-[14px]">
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
              className="ml-auto inline-flex items-center gap-[5px] rounded-sm border border-line-strong bg-canvas px-2.5 py-1 text-xs font-semibold text-fg no-underline shadow-xs transition-[background,color,border-color] duration-[120ms] hover:bg-hover [&_svg]:h-[14px] [&_svg]:w-[14px] [&+button]:ml-2"
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
        <div className="grid h-[88px] w-16 flex-none place-items-center rounded-sm border border-line bg-subtle text-faint [&_svg]:h-6 [&_svg]:w-6">
          <Icons.Doc />
        </div>
      }
      meta={
        <div className="flex min-w-0 flex-col">
          <h3 className="m-0 mb-[3px] text-[15px] font-semibold tracking-[-0.01em]">{article.title}</h3>
          <div className="text-[13px] text-muted">
            {article.author}
            {article.year ? ` · ${article.year}` : ''}
          </div>
          <span className="mt-auto inline-flex items-center gap-[5px] self-start rounded-full border border-line bg-subtle px-[9px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted [&_svg]:h-[14px] [&_svg]:w-[14px]">
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
