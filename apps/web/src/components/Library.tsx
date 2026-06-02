import type { ReactNode } from 'react';
import { isHttpUrl, type WorkSummary } from '@blockpress/shared';
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

function Card({
  work,
  onOpen,
  onRead,
  onDelete,
}: {
  work: WorkSummary;
  onOpen: (work: WorkSummary) => void;
  onRead: (work: WorkSummary) => void;
  onDelete?: (work: WorkSummary) => void;
}) {
  return (
    <div className="work-card">
      {onDelete && (
        <button
          className="wc-del"
          aria-label={`Delete ${work.title}`}
          title={`Delete ${work.kind}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(work);
          }}
        >
          <Icons.Trash />
        </button>
      )}
      <button className="wc-open" onClick={() => onOpen(work)}>
        <div className="cover-wrap">
          {work.kind === 'book' ? (
            <BookCover work={work} className="cover" />
          ) : (
            <div className="doc-glyph">
              <Icons.Doc />
            </div>
          )}
          <div className="wc-meta">
            <h3>{work.title}</h3>
            <div className="byline">
              {work.author}
              {work.year ? ` · ${work.year}` : ''}
            </div>
            <span className="kind-tag">
              {work.kind === 'book' ? <Icons.Book /> : <Icons.Doc />}
              {work.kind}
            </span>
          </div>
        </div>
      </button>
      <div className="wc-foot">
        <span className={'status ' + work.status}>
          <span className="led" />
          {work.status === 'published' ? 'Published' : 'Draft'}
        </span>
        <span className="dot" />
        {work.kind === 'book' ? (
          <span>{work.pageCount} pages</span>
        ) : (
          <span>{work.wordCount.toLocaleString()} words</span>
        )}
        {work.kind === 'book' && work.buyLink && isHttpUrl(work.buyLink) && (
          <a
            className="wc-buy"
            href={work.buyLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Buy ${work.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Icons.Cart /> Buy
          </a>
        )}
        <button
          className="wc-read"
          aria-label={`Read ${work.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onRead(work);
          }}
        >
          <Icons.Eye /> Read
        </button>
      </div>
    </div>
  );
}

export const LibraryRoot = Object.assign(Library, { Hero, Tabs, Grid, Empty, Card });
export { LibraryRoot as Library };
