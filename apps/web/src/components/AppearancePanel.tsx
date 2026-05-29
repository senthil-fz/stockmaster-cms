import { useState } from 'react';
import { ACCENT_OPTIONS, useTheme } from '../lib/theme';
import { Icons } from './icons';
import { Panel } from './Panel';

/** Floating Appearance control (the design's "Tweaks"): accent / light-dark / font / width. */
export function AppearancePanel() {
  const t = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="appearance">
      {open && (
        <div className="appearance-panel">
          <div className="ap-head">Appearance</div>

          <div className="field">
            <label>Accent</label>
            <div className="ap-swatches">
              {ACCENT_OPTIONS.map((c) => (
                <button
                  key={c}
                  className={'ap-swatch' + (t.accent === c ? ' on' : '')}
                  style={{ background: c }}
                  title={c}
                  onClick={() => t.set('accent', c)}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <label>Mode</label>
            <Panel.Seg
              value={t.theme}
              onChange={(v) => t.set('theme', v)}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>

          <div className="field">
            <label>Body font</label>
            <Panel.Seg
              value={t.contentFont}
              onChange={(v) => t.set('contentFont', v)}
              options={[
                { value: 'sans', label: 'Sans' },
                { value: 'serif', label: 'Serif' },
              ]}
            />
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Editor width</label>
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
        className={'appearance-btn' + (open ? ' on' : '')}
        title="Appearance"
        onClick={() => setOpen((o) => !o)}
      >
        <Icons.Sparkle />
      </button>
    </div>
  );
}
