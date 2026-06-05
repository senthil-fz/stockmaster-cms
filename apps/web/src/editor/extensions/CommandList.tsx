import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Icon } from '../../components/icons';
import type { BlockCatalogItem } from '../blockCatalog';

export interface CommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface CommandListProps {
  items: BlockCatalogItem[];
  command: (item: BlockCatalogItem) => void;
  query: string;
}

/**
 * The slash-menu popup. MUST be forwardRef + useImperativeHandle exposing onKeyDown,
 * or ReactRenderer.ref is null and arrow/Enter navigation silently breaks.
 */
export const CommandList = forwardRef<CommandListHandle, CommandListProps>((props, ref) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [props.items]);

  const pick = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (props.items.length === 0) return false;
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter') {
        pick(selected);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="z-[60] min-w-[280px] max-h-[340px] overflow-y-auto bg-canvas border border-line-strong rounded-lg shadow-lg p-1.5">
      <div className="text-[11px] font-semibold tracking-[0.05em] uppercase text-faint px-2.5 pt-2 pb-1">
        {props.query ? `Blocks matching “${props.query}”` : 'Basic blocks'}
      </div>
      {props.items.length === 0 ? (
        <div className="p-4 text-center text-faint text-[13px]">No blocks match “{props.query}”</div>
      ) : (
        props.items.map((item, i) => (
          <button
            key={item.key}
            className={
              'flex items-center gap-3 w-full text-left px-2.5 py-2 rounded-[8px] border-none bg-transparent text-fg hover:bg-[color-mix(in_oklch,var(--accent)_12%,white)]' +
              (i === selected ? ' bg-[color-mix(in_oklch,var(--accent)_12%,white)]' : '')
            }
            onMouseEnter={() => setSelected(i)}
            onClick={() => pick(i)}
          >
            <span className="w-[34px] h-[34px] rounded-[7px] flex-none grid place-items-center bg-subtle border border-line text-fg [&_svg]:w-[17px] [&_svg]:h-[17px]">
              <Icon name={item.icon} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{item.title}</span>
              <span className="block text-[12px] text-faint">{item.desc}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
});
CommandList.displayName = 'CommandList';
