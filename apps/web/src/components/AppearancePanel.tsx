import { useState } from 'react';
import { ACCENT_OPTIONS, useTheme } from '../lib/theme';
import { Icons } from './icons';
import { Panel } from './Panel';

/** Floating Appearance control (the design's "Tweaks"): accent / light-dark / font / width. */
export function AppearancePanel() {
  const t = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-[18px] right-[18px] z-[80] flex flex-col items-end gap-[10px]">
      {open && (
        <div className="w-[248px] rounded-lg border border-line-strong bg-canvas p-[14px] shadow-lg">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-faint">
            Appearance
          </div>

          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold text-muted">Accent</label>
            <div className="flex gap-2">
              {ACCENT_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={
                    'h-7 w-7 cursor-pointer rounded-md border-2 ' +
                    (t.accent === c
                      ? 'border-canvas shadow-[0_0_0_2px_var(--text),var(--sh-xs)]'
                      : 'border-transparent shadow-[0_0_0_1px_var(--border),var(--sh-xs)]')
                  }
                  style={{ background: c }}
                  title={c}
                  onClick={() => t.set('accent', c)}
                />
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold text-muted">Mode</label>
            <Panel.Seg
              value={t.theme}
              onChange={(v) => t.set('theme', v)}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>

          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold text-muted">Body font</label>
            <Panel.Seg
              value={t.contentFont}
              onChange={(v) => t.set('contentFont', v)}
              options={[
                { value: 'sans', label: 'Sans' },
                { value: 'serif', label: 'Serif' },
              ]}
            />
          </div>

          <div className="mb-0">
            <label className="mb-1.5 block text-xs font-semibold text-muted">Editor width</label>
            <Panel.Seg
              value={t.editorWidth}
              onChange={(v) => t.set('editorWidth', v)}
              options={[
                { value: 'narrow', label: 'Narrow' },
                { value: 'comfortable', label: 'Cozy' },
                { value: 'wide', label: 'Wide' },
              ]}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        className={
          'grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-canvas shadow-md [&>svg]:h-[18px] [&>svg]:w-[18px] ' +
          (open ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg')
        }
        title="Appearance"
        onClick={() => setOpen((o) => !o)}
      >
        <Icons.Sparkle />
      </button>
    </div>
  );
}
