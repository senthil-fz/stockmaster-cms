import { useState, type ReactNode } from 'react';
import type { BookDetail, Chapter, User } from '@blockpress/shared';
import { Icon, Icons, type IconName } from './icons';
import { Avatar } from './ui/Avatar';
import { BookCover } from './ui/BookCover';
import { useAppShell } from './AppShell';

function Sidebar({ children }: { children: ReactNode }) {
  return <aside className="sidebar">{children}</aside>;
}

function Brand() {
  const { collapsed, setCollapsed } = useAppShell();
  return (
    <div className="sb-top">
      <div className="sb-logo">
        <Icons.Logo />
      </div>
      <div className="sb-brand">
        Blockpress
        <small>Editorial workspace</small>
      </div>
      <button className="sb-collapse" title="Collapse sidebar" onClick={() => setCollapsed(!collapsed)}>
        <Icons.PanelLeft />
      </button>
    </div>
  );
}

function Scroll({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="sb-scroll" style={style}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="sb-section-label">{children}</div>;
}

function NavItem({
  icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button className={'nav-item' + (active ? ' active' : '')} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
      {count != null && <span className="count">{count}</span>}
    </button>
  );
}

function UserCard({ user, onClick }: { user: User; onClick?: () => void }) {
  // The card doubles as the entry point to account settings (API keys) when given an
  // onClick — the ChevUpDown affordance already signals it's interactive.
  const content = (
    <>
      <Avatar name={user.name} color={user.avatarColor} />
      <div className="meta">
        <div className="name">{user.name}</div>
        <div className="email">{user.email}</div>
      </div>
      <span className="chev">
        <Icons.ChevUpDown />
      </span>
    </>
  );
  if (onClick) {
    // Render as a button for keyboard/click semantics; the inline overrides keep it visually
    // identical to the static card (the .sb-user margin/border styling is shared).
    return (
      <button
        className="sb-user"
        onClick={onClick}
        title="API keys & settings"
        style={{ width: 'calc(100% - 24px)', textAlign: 'left', cursor: 'pointer' }}
      >
        {content}
      </button>
    );
  }
  return <div className="sb-user">{content}</div>;
}

function BookHead({
  book,
  onBack,
  onDelete,
}: {
  book: BookDetail;
  onBack: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="book-head">
      <button className="book-back" onClick={onBack} title="Back to library">
        <Icons.ArrowLeft />
      </button>
      <BookCover book={book} className="book-cover-sm" />
      <div className="t">
        <div
          className="name"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {book.title}
        </div>
        <div className="sub">
          {book.author}
          {book.year ? ` · ${book.year}` : ''}
        </div>
      </div>
      {onDelete && (
        <button
          className="book-del"
          onClick={onDelete}
          title="Delete book"
          aria-label={`Delete book ${book.title}`}
        >
          <Icons.Trash />
        </button>
      )}
    </div>
  );
}

function Tree({ children }: { children: ReactNode }) {
  return <div className="tree">{children}</div>;
}

function ChapterNode({
  chapter,
  activePageId,
  onOpenPage,
  onAddPage,
  onDeletePage,
  onDeleteChapter,
}: {
  chapter: Chapter;
  activePageId: string | null;
  onOpenPage: (chapterId: string, pageId: string) => void;
  onAddPage: (chapterId: string) => void;
  onDeletePage?: (chapterId: string, pageId: string) => void;
  onDeleteChapter?: (chapterId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="chapter">
      <div className={'chapter-row' + (collapsed ? ' collapsed' : '')} onClick={() => setCollapsed((c) => !c)}>
        <span className="twirl">
          <Icons.ChevronDown />
        </span>
        <span className="ch-name">{chapter.title}</span>
        <button
          className="ch-add"
          title="Add page"
          onClick={(e) => {
            e.stopPropagation();
            onAddPage(chapter.id);
          }}
        >
          <Icons.Plus />
        </button>
        {onDeleteChapter && (
          <button
            className="row-del"
            title="Delete chapter"
            aria-label={`Delete chapter ${chapter.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteChapter(chapter.id);
            }}
          >
            <Icons.Trash />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="pages">
          {chapter.pages.map((pg) => (
            <div
              key={pg.id}
              className={'page-row' + (pg.id === activePageId ? ' active' : '')}
              onClick={() => onOpenPage(chapter.id, pg.id)}
            >
              <Icons.Doc />
              <span className="pg-name">{pg.title || 'Untitled'}</span>
              {onDeletePage && (
                <button
                  className="row-del"
                  title="Delete page"
                  aria-label={`Delete page ${pg.title || 'Untitled'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePage(chapter.id, pg.id);
                  }}
                >
                  <Icons.Trash />
                </button>
              )}
            </div>
          ))}
          <button className="tree-add" style={{ marginTop: 2 }} onClick={() => onAddPage(chapter.id)}>
            <Icons.Plus /> Add page
          </button>
        </div>
      )}
    </div>
  );
}

function TreeAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="tree-add" onClick={onClick}>
      <Icons.Plus /> {label}
    </button>
  );
}

// Compound export.
export const SidebarRoot = Object.assign(Sidebar, {
  Brand,
  Scroll,
  SectionLabel,
  NavItem,
  User: UserCard,
  BookHead,
  Tree,
  Chapter: ChapterNode,
  TreeAdd,
});

export { SidebarRoot as Sidebar };
