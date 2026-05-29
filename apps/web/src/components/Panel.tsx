import type { ReactNode } from 'react';
import { Icon, Icons, type IconName } from './icons';

function Panel({ children }: { children: ReactNode }) {
  return (
    <aside className="panel">
      <div className="panel-inner">{children}</div>
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
    <div className="panel-head">
      <span className="ico">
        <Icon name={icon} />
      </span>
      <span className="t">
        {title}
        {subtitle && <small>{subtitle}</small>}
      </span>
      {onClose && (
        <button className="icon-btn" style={{ marginLeft: 'auto' }} title="Close" onClick={onClose}>
          <Icons.Chevron style={{ transform: 'scaleX(-1)' }} />
        </button>
      )}
    </div>
  );
}

function Section({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="panel-section">
      {label && <div className="ps-label">{label}</div>}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
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
    <div className="seg">
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={value === o.value ? 'on' : ''}
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
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export const PanelRoot = Object.assign(Panel, { Head, Section, Field, Seg, Stat });
export { PanelRoot as Panel };
