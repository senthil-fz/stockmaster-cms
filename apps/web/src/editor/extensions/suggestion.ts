import { ReactRenderer, posToDOMRect } from '@tiptap/react';
import { computePosition, flip, shift, offset } from '@floating-ui/dom';
import type { Editor } from '@tiptap/core';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { filterCatalog, type BlockCatalogItem } from '../blockCatalog';
import { CommandList, type CommandListHandle } from './CommandList';

function reposition(editor: Editor, element: HTMLElement): void {
  const virtual = {
    getBoundingClientRect: () =>
      posToDOMRect(editor.view, editor.state.selection.from, editor.state.selection.to),
  };
  void computePosition(virtual, element, {
    placement: 'bottom-start',
    strategy: 'absolute',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  }).then(({ x, y, strategy }) => {
    element.style.width = 'max-content';
    element.style.position = strategy;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  });
}

export const slashSuggestion: Omit<SuggestionOptions<BlockCatalogItem>, 'editor'> = {
  char: '/',
  startOfLine: false,
  command: ({ editor, range, props }) => props.command(editor, range),
  items: ({ query }) => filterCatalog(query),

  render: () => {
    let component: ReactRenderer<CommandListHandle> | null = null;

    return {
      onStart: (props) => {
        component = new ReactRenderer(CommandList, {
          props: { items: props.items, command: props.command, query: props.query },
          editor: props.editor,
        });
        if (!props.clientRect) return;
        const el = component.element as HTMLElement;
        el.style.position = 'absolute';
        document.body.appendChild(el);
        reposition(props.editor, el);
      },
      onUpdate: (props) => {
        component?.updateProps({ items: props.items, command: props.command, query: props.query });
        if (component && props.clientRect) reposition(props.editor, component.element as HTMLElement);
      },
      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          component?.destroy();
          component?.element.remove();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        component?.destroy();
        component?.element.remove();
        component = null;
      },
    };
  },
};
