import type { ReactNode } from 'react';
import { Icons } from './icons';
import { IconButton } from './ui/IconButton';
import { useAppShell } from './AppShell';

export type SaveState = 'saved' | 'saving' | 'dirty';

function Topbar({ children }: { children: ReactNode }) {
  const { collapsed, setCollapsed } = useAppShell();
  return (
    <div className="flex items-center gap-3 px-6 py-[14px] border-b border-line bg-canvas flex-none">
      {collapsed && (
        <IconButton bordered title="Expand sidebar" onClick={() => setCollapsed(false)}>
          <Icons.PanelLeft />
        </IconButton>
      )}
      {children}
    </div>
  );
}

function Crumbs({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1 min-w-0">{children}</div>;
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
  if (current)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[7px] text-[13px] font-semibold text-fg bg-subtle whitespace-nowrap">
        {children}
      </span>
    );
  return (
    <button
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[7px] text-[13px] font-medium text-muted bg-transparent border-none whitespace-nowrap hover:bg-hover hover:text-fg"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Sep() {
  return (
    <span className="text-faint grid place-items-center [&_svg]:w-4 [&_svg]:h-4">
      <Icons.Chevron />
    </span>
  );
}

function Spacer() {
  return <div className="flex-1" />;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2.5">{children}</div>;
}

function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span className="text-muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginRight: 2 }}>
      {state === 'saving' ? (
        <>
          <Icons.Clock className="animate-spin" style={{ width: 14, height: 14 }} /> Saving…
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
