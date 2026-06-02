import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { User, WorkKind, WorkSummary } from '@blockpress/shared';
import { worksApi } from '../lib/api';
import { workQueryOptions, worksQueryOptions } from '../lib/queries';
import { useAuth } from '../lib/auth';
import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { Library, type LibraryTab } from '../components/Library';
import { AddMember } from '../components/AddMember';
import { ReportingDashboard } from '../components/ReportingDashboard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icons } from '../components/icons';

function LibrarySidebar({
  user,
  works,
  tab,
  onTab,
  onOpenWork,
  onOpenSettings,
}: {
  user: User;
  works: WorkSummary[];
  tab: string;
  onTab: (t: string) => void;
  onOpenWork: (w: WorkSummary) => void;
  onOpenSettings: () => void;
}) {
  const drafts = works.filter((w) => w.status === 'draft').length;
  return (
    <Sidebar>
      <Sidebar.Brand />
      <Sidebar.Scroll>
        <Sidebar.SectionLabel>Workspace</Sidebar.SectionLabel>
        <Sidebar.NavItem icon="Library" label="Library" active={tab === 'all'} count={works.length} onClick={() => onTab('all')} />
        <Sidebar.NavItem icon="Pencil" label="Drafts" active={tab === 'drafts'} count={drafts} onClick={() => onTab('drafts')} />
        <Sidebar.NavItem icon="CheckCircle" label="Published" active={tab === 'published'} onClick={() => onTab('published')} />
        <Sidebar.NavItem icon="Trash" label="Trash" onClick={() => undefined} />

        <Sidebar.SectionLabel>Recent</Sidebar.SectionLabel>
        {works.slice(0, 4).map((w) => (
          <Sidebar.NavItem key={w.id} icon={w.kind === 'book' ? 'Book' : 'Doc'} label={w.title} onClick={() => onOpenWork(w)} />
        ))}

        <Sidebar.SectionLabel>General</Sidebar.SectionLabel>
        <Sidebar.NavItem icon="Chart" label="Reporting" active={tab === 'reporting'} onClick={() => onTab('reporting')} />
        <Sidebar.NavItem icon="Users" label="Authors" active={tab === 'authors'} onClick={() => onTab('authors')} />
        <Sidebar.NavItem icon="Settings" label="API keys" onClick={onOpenSettings} />
      </Sidebar.Scroll>
      <Sidebar.User user={user} onClick={onOpenSettings} />
    </Sidebar>
  );
}

export function LibraryPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('all');

  const { data: works = [] } = useQuery(worksQueryOptions());

  const openWork = async (work: WorkSummary) => {
    const detail = await queryClient.ensureQueryData(workQueryOptions(work.id));
    const firstPage = detail.chapters[0]?.pages[0];
    if (firstPage) {
      void navigate({
        to: '/works/$workId/pages/$pageId',
        params: { workId: work.id, pageId: firstPage.id },
      });
    }
  };

  const readWork = (work: WorkSummary) =>
    navigate({ to: '/works/$workId/read', params: { workId: work.id } });

  const createWork = useMutation({
    mutationFn: (kind: WorkKind) => worksApi.create({ kind }),
    onSuccess: async (work) => {
      await queryClient.invalidateQueries({ queryKey: ['works'] });
      await openWork(work);
    },
  });

  const [pendingDelete, setPendingDelete] = useState<WorkSummary | null>(null);
  const deleteWork = useMutation({
    mutationFn: (id: string) => worksApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['works'] });
      setPendingDelete(null);
    },
  });

  const counts = {
    all: works.length,
    books: works.filter((w) => w.kind === 'book').length,
    articles: works.filter((w) => w.kind === 'article').length,
    drafts: works.filter((w) => w.status === 'draft').length,
  };

  const filtered = works.filter((w) => {
    if (tab === 'books') return w.kind === 'book';
    if (tab === 'articles') return w.kind === 'article';
    if (tab === 'drafts') return w.status === 'draft';
    if (tab === 'published') return w.status === 'published';
    return true;
  });

  const tabs: LibraryTab[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'books', label: 'Books', count: counts.books },
    { key: 'articles', label: 'Articles', count: counts.articles },
    { key: 'drafts', label: 'Drafts', count: counts.drafts },
  ];

  return (
    <>
    <AppShell
      sidebar={() => (
        <LibrarySidebar
          user={auth.user!}
          works={works}
          tab={tab}
          onTab={setTab}
          onOpenWork={openWork}
          onOpenSettings={() => void navigate({ to: '/api-keys' })}
        />
      )}
    >
      <Topbar>
        <Topbar.Crumbs>
          <Topbar.Crumb current>
            {tab === 'authors' ? 'Authors' : tab === 'reporting' ? 'Reporting' : 'Library'}
          </Topbar.Crumb>
        </Topbar.Crumbs>
      </Topbar>

      <div className="canvas-scroll">
        {tab === 'reporting' ? (
          <ReportingDashboard />
        ) : tab === 'authors' ? (
          <AddMember />
        ) : (
          <Library>
            <Library.Hero>
              <button className="btn btn-secondary" onClick={() => createWork.mutate('article')}>
                <Icons.Doc /> New article
              </button>
              <button className="btn btn-primary" onClick={() => createWork.mutate('book')}>
                <Icons.Plus /> New book
              </button>
            </Library.Hero>
            <Library.Tabs tabs={tabs} active={tab} onSelect={setTab} />
            {filtered.length === 0 ? (
              <Library.Empty />
            ) : (
              <Library.Grid>
                {filtered.map((w) => (
                  <Library.Card
                    key={w.id}
                    work={w}
                    onOpen={openWork}
                    onRead={readWork}
                    onDelete={setPendingDelete}
                  />
                ))}
              </Library.Grid>
            )}
          </Library>
        )}
      </div>
    </AppShell>
    <ConfirmDialog
      open={pendingDelete !== null}
      title={pendingDelete?.kind === 'book' ? 'Delete book?' : 'Delete article?'}
      message={
        pendingDelete
          ? `This permanently removes "${pendingDelete.title}"${
              pendingDelete.kind === 'book' ? ' and all its chapters and pages' : ''
            }. This cannot be undone.`
          : ''
      }
      confirmLabel={pendingDelete?.kind === 'book' ? 'Delete book' : 'Delete article'}
      busy={deleteWork.isPending}
      onConfirm={() => pendingDelete && deleteWork.mutate(pendingDelete.id)}
      onCancel={() => setPendingDelete(null)}
    />
    </>
  );
}
