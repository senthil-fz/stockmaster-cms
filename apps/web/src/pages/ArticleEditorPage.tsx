import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEditorState } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { countWordsInDoc, type ArticleDetail } from '@stockmaster/shared';
import { articlesApi } from '../lib/api';
import { articleQueryOptions } from '../lib/queries';
import { useDebouncedCallback } from '../lib/useDebouncedCallback';
import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Topbar, type SaveState } from '../components/Topbar';
import { ArticleSettings } from '../components/ArticleSettings';
import { VersionHistory } from '../components/VersionHistory';
import { Icons } from '../components/icons';
import { useBlockEditor } from '../editor/useBlockEditor';
import { BlockEditor } from '../editor/BlockEditor';

const ROUTE_ID = '/_app/articles/$articleId/';

export function ArticleEditorPage() {
  const { articleId } = useParams({ from: ROUTE_ID });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: article } = useQuery(articleQueryOptions(articleId));

  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteArticle = useMutation({
    mutationFn: () => articlesApi.remove(articleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      setConfirmDelete(false);
      void navigate({ to: '/' });
    },
  });

  if (!article) return null;

  return (
    <>
      <AppShell
        sidebar={() => (
          <Sidebar>
            <Sidebar.Brand />
            <div className="book-head">
              <button className="book-back" onClick={() => navigate({ to: '/' })} title="Back to library">
                <Icons.ArrowLeft />
              </button>
              <div
                className="book-cover-sm"
                style={{ display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)' }}
              >
                <Icons.Doc />
              </div>
              <div className="t">
                <div
                  className="name"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {article.title || 'Untitled'}
                </div>
                <div className="sub">
                  {article.author}
                  {article.year ? ` · ${article.year}` : ''}
                </div>
              </div>
              <button
                className="book-del"
                onClick={() => setConfirmDelete(true)}
                title="Delete article"
                aria-label={`Delete article ${article.title}`}
              >
                <Icons.Trash />
              </button>
            </div>
          </Sidebar>
        )}
      >
        <ArticleWorkspace key={article.id} article={article} />
      </AppShell>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete article?"
        message={`This permanently removes "${article.title || 'Untitled'}". This cannot be undone.`}
        confirmLabel="Delete article"
        busy={deleteArticle.isPending}
        onConfirm={() => deleteArticle.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function ArticleWorkspace({ article }: { article: ArticleDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Right panel: article settings, version history, or closed.
  const [panel, setPanel] = useState<'settings' | 'versions' | null>('settings');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [title, setTitle] = useState(article.title);

  const onUpdated = (updated: ArticleDetail) => {
    queryClient.setQueryData(articleQueryOptions(article.id).queryKey, updated);
    void queryClient.invalidateQueries({ queryKey: ['articles'] });
  };

  // Publish/unpublish — snapshot the draft to a live version, or pull the article from
  // public. The response shape isn't pinned, so we refetch to read derived status.
  const afterPublishChange = () => {
    void queryClient.invalidateQueries({ queryKey: ['article', article.id] });
    void queryClient.invalidateQueries({ queryKey: ['article', article.id, 'versions'] });
    void queryClient.invalidateQueries({ queryKey: ['articles'] });
  };
  const publish = useMutation({
    mutationFn: () => articlesApi.publish(article.id),
    onSuccess: afterPublishChange,
  });
  const unpublish = useMutation({
    mutationFn: () => articlesApi.unpublish(article.id),
    onSuccess: afterPublishChange,
  });
  const publishBusy = publish.isPending || unpublish.isPending;

  const saveContent = useMutation({
    mutationFn: (content: JSONContent) =>
      articlesApi.update(article.id, { content: content as never }),
    onMutate: () => setSaveState('saving'),
    onSuccess: (updated) => {
      onUpdated(updated);
      setSaveState('saved');
    },
    onError: () => setSaveState('dirty'),
  });
  const debouncedSave = useDebouncedCallback((doc: JSONContent) => saveContent.mutate(doc), 800);

  const saveTitle = useMutation({
    mutationFn: (t: string) => articlesApi.update(article.id, { title: t }),
    onSuccess: (updated) => onUpdated(updated),
  });
  const debouncedTitle = useDebouncedCallback((t: string) => saveTitle.mutate(t), 700);

  const editor = useBlockEditor({
    content: article.content,
    onChange: (doc) => {
      setSaveState('dirty');
      debouncedSave(doc);
    },
  });

  const words =
    useEditorState({
      editor,
      selector: ({ editor: e }) => (e ? countWordsInDoc(e.getJSON() as never) : 0),
      equalityFn: (a, b) => a === b,
    }) ?? 0;

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
              navigate({ to: '/articles/$articleId/read', params: { articleId: article.id } });
            }}
          >
            <Icons.Eye />
          </button>
          {article.status === 'published' && article.hasUnpublishedChanges && (
            <span className="status draft" title="The published article has edits not yet published">
              <span className="led" />
              Unpublished changes
            </span>
          )}
          {article.status === 'published' && (
            <button
              className="btn btn-secondary"
              disabled={publishBusy}
              onClick={() => unpublish.mutate()}
            >
              Unpublish
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={publishBusy}
            onClick={() => {
              flushPending();
              publish.mutate();
            }}
          >
            {article.status === 'published' ? 'Publish changes' : 'Publish'}
          </button>
          <button
            className="icon-btn bordered"
            title="Version history"
            style={{ opacity: panel === 'versions' ? 1 : 0.6 }}
            onClick={() => setPanel((p) => (p === 'versions' ? null : 'versions'))}
          >
            <Icons.Clock />
          </button>
          <button
            className="icon-btn bordered"
            title="Article details"
            style={{ opacity: panel === 'settings' ? 1 : 0.6 }}
            onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))}
          >
            <Icons.PanelLeft style={{ transform: 'scaleX(-1)' }} />
          </button>
        </Topbar.Actions>
      </Topbar>

      <div className={'work-area' + (panel ? ' with-panel' : '')}>
        <div className="canvas-scroll">
          <div className="editor-wrap">
            <div className="editor">
              <div className="doc-meta-row">
                <span className="kind-tag">
                  <Icons.Doc />
                  Article
                </span>
              </div>
              <input
                className="doc-title-input"
                aria-label="Article title"
                value={title}
                placeholder="Untitled article"
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim()) debouncedTitle(e.target.value);
                }}
              />
              <div className="doc-divider" />
              {editor && <BlockEditor editor={editor} />}
            </div>
          </div>
        </div>

        {panel === 'versions' ? (
          <VersionHistory id={article.id} kind="article" onClose={() => setPanel(null)} />
        ) : panel === 'settings' ? (
          <ArticleSettings article={article} words={words} onClose={() => setPanel(null)} />
        ) : null}
      </div>
    </>
  );
}
