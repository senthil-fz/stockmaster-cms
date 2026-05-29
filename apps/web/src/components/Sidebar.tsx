import { useState, type ReactNode } from 'react';
import type { Chapter, User, WorkDetail } from '@blockpress/shared';
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

function UserCard({ user }: { user: User }) {
  return (
    <div className="sb-user">
      <Avatar name={user.name} color={user.avatarColor} />
      <div className="meta">
        <div className="name">{user.name}</div>
        <div className="email">{user.email}</div>
      </div>
      <span className="chev">
        <Icons.ChevUpDown />
      </span>
    </div>
  );
}

function BookHead({ work, onBack }: { work: WorkDetail; onBack: () => void }) {
  return (
    <div className="book-head">
      <button className="book-back" onClick={onBack} title="Back to library">
        <Icons.ArrowLeft />
      </button>
      {work.kind === 'book' ? (
        <BookCover work={work} className="book-cover-sm" />
      ) : (
        <div className="book-cover-sm" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)' }}>
          <Icons.Doc />
        </div>
      )}
      <div className="t">
        <div
          className="name"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {work.title}
        </div>
        <div className="sub">
          {work.author}
          {work.year ? ` · ${work.year}` : ''}
        </div>
      </div>
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
}: {
  chapter: Chapter;
  activePageId: string | null;
  onOpenPage: (chapterId: string, pageId: string) => void;
  onAddPage: (chapterId: string) => void;
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
