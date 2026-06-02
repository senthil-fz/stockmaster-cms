/**
 * Registers the draft-only MCP tool surface (10 tools).
 *
 * Every tool maps to an existing Blockpress REST endpoint via `apiClient`, which injects
 * the draft-only `Authorization: ApiKey <key>` header. The server is intentionally missing
 * any publish / status / delete affordance: there is NO publish tool, NO delete tool, and
 * the update tools deliberately omit the `status` field — so the agent can never form a
 * request to flip content to `published` or remove it. (If it somehow did via a raw call,
 * the API returns 403 and that message is surfaced verbatim — the backstop, not the UX.)
 *
 * `inputSchema` is a raw ZodRawShape (a plain object of zod fields) — the SDK wraps it in
 * z.object() internally. `.describe()` strings reach the agent; server-side zod limits are
 * mirrored here as guidance (the API remains the authority that enforces them).
 *
 * Handlers NEVER throw: success → { content:[{type:'text', text: JSON.stringify(result)}] };
 * failure → { content:[{type:'text', text:'Error: <verbatim message>'}], isError:true }.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiClient, ApiClientError } from './api-client';
import { validateContent } from './validate-content';

// A SHALLOW, non-recursive stand-in for the Tiptap doc at the tool-input boundary.
// The real schema (packages/shared tiptapDocSchema) is a recursive z.lazy; feeding it
// into the SDK's `inputSchema` generic makes tsc's type inference blow up (heap OOM).
// Deep validation still happens server-side (the API re-validates with the full schema)
// and via the validate_content tool, so a shallow top-level shape here is sufficient.
const tiptapDocInput = z.object({
  type: z.literal('doc'),
  content: z.array(z.unknown()).optional(),
});

/** Shape of a tool handler's return value (a minimal CallToolResult). */
type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

const ok = (result: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(result) }],
});

const fail = (message: string): ToolResult => ({
  content: [{ type: 'text', text: `Error: ${message}` }],
  isError: true,
});

/** Run an API call, converting any thrown error into an isError tool result. */
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof ApiClientError) return fail(err.message);
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** URL-encode a path segment so ids with odd chars can't break out of the path. */
const seg = (id: string): string => encodeURIComponent(id);

// ─── Reused field descriptors (mirror server zod limits) ──────────────────────
const titleField = z.string().min(1).max(200).optional().describe('Title, 1-200 chars. Optional — a default is generated if omitted.');
const httpUrlNullable = z
  .string()
  .nullable()
  .optional()
  .describe('Absolute http(s) URL, <=2000 chars. Pass null to clear.');

// ─── The corrected page-content vocabulary, advertised on update_page ─────────
// Single source: matches @blockpress/editor-schema (StarterKit w/ blockquote+codeBlock
// DISABLED + the 4 custom nodes + table family). blockquote/codeBlock DO NOT EXIST.
const UPDATE_PAGE_DESCRIPTION = [
  'Update a draft page (title / content / order). `content` is a Tiptap (ProseMirror) JSON document.',
  '',
  'There is intentionally NO publish, status, or delete tool — this server can only create and edit DRAFTS.',
  '',
  'Content model (the ONLY supported node/mark types — anything else is silently dropped on save; run validate_content first):',
  '  Block nodes (children of doc):',
  '    - paragraph: { type:"paragraph", content:[ ...text ] }',
  '    - heading:   { type:"heading", attrs:{ level: 1|2|3 }, content:[ ...text ] }',
  '    - bulletList / orderedList: { type:"bulletList", content:[ listItem... ] } (orderedList likewise)',
  '    - listItem:  { type:"listItem", content:[ paragraph... ] }  (lives only inside a list)',
  '    - quote:     { type:"quote", attrs:{ cite:"..." }, content:[ ...text ] }  (pull-quote; cite optional)',
  '    - callout:   { type:"callout", attrs:{ tone:"info"|"neutral"|"warn"|"success", icon:"Callout" }, content:[ ...text ] }',
  '    - captionedImage: { type:"captionedImage", attrs:{ src, caption, align:"full"|"left", label } }  (ATOM — no children)',
  '    - divider:   { type:"divider", attrs:{ variant:"line"|"dots" } }  (ATOM — no children)',
  '    - table / tableRow / tableHeader / tableCell  (standard ProseMirror table family)',
  '  Marks (attach to TEXT nodes via a `marks` array — they are NOT node types):',
  '    - bold, italic, code, link (link carries attrs:{ href })',
  '  A text node looks like: { type:"text", text:"hello", marks:[{ type:"bold" }] }',
  '',
  'IMPORTANT:',
  '  - blockquote and codeBlock DO NOT EXIST — use `quote` and `paragraph`/`code` mark instead.',
  '  - captionedImage.src MUST be an absolute external http(s) URL. There is NO upload tool; you cannot upload files.',
  '  - Read-modify-write: call get_page first to get the canonical persisted doc, then edit and send the whole doc back.',
  '',
  'Worked example (a heading, a paragraph with a bold word and a link, a callout, and a quote):',
  JSON.stringify(
    {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Risk premia' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Markets reward ' },
            { type: 'text', text: 'patience', marks: [{ type: 'bold' }] },
            { type: 'text', text: '. See ' },
            { type: 'text', text: 'the source', marks: [{ type: 'link', attrs: { href: 'https://example.com/paper' } }] },
            { type: 'text', text: '.' },
          ],
        },
        {
          type: 'callout',
          attrs: { tone: 'warn', icon: 'Callout' },
          content: [{ type: 'text', text: 'Past performance does not guarantee future results.' }],
        },
        {
          type: 'quote',
          attrs: { cite: 'Benjamin Graham' },
          content: [{ type: 'text', text: 'The investor’s chief problem is himself.' }],
        },
      ],
    },
    null,
    0,
  ),
].join('\n');

export function registerTools(server: McpServer): void {
  // ── list_works ──────────────────────────────────────────────────────────────
  server.registerTool(
    'list_works',
    {
      title: 'List works',
      description:
        'List books and articles (summaries: id, title, status, counts). Optional filters by kind and status. ' +
        'The status filter is READ-ONLY filtering — it does NOT publish or change anything.',
      inputSchema: {
        kind: z.enum(['book', 'article']).optional().describe('Filter by work kind.'),
        status: z.enum(['draft', 'published']).optional().describe('Filter by status (read-only filter; not a publish action).'),
      },
    },
    async ({ kind, status }) => {
      const params = new URLSearchParams();
      if (kind) params.set('kind', kind);
      if (status) params.set('status', status);
      const q = params.toString();
      return run(() => apiClient.get(`/works${q ? `?${q}` : ''}`));
    },
  );

  // ── get_work ────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_work',
    {
      title: 'Get work',
      description: 'Fetch one work by id with its full chapter/page tree (chapter ids + page ids live here — use these for add_page/update_page).',
      inputSchema: {
        id: z.string().describe('Work id.'),
      },
    },
    async ({ id }) => run(() => apiClient.get(`/works/${seg(id)}`)),
  );

  // ── create_work ─────────────────────────────────────────────────────────────
  server.registerTool(
    'create_work',
    {
      title: 'Create draft work',
      description:
        'Create a new DRAFT book or article. It CANNOT be published through this server. ' +
        'Returns a summary WITHOUT the chapter/page tree — call get_work next to get the chapter ids needed for add_page.',
      inputSchema: {
        kind: z.enum(['book', 'article']).describe('Work kind: "book" or "article".'),
        title: titleField,
      },
    },
    async ({ kind, title }) => run(() => apiClient.post('/works', { kind, ...(title !== undefined ? { title } : {}) })),
  );

  // ── update_work ─────────────────────────────────────────────────────────────
  // NOTE: `status` is deliberately OMITTED — there is no publish affordance.
  server.registerTool(
    'update_work',
    {
      title: 'Update work metadata',
      description: 'Update a draft work’s metadata. Cannot publish (no status field) and cannot edit an already-published work (the API returns 403).',
      inputSchema: {
        id: z.string().describe('Work id.'),
        title: z.string().min(1).max(200).optional().describe('Title, 1-200 chars.'),
        subtitle: z.string().max(300).optional().describe('Subtitle, <=300 chars.'),
        author: z.string().max(120).optional().describe('Author, <=120 chars.'),
        year: z.string().max(12).optional().describe('Publication year, <=12 chars.'),
        tags: z.array(z.string().max(40)).max(20).optional().describe('Up to 20 tags, each <=40 chars.'),
        coverTone: z.string().max(40).optional().describe('Cover tone/theme key, <=40 chars.'),
        coverUrl: httpUrlNullable.describe('Cover image: absolute http(s) URL, <=2000 chars. null clears it.'),
        buyLink: httpUrlNullable.describe('External purchase URL (books only): absolute http(s) URL, <=2000 chars. null clears it.'),
      },
    },
    async ({ id, ...patch }) => run(() => apiClient.patch(`/works/${seg(id)}`, patch)),
  );

  // ── add_chapter ─────────────────────────────────────────────────────────────
  server.registerTool(
    'add_chapter',
    {
      title: 'Add chapter',
      description: 'Add a chapter to a work. Returns the chapter (with its id) — use that id with add_page.',
      inputSchema: {
        workId: z.string().describe('Id of the work to add the chapter to.'),
        title: titleField,
      },
    },
    async ({ workId, title }) =>
      run(() => apiClient.post(`/works/${seg(workId)}/chapters`, title !== undefined ? { title } : {})),
  );

  // ── update_chapter ──────────────────────────────────────────────────────────
  server.registerTool(
    'update_chapter',
    {
      title: 'Update chapter',
      description: 'Update a chapter’s title and/or order within its work.',
      inputSchema: {
        id: z.string().describe('Chapter id.'),
        title: z.string().min(1).max(200).optional().describe('New title, 1-200 chars.'),
        order: z.number().int().min(0).optional().describe('New 0-based position among sibling chapters.'),
      },
    },
    async ({ id, ...patch }) => run(() => apiClient.patch(`/chapters/${seg(id)}`, patch)),
  );

  // ── get_page ────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_page',
    {
      title: 'Get page',
      description:
        'Fetch one page by id, INCLUDING its stored Tiptap content. Use this for read-modify-write: read the canonical ' +
        'persisted doc, edit it, then send the whole doc back via update_page.',
      inputSchema: {
        id: z.string().describe('Page id.'),
      },
    },
    async ({ id }) => run(() => apiClient.get(`/pages/${seg(id)}`)),
  );

  // ── add_page ────────────────────────────────────────────────────────────────
  server.registerTool(
    'add_page',
    {
      title: 'Add page',
      description: 'Add a page to a chapter. Returns the new page (with id + a blank starter doc). Edit the body via update_page.',
      inputSchema: {
        chapterId: z.string().describe('Id of the chapter to add the page to.'),
        title: z.string().max(200).optional().describe('Page title, <=200 chars. Optional.'),
      },
    },
    async ({ chapterId, title }) =>
      run(() => apiClient.post(`/chapters/${seg(chapterId)}/pages`, title !== undefined ? { title } : {})),
  );

  // ── update_page ─────────────────────────────────────────────────────────────
  // NOTE: `status` is deliberately OMITTED — there is no publish affordance.
  server.registerTool(
    'update_page',
    {
      title: 'Update page',
      description: UPDATE_PAGE_DESCRIPTION,
      inputSchema: {
        id: z.string().describe('Page id.'),
        title: z.string().max(200).optional().describe('Page title, <=200 chars.'),
        content: tiptapDocInput.optional().describe('The full Tiptap doc ({ type:"doc", content:[...] }). See the content model above. Run validate_content first.'),
        order: z.number().int().min(0).optional().describe('New 0-based position among sibling pages.'),
      },
    },
    async ({ id, ...patch }) => run(() => apiClient.patch(`/pages/${seg(id)}`, patch)),
  );

  // ── validate_content (local — no API call) ───────────────────────────────────
  server.registerTool(
    'validate_content',
    {
      title: 'Validate page content',
      description:
        'Locally validate a Tiptap doc against the editor’s real ProseMirror schema BEFORE saving via update_page. ' +
        'Reports unknown node/mark types, content-model violations, content that would be silently DROPPED on save, and ' +
        'out-of-range enum attrs (callout.tone, divider.variant, captionedImage.align). Returns { ok, errors:[{path,kind,detail}] }. ' +
        'Residual: callout.icon name validity is NOT checked (an unknown icon persists and the web reader falls back gracefully).',
      inputSchema: {
        content: tiptapDocInput.describe('The Tiptap doc to validate ({ type:"doc", content:[...] }).'),
      },
    },
    async ({ content }) => {
      // validateContent never throws; still guard to honor the never-throw contract.
      try {
        return ok(validateContent(content));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
