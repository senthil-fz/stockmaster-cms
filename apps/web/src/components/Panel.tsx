import type { ReactNode } from 'react';
import { Icon, Icons, type IconName } from './icons';
import { IconButton } from './ui/IconButton';

function Panel({ children }: { children: ReactNode }) {
  return (
    <aside className="overflow-y-auto overflow-x-hidden border-l border-line bg-sidebar">
      <div className="p-[18px]">{children}</div>
    </aside>
  );
}

function Head({
  icon,
  title,
  subtitle,
  onClose,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onClose?: () => void;
}) {
  return (
    <div className="mb-[6px] flex items-center gap-2">
      <span className="grid h-[30px] w-[30px] place-items-center rounded-md border border-line bg-subtle text-fg [&>svg]:h-4 [&>svg]:w-4">
        <Icon name={icon} />
      </span>
      <span className="text-sm font-semibold">
        {title}
        {subtitle && (
          <small className="block text-xs font-medium text-faint">{subtitle}</small>
        )}
      </span>
      {onClose && (
        <IconButton className="ml-auto" title="Close" aria-label="Close" onClick={onClose}>
          <Icons.Chevron style={{ transform: 'scaleX(-1)' }} />
        </IconButton>
      )}
    </div>
  );
}

function Section({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="border-b border-line py-4 last:border-b-0">
      {label && <div className="mb-[10px] text-xs font-semibold text-muted">{label}</div>}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1.5 block text-xs font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}

export interface SegOption<T extends string | number> {
  value: T;
  label?: string;
  icon?: IconName;
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-md border border-line bg-subtle p-[3px]">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={
            'grid flex-1 place-items-center rounded-sm border-0 bg-transparent px-2 py-1.5 text-xs font-semibold [&>svg]:h-[15px] [&>svg]:w-[15px] ' +
            (value === o.value ? 'bg-canvas text-fg shadow-xs' : 'text-muted')
          }
          onClick={() => onChange(o.value)}
          title={o.label}
        >
          {o.icon ? <Icon name={o.icon} /> : o.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-[7px] text-[13px]">
      <span className="text-muted">{k}</span>
      <span className="font-semibold text-fg [font-variant-numeric:tabular-nums]">{v}</span>
    </div>
  );
}

export const PanelRoot = Object.assign(Panel, { Head, Section, Field, Seg, Stat });
export { PanelRoot as Panel };
