/**
 * `validate_content` core (Step 18).
 *
 * Validates a Tiptap/ProseMirror doc against the SAME canonical schema the web editor
 * uses (`@blockpress/editor-schema` → `getSchema(schemaExtensions)`), entirely HEADLESS:
 * `getSchema` + `nodeFromJSON` + `check` + `toJSON` need no DOM/jsdom (parseHTML/renderHTML
 * only run on HTML paste/copy, never on JSON round-trip).
 *
 * Detection layers:
 *  1. nodeFromJSON   — unknown node/mark *types* throw (primary detector).
 *  2. node.check()   — content-model violations (e.g. a node where its content spec forbids it).
 *  3. round-trip diff — compares input vs `nodeFromJSON(doc).toJSON()` by walking node/mark
 *                       `type` presence/order, NOT deep-equal (defaults fill on round-trip,
 *                       so deep-equal would false-positive). Catches silently-dropped content.
 *  4. Zod enum overlay — the round-trip can't catch an invalid-but-typed *attr value*
 *                       (defaults don't replace a present-but-wrong enum), so we walk the
 *                       tree and check callout.tone / divider.variant / captionedImage.align.
 *
 * Residual (documented, accepted for v1): `callout.icon` name validity is NOT checked — the
 * icon registry lives in apps/web and is out of this React-free package's view.
 *
 * Never throws — all failure modes are returned as structured errors.
 */
import { getSchema } from '@tiptap/core';
import { schemaExtensions } from '@blockpress/editor-schema';
import type { TiptapDoc, TiptapNode } from '@blockpress/shared';
import { z } from 'zod';

export type ValidationErrorKind =
  | 'unknown-node'
  | 'unknown-mark'
  | 'content-violation'
  | 'dropped'
  | 'invalid-attr-value';

export interface ValidationError {
  path: string;
  kind: ValidationErrorKind;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

// Built once — `getSchema` is headless and deterministic for a fixed extension set.
const schema = getSchema(schemaExtensions);

// Zod overlay for enum attrs the round-trip diff is blind to (present-but-wrong values).
const enumAttrChecks: Record<string, Record<string, z.ZodTypeAny>> = {
  callout: { tone: z.enum(['info', 'neutral', 'warn', 'success']) },
  divider: { variant: z.enum(['line', 'dots']) },
  captionedImage: { align: z.enum(['full', 'left']) },
};

/** Recursively collect every node `type` and mark `type` with its path, in document order. */
function collectTypes(node: TiptapNode | TiptapDoc, path: string, out: string[]): void {
  out.push(`node:${node.type}@${path}`);
  const n = node as TiptapNode;
  if (Array.isArray(n.marks)) {
    for (const mark of n.marks) out.push(`mark:${mark?.type}@${path}`);
  }
  if (Array.isArray(node.content)) {
    node.content.forEach((child, i) => collectTypes(child, `${path}/${i}`, out));
  }
}

/** Walk the input tree applying the Zod enum overlay to each node's attrs. */
function checkEnumAttrs(node: TiptapNode | TiptapDoc, path: string, out: ValidationError[]): void {
  const checks = enumAttrChecks[node.type];
  const attrs = (node as TiptapNode).attrs;
  if (checks && attrs && typeof attrs === 'object') {
    for (const [attr, validator] of Object.entries(checks)) {
      if (attr in attrs) {
        const parsed = validator.safeParse(attrs[attr]);
        if (!parsed.success) {
          out.push({
            path: `${path}.${attr}`,
            kind: 'invalid-attr-value',
            detail: `${node.type}.${attr}=${JSON.stringify(attrs[attr])} is not a valid value`,
          });
        }
      }
    }
  }
  if (Array.isArray(node.content)) {
    node.content.forEach((child, i) => checkEnumAttrs(child, `${path}/${i}`, out));
  }
}

export function validateContent(doc: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // The doc must at least be a {type:'doc'} object before ProseMirror will touch it.
  if (!doc || typeof doc !== 'object' || (doc as { type?: unknown }).type !== 'doc') {
    return {
      ok: false,
      errors: [{ path: '', kind: 'content-violation', detail: "content must be a ProseMirror doc ({ type: 'doc', content: [...] })" }],
    };
  }
  const input = doc as TiptapDoc;

  // (1) nodeFromJSON — throws on unknown node/mark types. Classify the message.
  let node;
  try {
    node = schema.nodeFromJSON(input as unknown as Parameters<typeof schema.nodeFromJSON>[0]);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const kind: ValidationErrorKind = /mark type/i.test(detail) ? 'unknown-mark' : 'unknown-node';
    errors.push({ path: '', kind, detail });
    // Can't go further without a node — but still run the enum overlay on the raw input.
    checkEnumAttrs(input, '', errors);
    return { ok: errors.length === 0, errors };
  }

  // (2) check() — content-model violations.
  try {
    node.check();
  } catch (err) {
    errors.push({ path: '', kind: 'content-violation', detail: err instanceof Error ? err.message : String(err) });
  }

  // (3) Round-trip drop-diff: compare node/mark `type` presence+order, not deep-equal.
  const before: string[] = [];
  const after: string[] = [];
  collectTypes(input, '', before);
  collectTypes(node.toJSON() as TiptapDoc, '', after);
  const afterCounts = new Map<string, number>();
  for (const t of after) afterCounts.set(t, (afterCounts.get(t) ?? 0) + 1);
  for (const t of before) {
    const remaining = afterCounts.get(t) ?? 0;
    if (remaining <= 0) {
      const [kindPart, rest] = t.split(':');
      const [typeName, atPath] = (rest ?? '').split('@');
      errors.push({
        path: atPath ?? '',
        kind: 'dropped',
        detail: `${kindPart} "${typeName}" was dropped on round-trip (not in the schema's content model here)`,
      });
    } else {
      afterCounts.set(t, remaining - 1);
    }
  }

  // (4) Zod enum overlay — invalid-but-typed attr values the round-trip can't see.
  checkEnumAttrs(input, '', errors);

  return { ok: errors.length === 0, errors };
}
