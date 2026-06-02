/**
 * smoke.ts — a self-contained gate for `validate_content` (Step 18).
 *
 * NO MCP transport, NO API client, NO network: it imports `validateContent` directly
 * and asserts the four canonical cases, printing PASS/FAIL per case. Exits 1 on any
 * failure so a CI/human gate can rely on the exit code.
 *
 * Run it directly (the human runs this as the gate):
 *   pnpm --filter @blockpress/mcp exec ts-node src/smoke.ts
 *   # or, after build:  node dist/smoke.js
 *
 * NOTE: this is a standalone script, NOT the stdio server — logging to stdout here is
 * correct (the stdout-is-the-transport / stderr-only rule applies only to server.ts).
 *
 * Cases:
 *   1. A valid doc (paragraph + callout + quote)            -> ok:true
 *   2. { type:'doc', content:[{ type:'blockquote' }] }      -> an 'unknown-node' error
 *      (blockquote is DISABLED in StarterKit — replaced by the custom `quote` node)
 *   3. A callout with tone:'danger'                          -> an 'invalid-attr-value' error
 *      (a present-but-wrong enum the round-trip can't see; only the Zod overlay catches it)
 *   4. A doc with a stray top-level text node                -> rejected (see caveat below)
 *      CAVEAT: Step 18 frames this as a 'dropped' error, but ProseMirror's `nodeFromJSON`
 *      is a FAITHFUL reconstructor (it does not drop/fill/correct). The stray text node is
 *      kept, so the round-trip diff sees no drop; instead `node.check()` flags it as a
 *      'content-violation' (doc content is `block+`, text is inline). We therefore accept
 *      EITHER 'dropped' OR 'content-violation' — both prove the stray text is rejected.
 */
import { validateContent, type ValidationResult, type ValidationErrorKind } from './validate-content';

let failures = 0;

/** Assert and report a single named case. */
function assertCase(name: string, predicate: boolean, detail: () => string): void {
  if (predicate) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name} — ${detail()}`);
  }
}

const hasKind = (r: ValidationResult, kind: ValidationErrorKind): boolean =>
  r.errors.some((e) => e.kind === kind);

// ── Case 1: a valid doc (paragraph + callout + quote) -> ok:true ───────────────
const validDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'A plain paragraph.' }] },
    {
      type: 'callout',
      attrs: { tone: 'info', icon: 'Callout' },
      content: [{ type: 'text', text: 'An informational callout.' }],
    },
    {
      type: 'quote',
      attrs: { cite: 'Benjamin Graham' },
      content: [{ type: 'text', text: 'The investor’s chief problem is himself.' }],
    },
  ],
};
{
  const r = validateContent(validDoc);
  assertCase(
    'valid doc (paragraph+callout+quote) -> ok:true',
    r.ok === true && r.errors.length === 0,
    () => `expected ok:true with no errors, got ${JSON.stringify(r)}`,
  );
}

// ── Case 2: a stray `blockquote` node -> unknown-node ─────────────────────────
{
  const r = validateContent({ type: 'doc', content: [{ type: 'blockquote' }] });
  assertCase(
    "{ type:'doc', content:[{ type:'blockquote' }] } -> unknown-node",
    r.ok === false && hasKind(r, 'unknown-node'),
    () => `expected an 'unknown-node' error, got ${JSON.stringify(r)}`,
  );
}

// ── Case 3: a callout with an out-of-enum tone -> invalid-attr-value ───────────
{
  const r = validateContent({
    type: 'doc',
    content: [
      {
        type: 'callout',
        attrs: { tone: 'danger', icon: 'Callout' },
        content: [{ type: 'text', text: 'Out-of-enum tone.' }],
      },
    ],
  });
  assertCase(
    "callout tone:'danger' -> invalid-attr-value",
    r.ok === false && hasKind(r, 'invalid-attr-value'),
    () => `expected an 'invalid-attr-value' error, got ${JSON.stringify(r)}`,
  );
}

// ── Case 4: a stray top-level text node -> rejected (dropped OR content-violation) ─
{
  const r = validateContent({ type: 'doc', content: [{ type: 'text', text: 'stray top-level text' }] });
  assertCase(
    "stray top-level text node -> dropped/content-violation",
    r.ok === false && (hasKind(r, 'dropped') || hasKind(r, 'content-violation')),
    () => `expected a 'dropped' or 'content-violation' error, got ${JSON.stringify(r)}`,
  );
}

// ── Tally ─────────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n${failures} case(s) FAILED`);
  process.exit(1);
}
console.log('\nAll cases PASSED');
