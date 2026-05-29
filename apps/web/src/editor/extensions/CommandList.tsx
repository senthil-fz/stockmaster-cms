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
    <div className="menu">
      <div className="menu-label">{props.query ? `Blocks matching “${props.query}”` : 'Basic blocks'}</div>
      {props.items.length === 0 ? (
        <div className="menu-empty">No blocks match “{props.query}”</div>
      ) : (
        props.items.map((item, i) => (
          <button
            key={item.key}
            className={'menu-item' + (i === selected ? ' cursor' : '')}
            onMouseEnter={() => setSelected(i)}
            onClick={() => pick(i)}
          >
            <span className="m-ico">
              <Icon name={item.icon} />
            </span>
            <span className="m-txt">
              <span className="m-title">{item.title}</span>
              <span className="m-desc">{item.desc}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
});
CommandList.displayName = 'CommandList';
