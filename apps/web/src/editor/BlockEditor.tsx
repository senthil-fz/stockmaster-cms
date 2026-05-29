import { memo, useRef } from 'react';
import { EditorContent, type Editor } from '@tiptap/react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Icons } from '../components/icons';
import { BubbleToolbar } from './BubbleToolbar';

// Memoized: the parent (EditorWorkspace) re-renders on every selection/stat change.
// Without memo, those re-renders re-register the DragHandle/BubbleMenu plugins, which
// reconfigures editor state and tears down any open slash menu. `editor` is stable.
// The selection toolbar lives in <BubbleToolbar> (its own useEditorState subscription),
// so its active states stay live despite this memo.
export const BlockEditor = memo(function BlockEditor({ editor }: { editor: Editor }) {
  const hovered = useRef<{ node: PMNode; pos: number } | null>(null);

  const addBelow = () => {
    const cur = hovered.current;
    if (!cur) return;
    const end = cur.pos + cur.node.nodeSize;
    // Insert a blank paragraph after the hovered block and open the slash menu in it.
    editor
      .chain()
      .focus()
      .insertContentAt(end, { type: 'paragraph' })
      .setTextSelection(end + 1)
      .insertContent('/')
      .run();
  };

  return (
    <>
      <DragHandle
        editor={editor}
        onNodeChange={({ node, pos }) => {
          hovered.current = node ? { node, pos } : null;
        }}
      >
        <div className="block-gutter">
          <button
            className="gutter-btn"
            title="Add block below"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addBelow}
          >
            <Icons.Plus />
          </button>
          <button className="gutter-btn handle" title="Drag to reorder">
            <Icons.Grip />
          </button>
        </div>
      </DragHandle>

      <EditorContent editor={editor} className="bp-prose" />

      <BubbleToolbar editor={editor} />
    </>
  );
});
