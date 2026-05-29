import { useEditorState, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';

export interface ActiveBlock {
  type: string;
  attrs: Record<string, unknown>;
}

/** Reactively report the top-level block at the current selection (drives the right panel). */
export function useActiveBlock(editor: Editor | null): ActiveBlock | null {
  return useEditorState({
    editor,
    selector: ({ editor: e }): ActiveBlock | null => {
      if (!e) return null;
      const sel = e.state.selection;
      const node = sel instanceof NodeSelection ? sel.node : sel.$from.node(1);
      if (!node || node.type.name === 'doc') return null;
      return { type: node.type.name, attrs: { ...node.attrs } };
    },
    equalityFn: (a, b) =>
      a?.type === b?.type && JSON.stringify(a?.attrs) === JSON.stringify(b?.attrs),
  });
}
