import { useState } from 'react';
import type { Chapter, PageSummary } from '@blockpress/shared';
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
    <div className="chapter">
      <div
        className={'chapter-row' + (collapsed ? ' collapsed' : '')}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="twirl">
          <Icons.ChevronDown />
        </span>
        <span className="ch-name">{chapter.title}</span>
      </div>
      {!collapsed && (
        <div className="pages">
          {chapter.pages.map((pg: PageSummary) => (
            <div
              key={pg.id}
              className={'page-row' + (pg.id === activePageId ? ' active' : '')}
              onClick={() => onOpenPage(pg.id)}
            >
              <Icons.Doc />
              <span className="pg-name">{pg.title || 'Untitled'}</span>
              {pg.status === 'draft' && <span className="reader-toc-draft" />}
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
    <div className="tree">
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
