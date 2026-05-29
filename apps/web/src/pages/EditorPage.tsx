import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEditorState } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import {
  countWordsInDoc,
  type Chapter,
  type Page,
  type PublishStatus,
  type WorkDetail,
} from '@blockpress/shared';
import { pagesApi, worksApi } from '../lib/api';
import { pageQueryOptions, workQueryOptions } from '../lib/queries';
import { useDebouncedCallback } from '../lib/useDebouncedCallback';
import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { Topbar, type SaveState } from '../components/Topbar';
import { Panel } from '../components/Panel';
import { PageSettings } from '../components/PageSettings';
import { Icons } from '../components/icons';
import { useBlockEditor } from '../editor/useBlockEditor';
import { useActiveBlock } from '../editor/useActiveBlock';
import { BlockEditor } from '../editor/BlockEditor';
import { BlockSettings } from '../editor/BlockSettings';

const ROUTE_ID = '/_app/works/$workId/pages/$pageId';
const ROUTE_TO = '/works/$workId/pages/$pageId';

export function EditorPage() {
  const { workId, pageId } = useParams({ from: ROUTE_ID });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: work } = useQuery(workQueryOptions(workId));
  const { data: page } = useQuery(pageQueryOptions(pageId));

  const goToPage = (pId: string) =>
    navigate({ to: ROUTE_TO, params: { workId, pageId: pId } });

  const addPage = useMutation({
    mutationFn: (chapterId: string) => pagesApi.addPage(chapterId, {}),
    onSuccess: async (newPage) => {
      await queryClient.invalidateQueries({ queryKey: ['work', workId] });
      void goToPage(newPage.id);
    },
  });

  const addChapter = useMutation({
    mutationFn: () => worksApi.addChapter(workId, {}),
    onSuccess: async (chapter) => {
      await queryClient.invalidateQueries({ queryKey: ['work', workId] });
      const first = chapter.pages[0];
      if (first) void goToPage(first.id);
    },
  });

  if (!work || !page) return null;

  const chapter =
    work.chapters.find((c) => c.pages.some((p) => p.id === page.id)) ?? work.chapters[0];

  return (
    <AppShell
      sidebar={() => (
        <Sidebar>
          <Sidebar.Brand />
          <Sidebar.BookHead work={work} onBack={() => navigate({ to: '/' })} />
          <Sidebar.Scroll style={{ paddingTop: 0 }}>
            <Sidebar.Tree>
              {work.chapters.map((ch) => (
                <Sidebar.Chapter
                  key={ch.id}
                  chapter={ch}
                  activePageId={page.id}
                  onOpenPage={(_chId, pId) => goToPage(pId)}
                  onAddPage={(chId) => addPage.mutate(chId)}
                />
              ))}
              {work.kind === 'book' && (
                <Sidebar.TreeAdd label="Add chapter" onClick={() => addChapter.mutate()} />
              )}
            </Sidebar.Tree>
          </Sidebar.Scroll>
        </Sidebar>
      )}
    >
      <EditorWorkspace key={page.id} work={work} chapter={chapter} page={page} />
    </AppShell>
  );
}

function EditorWorkspace({
  work,
  chapter,
  page,
}: {
  work: WorkDetail;
  chapter: Chapter;
  page: Page;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rightOpen, setRightOpen] = useState(true);
  const [showPageSettings, setShowPageSettings] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [title, setTitle] = useState(page.title);

  const invalidateTree = () => {
    void queryClient.invalidateQueries({ queryKey: ['work', work.id] });
    void queryClient.invalidateQueries({ queryKey: ['works'] });
  };

  const saveContent = useMutation({
    mutationFn: (content: JSONContent) =>
      pagesApi.update(page.id, { content: content as never }),
    onMutate: () => setSaveState('saving'),
    onSuccess: (updated) => {
      queryClient.setQueryData(pageQueryOptions(page.id).queryKey, updated);
      setSaveState('saved');
      invalidateTree();
    },
    onError: () => setSaveState('dirty'),
  });
  const debouncedSave = useDebouncedCallback((doc: JSONContent) => saveContent.mutate(doc), 800);

  const saveTitle = useMutation({
    mutationFn: (t: string) => pagesApi.update(page.id, { title: t }),
    onSuccess: (updated) => {
      queryClient.setQueryData(pageQueryOptions(page.id).queryKey, updated);
      invalidateTree();
    },
  });
  const debouncedTitle = useDebouncedCallback((t: string) => saveTitle.mutate(t), 700);

  const setStatus = useMutation({
    mutationFn: (status: PublishStatus) => pagesApi.update(page.id, { status }),
    onSuccess: (updated) => {
      queryClient.setQueryData(pageQueryOptions(page.id).queryKey, updated);
      invalidateTree();
    },
  });

  const editor = useBlockEditor({
    content: page.content,
    onChange: (doc) => {
      setSaveState('dirty');
      debouncedSave(doc);
    },
    onSelect: () => setShowPageSettings(false),
  });

  const stats = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e ? { blocks: e.state.doc.childCount, words: countWordsInDoc(e.getJSON() as never) } : { blocks: 0, words: 0 },
    equalityFn: (a, b) => a?.blocks === b?.blocks && a?.words === b?.words,
  }) ?? { blocks: 0, words: 0 };

  const active = useActiveBlock(editor);

  const flushSave = () => {
    if (editor) saveContent.mutate(editor.getJSON());
  };

  return (
    <>
      <Topbar>
        <Topbar.Crumbs>
          <Topbar.Crumb onClick={() => navigate({ to: '/' })}>Library</Topbar.Crumb>
          <Topbar.Sep />
          <Topbar.Crumb
            onClick={() => {
              const first = work.chapters[0]?.pages[0];
              if (first) navigate({ to: ROUTE_TO, params: { workId: work.id, pageId: first.id } });
            }}
          >
            {work.title}
          </Topbar.Crumb>
          <Topbar.Sep />
          <Topbar.Crumb current>{title || 'Untitled'}</Topbar.Crumb>
        </Topbar.Crumbs>
        <Topbar.Spacer />
        <Topbar.Actions>
          <Topbar.SaveStatus state={saveState} />
          <button className="icon-btn bordered" title="Preview">
            <Icons.Eye />
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setStatus.mutate('draft');
              flushSave();
            }}
          >
            Save as draft
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setStatus.mutate('published');
              flushSave();
            }}
          >
            Publish changes
          </button>
          <button
            className="icon-btn bordered"
            title="Toggle settings"
            style={{ opacity: rightOpen ? 1 : 0.6 }}
            onClick={() => setRightOpen((o) => !o)}
          >
            <Icons.PanelLeft style={{ transform: 'scaleX(-1)' }} />
          </button>
        </Topbar.Actions>
      </Topbar>

      <div className={'work-area' + (rightOpen ? ' with-panel' : '')}>
        <div className="canvas-scroll">
          <div className="editor-wrap">
            <div className="editor">
              <div className="doc-meta-row">
                <span className="kind-tag">
                  {work.kind === 'book' ? <Icons.Book /> : <Icons.Doc />}
                  {chapter.title}
                </span>
              </div>
              <input
                className="doc-title-input"
                value={title}
                placeholder="Untitled page"
                onChange={(e) => {
                  setTitle(e.target.value);
                  debouncedTitle(e.target.value);
                }}
              />
              <div className="doc-divider" />
              {editor && <BlockEditor editor={editor} />}
            </div>
          </div>
        </div>

        {rightOpen &&
          (showPageSettings || !active ? (
              <PageSettings
                chapterTitle={chapter.title}
                title={title}
                status={page.status}
                tags={work.tags}
                kindLabel={work.kind === 'book' ? 'Book' : 'Article'}
                words={stats.words}
                blocks={stats.blocks}
                updatedLabel="just now"
                onTitle={(t) => {
                  setTitle(t);
                  debouncedTitle(t);
                }}
                onStatus={(s) => setStatus.mutate(s)}
              />
            ) : (
              editor && (
                <BlockSettings
                  editor={editor}
                  active={active}
                  onClose={() => setShowPageSettings(true)}
                />
              )
            ))}
      </div>
    </>
  );
}
