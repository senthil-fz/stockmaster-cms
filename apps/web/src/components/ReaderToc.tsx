import { useState } from 'react';
import type { Chapter, PageSummary } from '@stockmaster/shared';
import { Icons } from './icons';

function ChapterNode({
  chapter,
  activePageId,
  onOpenPage,
}: {
  chapter: Chapter;
  activePageId: string;
  onOpenPage: (pageId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="mb-0.5">
      <div
        className="flex items-center gap-1.5 px-2 py-[7px] rounded-lg cursor-pointer text-muted font-semibold text-[13px] hover:bg-hover hover:text-fg"
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
      </div>
      {!collapsed && (
        <div className="mt-px mb-1 ml-[15px] pl-[14px] border-l border-line">
          {chapter.pages.map((pg: PageSummary) => (
            <div
              key={pg.id}
              className={
                'flex items-center gap-2 px-2 py-1.5 rounded-[7px] cursor-pointer text-[13px] font-medium border border-transparent [&_svg]:w-[15px] [&_svg]:h-[15px] [&_svg]:flex-none [&_svg]:opacity-70 ' +
                (pg.id === activePageId
                  ? 'bg-[var(--bg-active)] text-fg border-line shadow-xs'
                  : 'text-muted hover:bg-hover hover:text-fg')
              }
              onClick={() => onOpenPage(pg.id)}
            >
              <Icons.Doc />
              <span className="whitespace-nowrap overflow-hidden text-ellipsis">{pg.title || 'Untitled'}</span>
              {pg.status === 'draft' && (
                <span className="w-[7px] h-[7px] rounded-full bg-amber ml-auto flex-none" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReaderToc({
  chapters,
  activePageId,
  onOpenPage,
}: {
  chapters: Chapter[];
  activePageId: string;
  onOpenPage: (pageId: string) => void;
}) {
  return (
    <div className="px-2.5 pt-0.5 pb-2.5">
      {chapters.map((ch) => (
        <ChapterNode
          key={ch.id}
          chapter={ch}
          activePageId={activePageId}
          onOpenPage={onOpenPage}
        />
      ))}
    </div>
  );
}
