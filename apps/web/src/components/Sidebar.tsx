import { useState, type ReactNode } from 'react';
import type { BookDetail, Chapter, User } from '@stockmaster/shared';
import { Icon, Icons, type IconName } from './icons';
import { Avatar } from './ui/Avatar';
import { BookCover } from './ui/BookCover';
import { useAppShell } from './AppShell';

function Sidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="bg-sidebar border-r border-line flex flex-col min-w-0 overflow-hidden">{children}</aside>
  );
}

function Brand() {
  const { collapsed, setCollapsed } = useAppShell();
  return (
    <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
      <div className="w-[30px] h-[30px] rounded-lg bg-primary grid place-items-center text-onprimary flex-none [&_svg]:w-4 [&_svg]:h-4">
        <Icons.Logo />
      </div>
      <div className="font-semibold text-sm tracking-[-0.01em]">
        StockMaster
        <small className="block text-faint font-medium text-[11px]">Editorial workspace</small>
      </div>
      <button
        className="ml-auto border-none bg-transparent text-faint w-7 h-7 rounded-md grid place-items-center hover:bg-hover hover:text-muted"
        title="Collapse sidebar"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Icons.PanelLeft />
      </button>
    </div>
  );
}

function Scroll({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="flex-1 overflow-y-auto px-3 pt-1 pb-3" style={style}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-faint px-2 pt-[14px] pb-1.5">
      {children}
    </div>
  );
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
    <button
      className={
        'flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-lg border text-sm font-medium transition-colors [&_svg]:w-[18px] [&_svg]:h-[18px] [&_svg]:flex-none [&_svg]:text-current [&_svg]:opacity-85 ' +
        (active
          ? 'bg-[var(--bg-active)] text-fg border-line shadow-xs'
          : 'bg-transparent border-transparent text-muted hover:bg-hover hover:text-fg')
      }
      onClick={onClick}
    >
      <Icon name={icon} />
      <span className="whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
      {count != null && (
        <span className="ml-auto text-xs font-semibold text-muted bg-subtle border border-line rounded-full px-2 py-px min-w-[22px] text-center">
          {count}
        </span>
      )}
    </button>
  );
}

function UserCard({ user, onClick }: { user: User; onClick?: () => void }) {
  // The card doubles as the entry point to account settings (API keys) when given an
  // onClick — the ChevUpDown affordance already signals it's interactive.
  const cardClass =
    'mx-3 mt-2 mb-3.5 p-2.5 flex items-center gap-2.5 border border-line rounded-xl bg-canvas shadow-xs';
  const content = (
    <>
      <Avatar name={user.name} color={user.avatarColor} />
      <div className="min-w-0">
        <div className="font-semibold text-[13px]">{user.name}</div>
        <div className="text-faint text-xs whitespace-nowrap overflow-hidden text-ellipsis">{user.email}</div>
      </div>
      <span className="ml-auto text-faint [&_svg]:w-[18px] [&_svg]:h-[18px]">
        <Icons.ChevUpDown />
      </span>
    </>
  );
  if (onClick) {
    // Render as a button for keyboard/click semantics; the inline overrides keep it visually
    // identical to the static card (the .sb-user margin/border styling is shared).
    return (
      <button
        className={cardClass}
        onClick={onClick}
        title="API keys & settings"
        style={{ width: 'calc(100% - 24px)', textAlign: 'left', cursor: 'pointer' }}
      >
        {content}
      </button>
    );
  }
  return <div className={cardClass}>{content}</div>;
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
    <div className="flex gap-2.5 items-center px-3.5 py-3 mb-1">
      <button
        className="border border-line bg-canvas w-[30px] h-[30px] rounded-lg flex-none grid place-items-center text-muted shadow-xs hover:bg-hover hover:text-fg [&_svg]:w-[18px] [&_svg]:h-[18px]"
        onClick={onBack}
        title="Back to library"
      >
        <Icons.ArrowLeft />
      </button>
      <BookCover
        book={book}
        className="w-[34px] h-[46px] rounded-sm flex-none object-cover shadow-sm bg-subtle"
      />
      <div className="min-w-0">
        <div
          className="font-semibold text-sm tracking-[-0.01em] leading-[1.2]"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {book.title}
        </div>
        <div className="text-faint text-xs">
          {book.author}
          {book.year ? ` · ${book.year}` : ''}
        </div>
      </div>
      {onDelete && (
        <button
          className="self-start border-none bg-transparent text-faint w-[26px] h-[26px] rounded-md grid place-items-center cursor-pointer flex-shrink-0 hover:bg-[color-mix(in_oklch,#c0392b_12%,transparent)] hover:text-[#c0392b] [&_svg]:w-[15px] [&_svg]:h-[15px]"
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
  return <div className="px-2.5 pt-0.5 pb-2.5">{children}</div>;
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
    <div className="mb-0.5">
      <div
        className="group flex items-center gap-1.5 px-2 py-[7px] rounded-lg cursor-pointer text-muted font-semibold text-[13px] hover:bg-hover hover:text-fg"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span
          className={
            'w-4 h-4 grid place-items-center text-faint transition-transform flex-none [&_svg]:w-4 [&_svg]:h-4' +
            (collapsed ? ' -rotate-90' : '')
          }
        >
          <Icons.ChevronDown />
        </span>
        <span className="whitespace-nowrap overflow-hidden text-ellipsis">{chapter.title}</span>
        <button
          className="ml-auto opacity-0 group-hover:opacity-100 border-none bg-transparent text-faint w-[22px] h-[22px] rounded-md grid place-items-center hover:bg-[var(--bg-active)] hover:text-fg hover:shadow-xs [&_svg]:w-[15px] [&_svg]:h-[15px]"
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
            className="opacity-0 group-hover:opacity-100 border-none bg-transparent text-faint w-[22px] h-[22px] rounded-md grid place-items-center cursor-pointer hover:bg-[color-mix(in_oklch,#c0392b_12%,transparent)] hover:text-[#c0392b] [&_svg]:w-[14px] [&_svg]:h-[14px]"
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
        <div className="mt-px mb-1 ml-[15px] pl-[14px] border-l border-line">
          {chapter.pages.map((pg) => (
            <div
              key={pg.id}
              className={
                'group flex items-center gap-2 px-2 py-1.5 rounded-[7px] cursor-pointer text-[13px] font-medium border border-transparent [&_svg]:w-[15px] [&_svg]:h-[15px] [&_svg]:flex-none [&_svg]:opacity-70 ' +
                (pg.id === activePageId
                  ? 'bg-[var(--bg-active)] text-fg border-line shadow-xs'
                  : 'text-muted hover:bg-hover hover:text-fg')
              }
              onClick={() => onOpenPage(chapter.id, pg.id)}
            >
              <Icons.Doc />
              <span className="whitespace-nowrap overflow-hidden text-ellipsis">{pg.title || 'Untitled'}</span>
              {onDeletePage && (
                <button
                  className="ml-auto opacity-0 group-hover:opacity-100 border-none bg-transparent text-faint w-[22px] h-[22px] rounded-md grid place-items-center cursor-pointer hover:bg-[color-mix(in_oklch,#c0392b_12%,transparent)] hover:text-[#c0392b] [&_svg]:w-[14px] [&_svg]:h-[14px]"
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
          <button
            className="flex items-center gap-2 w-full mt-0.5 px-2.5 py-[7px] rounded-lg border border-dashed border-line-strong bg-transparent text-faint text-[13px] font-medium hover:text-fg hover:border-faint hover:bg-hover [&_svg]:w-[15px] [&_svg]:h-[15px]"
            style={{ marginTop: 2 }}
            onClick={() => onAddPage(chapter.id)}
          >
            <Icons.Plus /> Add page
          </button>
        </div>
      )}
    </div>
  );
}

function TreeAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="flex items-center gap-2 w-full mt-1 px-2.5 py-[7px] rounded-lg border border-dashed border-line-strong bg-transparent text-faint text-[13px] font-medium hover:text-fg hover:border-faint hover:bg-hover [&_svg]:w-[15px] [&_svg]:h-[15px]"
      onClick={onClick}
    >
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
