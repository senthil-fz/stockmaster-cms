import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import type { BlockCatalogItem } from '../blockCatalog';

export interface SlashCommandProps {
  editor: Editor;
  range: Range;
  props: BlockCatalogItem;
}

export const SlashCommand = Extension.create<{ suggestion: Partial<SuggestionOptions> }>({
  name: 'slashCommand',

  addOptions() {
    // The full suggestion config (char/command/items/render) is supplied via
    // .configure({ suggestion: slashSuggestion }) — configure replaces this key wholesale.
    return { suggestion: {} };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
