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
      <div className={'app' + (collapsed ? ' sidebar-collapsed' : '')}>
        {sidebar(state)}
        <div className="main">{children}</div>
        <AppearancePanel />
      </div>
    </AppShellContext.Provider>
  );
}
