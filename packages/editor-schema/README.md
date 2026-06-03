# @stockmaster/editor-schema

The **single source of truth** for the StockMaster editor's Tiptap/ProseMirror schema.

This package holds the React-free node specs (`Callout`, `Quote`, `CaptionedImage`,
`Divider`), their attribute string-union types (`CalloutTone`, `DividerVariant`,
`ImageAlign`), the exact `StarterKit` options (`starterKitOptions`), and the canonical
extension set `schemaExtensions`.

Because it has no React (and no DOM) dependency, both consumers share one schema instead
of hand-copying a parallel one:

- **`apps/web`** imports each spec and re-wraps it with a React `NodeView`
  (`Base.extend({ addNodeView })`), and reuses `starterKitOptions` in `useBlockEditor`.
- **`apps/mcp`** calls `getSchema(schemaExtensions)` headlessly (no DOM/jsdom) to validate
  agent-authored content.

The node specs here keep `name`/`group`/`content`/`atom`/`draggable`/`selectable`/
`defining`/`addAttributes`/`parseHTML`/`renderHTML` byte-identical to the original web
extensions, so JSON serialization is unchanged. Only the React-specific pieces are dropped:
the `@tiptap/react` import, the `*View` component, and `addNodeView`.

## What stays in `apps/web` (not here)

- The React `NodeView` components.
- The icon registry: `IconName` and `CALLOUT_ICONS` (lives in `apps/web/components/icons`).
  `callout.icon` is a plain `string` here, defaulting to `'Callout'`.
- `uploadsApi` and the upload-validation imports used by the captioned-image view.

## Anti-drift rule

Any new node, attribute, or StarterKit option is added **once, here** — never duplicated
in `apps/web`'s `useBlockEditor` or in `apps/mcp`.

## Exports

- `Callout`, `Quote`, `CaptionedImage`, `Divider` — node specs (`Node.create(...)`).
- `CalloutTone`, `DividerVariant`, `ImageAlign` — attribute string unions.
- `starterKitOptions` — the exact `StarterKit.configure()` argument.
- `schemaExtensions` — the canonical extension array (StarterKit + TableKit + the 4 custom
  nodes). `SlashCommand` is intentionally excluded; it adds no schema.
