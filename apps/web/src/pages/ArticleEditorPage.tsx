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
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
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
            <div className="flex gap-2.5 items-center px-3.5 py-3 mb-1">
              <button
                className="border border-line bg-canvas w-[30px] h-[30px] rounded-[8px] flex-none grid place-items-center text-muted shadow-xs hover:bg-hover hover:text-fg [&_svg]:w-[18px] [&_svg]:h-[18px]"
                onClick={() => navigate({ to: '/' })}
                title="Back to library"
              >
                <Icons.ArrowLeft />
              </button>
              <div
                className="w-[34px] h-[46px] rounded-[4px] flex-none object-cover shadow-sm bg-subtle"
                style={{ display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)' }}
              >
                <Icons.Doc />
              </div>
              <div className="min-w-0">
                <div
                  className="font-semibold text-sm tracking-[-0.01em] leading-[1.2]"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {article.title || 'Untitled'}
                </div>
                <div className="text-faint text-xs">
                  {article.author}
                  {article.year ? ` · ${article.year}` : ''}
                </div>
              </div>
              <button
                className="self-start border-none bg-transparent text-faint w-[26px] h-[26px] rounded-[6px] grid place-items-center cursor-pointer flex-shrink-0 hover:bg-[color-mix(in_oklch,#c0392b_12%,transparent)] hover:text-[#c0392b] [&_svg]:w-[15px] [&_svg]:h-[15px]"
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
          <IconButton
            bordered
            title="Preview"
            aria-label="Preview"
            onClick={() => {
              flushPending();
              navigate({ to: '/articles/$articleId/read', params: { articleId: article.id } });
            }}
          >
            <Icons.Eye />
          </IconButton>
          {article.status === 'published' && article.hasUnpublishedChanges && (
            <Badge tone="draft" title="The published article has edits not yet published">
              Unpublished changes
            </Badge>
          )}
          {article.status === 'published' && (
            <Button
              variant="secondary"
              disabled={publishBusy}
              onClick={() => unpublish.mutate()}
            >
              Unpublish
            </Button>
          )}
          <Button
            variant="primary"
            disabled={publishBusy}
            onClick={() => {
              flushPending();
              publish.mutate();
            }}
          >
            {article.status === 'published' ? 'Publish changes' : 'Publish'}
          </Button>
          <IconButton
            bordered
            title="Version history"
            aria-label="Version history"
            style={{ opacity: panel === 'versions' ? 1 : 0.6 }}
            onClick={() => setPanel((p) => (p === 'versions' ? null : 'versions'))}
          >
            <Icons.Clock />
          </IconButton>
          <IconButton
            bordered
            title="Article details"
            aria-label="Article details"
            style={{ opacity: panel === 'settings' ? 1 : 0.6 }}
            onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))}
          >
            <Icons.PanelLeft style={{ transform: 'scaleX(-1)' }} />
          </IconButton>
        </Topbar.Actions>
      </Topbar>

      <div className={'grid min-h-0 flex-1 ' + (panel ? 'grid-cols-[1fr_340px]' : 'grid-cols-[1fr]')}>
        <div className="canvas-scroll">
          <div className="pt-[30px] px-6 pb-[200px]">
            <div className="max-w-[var(--content-width)] mx-auto">
              <div className="flex items-center gap-2.5 mb-3 text-faint text-[13px]">
                <span className="mt-auto self-start inline-flex items-center gap-[5px] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted bg-subtle border border-line rounded-full px-[9px] py-[3px] [&_svg]:w-[14px] [&_svg]:h-[14px]">
                  <Icons.Doc />
                  Article
                </span>
              </div>
              <input
                className="block w-full border-none bg-transparent text-fg font-[var(--font-content)] py-0.5 px-0 text-[34px] font-bold tracking-[-0.02em] leading-[1.12] outline-none placeholder:text-faint"
                aria-label="Article title"
                value={title}
                placeholder="Untitled article"
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim()) debouncedTitle(e.target.value);
                }}
              />
              <div className="h-px bg-line mt-[18px] mb-2" />
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
