import { createContext, useContext, useState, type ReactNode } from 'react';
import { AppearancePanel } from './AppearancePanel';

interface AppShellState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}
const AppShellContext = createContext<AppShellState | null>(null);

export function useAppShell(): AppShellState {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within <AppShell>');
  return ctx;
}

/** The app grid: sidebar column + main column. */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: (state: AppShellState) => ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const state: AppShellState = { collapsed, setCollapsed };
  return (
    <AppShellContext.Provider value={state}>
      <div
        className="grid h-full bg-app overflow-hidden"
        style={{ gridTemplateColumns: `${collapsed ? '0px' : '264px'} 1fr` }}
      >
        {sidebar(state)}
        <div className="flex flex-col min-w-0 bg-canvas overflow-hidden">{children}</div>
        <AppearancePanel />
      </div>
    </AppShellContext.Provider>
  );
}
