import { blankDoc, type TiptapDoc } from '@blockpress/shared';

export interface PageSkeleton {
  title: string;
  content: TiptapDoc;
}
export interface ChapterSkeleton {
  title: string;
  pages: PageSkeleton[];
}
export interface BookSkeleton {
  title: string;
  chapters: ChapterSkeleton[];
}

/** New-book skeleton — mirror the prototype's `newWork()` factory (book branch). */
export function newBookSkeleton(title?: string): BookSkeleton {
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
