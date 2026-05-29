import type { ReactNode } from 'react';
import { Icons } from './icons';
import { useAppShell } from './AppShell';

export type SaveState = 'saved' | 'saving' | 'dirty';

function Topbar({ children }: { children: ReactNode }) {
  const { collapsed, setCollapsed } = useAppShell();
  return (
    <div className="topbar">
      {collapsed && (
        <button className="icon-btn bordered" title="Expand sidebar" onClick={() => setCollapsed(false)}>
          <Icons.PanelLeft />
        </button>
      )}
      {children}
    </div>
  );
}

function Crumbs({ children }: { children: ReactNode }) {
  return <div className="crumbs">{children}</div>;
}

function Crumb({
  children,
  current,
  onClick,
}: {
  children: ReactNode;
  current?: boolean;
  onClick?: () => void;
}) {
  if (current) return <span className="crumb current">{children}</span>;
  return (
    <button className="crumb" onClick={onClick}>
      {children}
    </button>
  );
}

function Sep() {
  return (
    <span className="crumb-sep">
      <Icons.Chevron />
    </span>
  );
}

function Spacer() {
  return <div className="topbar-spacer" />;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="topbar-actions">{children}</div>;
}

function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginRight: 2 }}>
      {state === 'saving' ? (
        <>
          <Icons.Clock className="spin" style={{ width: 14, height: 14 }} /> Saving…
        </>
      ) : state === 'dirty' ? (
        'Unsaved changes'
      ) : (
        <>
          <Icons.Check style={{ width: 14, height: 14 }} /> Saved
        </>
      )}
    </span>
  );
}

export const TopbarRoot = Object.assign(Topbar, {
  Crumbs,
  Crumb,
  Sep,
  Spacer,
  Actions,
  SaveStatus,
});

export { TopbarRoot as Topbar };
