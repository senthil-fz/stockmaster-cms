import type { User } from '@stockmaster/shared';
import { Sidebar } from './Sidebar';

/**
 * The shared left navigation. Rendered identically on the Library page and the
 * API-keys (settings) page so entering settings never swaps the whole menu —
 * only the `active` highlight and the content area change.
 *
 * Presentational: each page wires the callbacks. The Library handles tab changes
 * in place (local state); other pages pass handlers that navigate back to it.
 */
export function WorkspaceSidebar({
  user,
  count,
  active,
  onTab,
  onOpenApiKeys,
}: {
  user: User;
  /** Total library items (books + articles) shown next to the Library nav. */
  count: number;
  /** Which section is highlighted: a library tab key, or 'api-keys'. */
  active: string;
  onTab: (t: string) => void;
  onOpenApiKeys: () => void;
}) {
  return (
    <Sidebar>
      <Sidebar.Brand />
      <Sidebar.Scroll>
        <Sidebar.SectionLabel>Workspace</Sidebar.SectionLabel>
        <Sidebar.NavItem icon="Library" label="Library" active={active === 'all'} count={count} onClick={() => onTab('all')} />

        <Sidebar.SectionLabel>General</Sidebar.SectionLabel>
        <Sidebar.NavItem icon="Chart" label="Reporting" active={active === 'reporting'} onClick={() => onTab('reporting')} />
        <Sidebar.NavItem icon="Users" label="Authors" active={active === 'authors'} onClick={() => onTab('authors')} />
        <Sidebar.NavItem icon="Settings" label="API keys" active={active === 'api-keys'} onClick={onOpenApiKeys} />
      </Sidebar.Scroll>
      <Sidebar.User user={user} onClick={onOpenApiKeys} />
    </Sidebar>
  );
}
