import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState, type Editor } from '@tiptap/react';
import { Icons } from '../components/icons';

/**
 * Selection toolbar (B/I/U/link). Lives in its own component that subscribes to
 * editor state via useEditorState, so its active states stay live even though its
 * parent <BlockEditor> is memoized (and therefore doesn't re-render on selection).
 */
export function BubbleToolbar({ editor }: { editor: Editor }) {
  const marks = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      underline: e?.isActive('underline') ?? false,
      link: e?.isActive('link') ?? false,
    }),
    equalityFn: (a, b) =>
      a?.bold === b?.bold &&
      a?.italic === b?.italic &&
      a?.underline === b?.underline &&
      a?.link === b?.link,
  }) ?? { bold: false, italic: false, underline: false, link: false };

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 8 }}
      shouldShow={({ editor: e, state, from, to }) => {
        const empty = from === to || state.doc.textBetween(from, to).length === 0;
        if (empty) return false;
        if (e.isActive('captionedImage') || e.isActive('divider')) return false;
        return true;
      }}
    >
      <div className="float-toolbar">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={marks.bold ? 'on' : ''}
          title="Bold"
        >
          <Icons.Bold />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={marks.italic ? 'on' : ''}
          title="Italic"
        >
          <Icons.Italic />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={marks.underline ? 'on' : ''}
          title="Underline"
        >
          <Icons.Underline />
        </button>
        <span className="sep" />
        <button onClick={setLink} className={marks.link ? 'on' : ''} title="Link">
          <Icons.Link />
        </button>
      </div>
    </BubbleMenu>
  );
}
