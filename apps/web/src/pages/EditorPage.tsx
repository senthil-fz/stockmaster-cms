import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEditorState } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import {
  countWordsInDoc,
  type Chapter,
  type Page,
  type PublishStatus,
  type UpdatePageInput,
  type WorkDetail,
} from '@blockpress/shared';
import { pagesApi, worksApi } from '../lib/api';
import { pageQueryOptions, workQueryOptions } from '../lib/queries';
import { useDebouncedCallback } from '../lib/useDebouncedCallback';
import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { ConfirmDialog } from '../components/ConfirmDialog';
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

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  run: () => void;
}

/** Given the flat page order, pick the page to open after `removed` pages are deleted. */
function nextPageId(flat: string[], removed: Set<string>, currentId: string): string | null {
  const idx = flat.indexOf(currentId);
  for (let i = idx + 1; i < flat.length; i++) if (!removed.has(flat[i])) return flat[i];
  for (let i = idx - 1; i >= 0; i--) if (!removed.has(flat[i])) return flat[i];
  return null;
}

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

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const afterTreeChange = async () => {
    await queryClient.invalidateQueries({ queryKey: ['work', workId] });
    await queryClient.invalidateQueries({ queryKey: ['works'] });
  };
  const navigateAfterDelete = (goTo: string | null) => {
    setConfirm(null);
    if (goTo === '/') void navigate({ to: '/' });
    else if (goTo) void goToPage(goTo);
  };

  const deletePage = useMutation({
    mutationFn: (vars: { pageId: string; goTo: string | null }) => pagesApi.remove(vars.pageId),
    onSuccess: async (_r, vars) => {
      await afterTreeChange();
      navigateAfterDelete(vars.goTo);
    },
  });

  const deleteChapter = useMutation({
    mutationFn: (vars: { chapterId: string; goTo: string | null }) =>
      worksApi.removeChapter(vars.chapterId),
    onSuccess: async (_r, vars) => {
      await afterTreeChange();
      navigateAfterDelete(vars.goTo);
    },
  });

  const deleteWork = useMutation({
    mutationFn: () => worksApi.remove(workId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['works'] });
      setConfirm(null);
      void navigate({ to: '/' });
    },
  });

  if (!work || !page) return null;

  const activePage = page;
  const chapter =
    work.chapters.find((c) => c.pages.some((p) => p.id === activePage.id)) ?? work.chapters[0];

  const flatPageIds = work.chapters.flatMap((c) => c.pages.map((p) => p.id));

  const requestDeletePage = (pageId: string) => {
    const goTo =
      pageId === activePage.id ? (nextPageId(flatPageIds, new Set([pageId]), activePage.id) ?? '/') : null;
    setConfirm({
      title: 'Delete page?',
      message: 'This permanently removes the page and its content. This cannot be undone.',
      confirmLabel: 'Delete page',
      run: () => deletePage.mutate({ pageId, goTo }),
    });
  };

  const requestDeleteWork = () => {
    setConfirm({
      title: work.kind === 'book' ? 'Delete book?' : 'Delete article?',
      message: `This permanently removes "${work.title || 'Untitled'}"${
        work.kind === 'book' ? ' and all its chapters and pages' : ''
      }. This cannot be undone.`,
      confirmLabel: work.kind === 'book' ? 'Delete book' : 'Delete article',
      run: () => deleteWork.mutate(),
    });
  };

  const requestDeleteChapter = (chapterId: string) => {
    const ch = work.chapters.find((c) => c.id === chapterId);
    const removed = new Set(ch?.pages.map((p) => p.id) ?? []);
    const goTo = removed.has(activePage.id)
      ? (nextPageId(flatPageIds, removed, activePage.id) ?? '/')
      : null;
    const n = removed.size;
    setConfirm({
      title: 'Delete chapter?',
      message: `This permanently removes "${ch?.title ?? 'this chapter'}"${
        n ? ` and its ${n} page${n === 1 ? '' : 's'}` : ''
      }. This cannot be undone.`,
      confirmLabel: 'Delete chapter',
      run: () => deleteChapter.mutate({ chapterId, goTo }),
    });
  };

  return (
    <>
      <AppShell
        sidebar={() => (
          <Sidebar>
            <Sidebar.Brand />
            <Sidebar.BookHead
              work={work}
              onBack={() => navigate({ to: '/' })}
              onDelete={requestDeleteWork}
            />
            <Sidebar.Scroll style={{ paddingTop: 0 }}>
              <Sidebar.Tree>
                {work.chapters.map((ch) => (
                  <Sidebar.Chapter
                    key={ch.id}
                    chapter={ch}
                    activePageId={activePage.id}
                    onOpenPage={(_chId, pId) => goToPage(pId)}
                    onAddPage={(chId) => addPage.mutate(chId)}
                    onDeletePage={(_chId, pId) => requestDeletePage(pId)}
                    onDeleteChapter={work.kind === 'book' ? (chId) => requestDeleteChapter(chId) : undefined}
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
        <EditorWorkspace key={activePage.id} work={work} chapter={chapter} page={activePage} />
      </AppShell>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        busy={deletePage.isPending || deleteChapter.isPending || deleteWork.isPending}
        onConfirm={() => confirm?.run()}
        onCancel={() => setConfirm(null)}
      />
    </>
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

  // Latest edited values vs what has actually been persisted. Drives the teardown
  // safety-net save (reference comparison: each edit sets a new object, each save records it).
  const latest = useRef<{ content?: JSONContent; title?: string }>({});
  const saved = useRef<{ content: unknown; title: string }>({ content: page.content, title: page.title });

  const invalidateTree = () => {
    void queryClient.invalidateQueries({ queryKey: ['work', work.id] });
    void queryClient.invalidateQueries({ queryKey: ['works'] });
  };

  const saveContent = useMutation({
    mutationFn: (content: JSONContent) =>
      pagesApi.update(page.id, { content: content as never }),
    onMutate: () => setSaveState('saving'),
    onSuccess: (updated, content) => {
      saved.current.content = content;
      queryClient.setQueryData(pageQueryOptions(page.id).queryKey, updated);
      setSaveState('saved');
      invalidateTree();
    },
    onError: () => setSaveState('dirty'),
  });
  const debouncedSave = useDebouncedCallback((doc: JSONContent) => saveContent.mutate(doc), 800);

  const saveTitle = useMutation({
    mutationFn: (t: string) => pagesApi.update(page.id, { title: t }),
    onSuccess: (updated, t) => {
      saved.current.title = t;
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
      latest.current.content = doc;
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

  // Safety net for the debounce window: if the user navigates away (this component is
  // keyed by page.id, so it unmounts) or closes the tab before the debounced save fires,
  // persist any unsaved edits directly with a keepalive fetch. This bypasses the React
  // Query observer that is being torn down (so the network write always lands), and never
  // touches state on an unmounting component.
  useEffect(() => {
    const pageId = page.id;
    const pendingBody = (): UpdatePageInput | null => {
      const body: UpdatePageInput = {};
      if (latest.current.content && latest.current.content !== saved.current.content) {
        body.content = latest.current.content as never;
      }
      if (latest.current.title !== undefined && latest.current.title !== saved.current.title) {
        body.title = latest.current.title;
      }
      return Object.keys(body).length > 0 ? body : null;
    };
    const persist = () => {
      const body = pendingBody();
      if (body) pagesApi.updateOnUnload(pageId, body);
    };
    window.addEventListener('pagehide', persist);
    return () => {
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, [page.id]);

  // Flush pending debounced saves immediately (used by explicit Save/Publish, while mounted).
  const flushPending = () => {
    debouncedSave.flush();
    debouncedTitle.flush();
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
          <button
            className="icon-btn bordered"
            title="Preview"
            onClick={() => {
              flushPending();
              navigate({
                to: '/works/$workId/read/$pageId',
                params: { workId: work.id, pageId: page.id },
              });
            }}
          >
            <Icons.Eye />
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              flushPending();
              setStatus.mutate('draft');
            }}
          >
            Save as draft
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              flushPending();
              setStatus.mutate('published');
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
                aria-label="Page title"
                value={title}
                placeholder="Untitled page"
                onChange={(e) => {
                  setTitle(e.target.value);
                  latest.current.title = e.target.value;
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
                  latest.current.title = t;
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
