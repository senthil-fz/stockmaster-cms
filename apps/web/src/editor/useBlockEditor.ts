import { useEditor, type Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Callout } from './extensions/Callout';
import { Quote } from './extensions/Quote';
import { CaptionedImage } from './extensions/CaptionedImage';
import { Divider } from './extensions/Divider';
import { SlashCommand } from './extensions/SlashCommand';
import { slashSuggestion } from './extensions/suggestion';

export const blockExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    // Replaced by our custom nodes:
    blockquote: false,
    horizontalRule: false,
    codeBlock: false,
    // Link/Underline are bundled in StarterKit v3 — configure (don't re-register).
    link: { openOnClick: false, autolink: true },
  }),
  TableKit,
  Callout,
  Quote,
  CaptionedImage,
  Divider,
  SlashCommand.configure({ suggestion: slashSuggestion }),
];

export interface UseBlockEditorOptions {
  content: JSONContent;
  editable?: boolean;
  onChange?: (doc: JSONContent) => void;
  onSelect?: () => void;
}

export function useBlockEditor({
  content,
  editable = true,
  onChange,
  onSelect,
}: UseBlockEditorOptions): Editor | null {
  return useEditor({
    extensions: blockExtensions,
    content,
    editable,
    editorProps: {
      attributes: { class: 'bp-content' },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
    onSelectionUpdate: () => onSelect?.(),
  });
}
