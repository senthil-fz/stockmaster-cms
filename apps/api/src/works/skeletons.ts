import { blankDoc, type TiptapDoc, type WorkKind } from '@blockpress/shared';

export interface PageSkeleton {
  title: string;
  content: TiptapDoc;
}
export interface ChapterSkeleton {
  title: string;
  pages: PageSkeleton[];
}
export interface WorkSkeleton {
  title: string;
  chapters: ChapterSkeleton[];
}

/** New-work skeletons — mirror the prototype's `newWork()` factory. */
export function newWorkSkeleton(kind: WorkKind, title?: string): WorkSkeleton {
  if (kind === 'book') {
    return {
      title: title ?? 'Untitled book',
      chapters: [
        {
          title: 'Chapter 1',
          pages: [{ title: 'Introduction', content: blankDoc() }],
        },
      ],
    };
  }
  return {
    title: title ?? 'Untitled article',
    chapters: [{ title: 'Article', pages: [{ title: title ?? 'Untitled article', content: blankDoc() }] }],
  };
}
