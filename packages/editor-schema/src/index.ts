import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Callout } from './Callout';
import { Quote } from './Quote';
import { CaptionedImage } from './CaptionedImage';
import { Divider } from './Divider';

export { Callout } from './Callout';
export { Quote } from './Quote';
export { CaptionedImage } from './CaptionedImage';
export { Divider } from './Divider';
export type { CalloutTone } from './Callout';
export type { ImageAlign } from './CaptionedImage';
export type { DividerVariant } from './Divider';

// The exact StarterKit configuration for the StockMaster editor schema. Exported as a
// standalone const so apps/web can reuse the identical config (single source of truth).
// `satisfies` keeps the literal types (`heading.levels`, the `false` disables) that
// StarterKit.configure() requires — widening to number[]/boolean would be rejected.
export const starterKitOptions = {
  heading: { levels: [1, 2, 3] },
  // Replaced by our custom nodes:
  blockquote: false,
  horizontalRule: false,
  codeBlock: false,
  // Link/Underline are bundled in StarterKit v3 — configure (don't re-register).
  link: { openOnClick: false, autolink: true },
} satisfies Parameters<typeof StarterKit.configure>[0];

// The canonical Tiptap extension set that defines the editor schema. SlashCommand is
// intentionally excluded — it adds editor behavior, not schema. This is the single
// source of truth consumed by apps/web (re-wrapping React NodeViews) and apps/mcp
// (`getSchema(schemaExtensions)` for headless validation).
export const schemaExtensions = [
  StarterKit.configure(starterKitOptions),
  TableKit,
  Callout,
  Quote,
  CaptionedImage,
  Divider,
];
