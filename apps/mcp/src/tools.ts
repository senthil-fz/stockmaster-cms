/**
 * Registers the draft-only MCP tool surface (14 tools): books (+ chapters/pages) and articles.
 *
 * Every tool maps to an existing StockMaster REST endpoint via the per-session `api` client,
 * which forwards the client's draft-only key as `Authorization: ApiKey <key>`. The server is
 * intentionally missing
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
import { ApiClientError, type ApiClient } from './api-client';
import { validateContent } from './validate-content';

// Base path of the editor REST API: /v1 (URI versioning) + /admin (editor namespace).
// Prepended to every endpoint below so the version is an explicit part of each URL.
const EDITOR_API = '/v1/admin';

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

// ─── The shared content vocabulary, advertised on update_page AND update_article ─────────
// Single source: matches @stockmaster/editor-schema (StarterKit w/ blockquote+codeBlock
// DISABLED + the 4 custom nodes + table family). blockquote/codeBlock DO NOT EXIST.
// Book pages and article `content` use the EXACT SAME Tiptap vocabulary, so both tools
// reference this constant rather than duplicating a thinner description.
const CONTENT_VOCABULARY = [
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

// Description for update_page: the page intro + shared vocabulary + page read-modify-write hint.
const UPDATE_PAGE_DESCRIPTION = [
  'Update a draft page (title / content / order). `content` is a Tiptap (ProseMirror) JSON document.',
  '',
  'There is intentionally NO publish, status, or delete tool — this server can only create and edit DRAFTS.',
  '',
  CONTENT_VOCABULARY,
  '',
  'Read-modify-write: call get_page first to get the canonical persisted doc, then edit and send the whole doc back.',
].join('\n');

// Description for update_article: the article intro + the SAME shared vocabulary + article read-modify-write hint.
const UPDATE_ARTICLE_DESCRIPTION = [
  "Update a draft article's metadata and/or single-page `content`. An article is one Tiptap (ProseMirror) JSON document —",
  'it uses the EXACT SAME content vocabulary as book pages (update_page); there are no chapters or pages.',
  '',
  'There is intentionally NO publish, status, or delete tool — this server can only create and edit DRAFTS.',
  '',
  CONTENT_VOCABULARY,
  '',
  'Read-modify-write: call get_article first to get the canonical persisted doc, then edit and send the whole doc back.',
].join('\n');

export function registerTools(server: McpServer, api: ApiClient): void {
  // ── list_books ──────────────────────────────────────────────────────────────
  server.registerTool(
    'list_books',
    {
      title: 'List books',
      description:
        'List books (summaries: id, title, status, page/word counts). Optional filter by status. ' +
        'The status filter is READ-ONLY filtering — it does NOT publish or change anything. ' +
        'For single-page articles, use list_articles.',
      inputSchema: {
        status: z.enum(['draft', 'published']).optional().describe('Filter by status (read-only filter; not a publish action).'),
      },
    },
    async ({ status }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const q = params.toString();
      return run(() => api.get(`${EDITOR_API}/books${q ? `?${q}` : ''}`));
    },
  );

  // ── get_book ────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_book',
    {
      title: 'Get book',
      description: 'Fetch one book by id with its full chapter/page tree (chapter ids + page ids live here — use these for add_page/update_page).',
      inputSchema: {
        id: z.string().describe('Book id.'),
      },
    },
    async ({ id }) => run(() => api.get(`${EDITOR_API}/books/${seg(id)}`)),
  );

  // ── create_book ─────────────────────────────────────────────────────────────
  server.registerTool(
    'create_book',
    {
      title: 'Create draft book',
      description:
        'Create a new DRAFT book. It CANNOT be published through this server. ' +
        'Returns a summary WITHOUT the chapter/page tree — call get_book next to get the chapter ids needed for add_page. ' +
        'For a single-page article (no chapters/pages), use create_article.',
      inputSchema: {
        title: titleField,
      },
    },
    async ({ title }) => run(() => api.post(`${EDITOR_API}/books`, title !== undefined ? { title } : {})),
  );

  // ── update_book ─────────────────────────────────────────────────────────────
  // NOTE: `status` is deliberately OMITTED — there is no publish affordance.
  server.registerTool(
    'update_book',
    {
      title: 'Update book metadata',
      description: 'Update a draft book’s metadata. Cannot publish (no status field) and cannot edit an already-published book (the API returns 403).',
      inputSchema: {
        id: z.string().describe('Book id.'),
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
    async ({ id, ...patch }) => run(() => api.patch(`${EDITOR_API}/books/${seg(id)}`, patch)),
  );

  // ── add_chapter ─────────────────────────────────────────────────────────────
  server.registerTool(
    'add_chapter',
    {
      title: 'Add chapter',
      description: 'Add a chapter to a book. Returns the chapter (with its id) — use that id with add_page.',
      inputSchema: {
        bookId: z.string().describe('Id of the book to add the chapter to.'),
        title: titleField,
      },
    },
    async ({ bookId, title }) =>
      run(() => api.post(`${EDITOR_API}/books/${seg(bookId)}/chapters`, title !== undefined ? { title } : {})),
  );

  // ── update_chapter ──────────────────────────────────────────────────────────
  server.registerTool(
    'update_chapter',
    {
      title: 'Update chapter',
      description: 'Update a chapter’s title and/or order within its book.',
      inputSchema: {
        id: z.string().describe('Chapter id.'),
        title: z.string().min(1).max(200).optional().describe('New title, 1-200 chars.'),
        order: z.number().int().min(0).optional().describe('New 0-based position among sibling chapters.'),
      },
    },
    async ({ id, ...patch }) => run(() => api.patch(`${EDITOR_API}/chapters/${seg(id)}`, patch)),
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
    async ({ id }) => run(() => api.get(`${EDITOR_API}/pages/${seg(id)}`)),
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
      run(() => api.post(`${EDITOR_API}/chapters/${seg(chapterId)}/pages`, title !== undefined ? { title } : {})),
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
    async ({ id, ...patch }) => run(() => api.patch(`${EDITOR_API}/pages/${seg(id)}`, patch)),
  );

  // ── create_article ───────────────────────────────────────────────────────────
  server.registerTool(
    'create_article',
    {
      title: 'Create draft article',
      description:
        'Create a new DRAFT article — a SINGLE-PAGE content type (one Tiptap doc, NO chapters/pages, NO buyLink). ' +
        'It CANNOT be published through this server. Returns the created draft article summary (id, slug, status). ' +
        'Edit its body and metadata with update_article. The article body uses the SAME content vocabulary as book pages.',
      inputSchema: {
        title: titleField,
      },
    },
    async ({ title }) => run(() => api.post(`${EDITOR_API}/articles`, title !== undefined ? { title } : {})),
  );

  // ── list_articles ─────────────────────────────────────────────────────────────
  server.registerTool(
    'list_articles',
    {
      title: 'List articles',
      description:
        'List articles (summaries: id, slug, title, status, wordCount). Optional filter by status. ' +
        'The status filter is READ-ONLY filtering — it does NOT publish or change anything.',
      inputSchema: {
        status: z.enum(['draft', 'published']).optional().describe('Filter by status (read-only filter; not a publish action).'),
      },
    },
    async ({ status }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const q = params.toString();
      return run(() => api.get(`${EDITOR_API}/articles${q ? `?${q}` : ''}`));
    },
  );

  // ── get_article ───────────────────────────────────────────────────────────────
  server.registerTool(
    'get_article',
    {
      title: 'Get article',
      description:
        'Fetch one article by id OR slug, INCLUDING its stored Tiptap `content`. Use this for read-modify-write: read the ' +
        'canonical persisted doc, edit it, then send the whole doc back via update_article.',
      inputSchema: {
        idOrSlug: z.string().describe('Article id (uuid) or slug.'),
      },
    },
    async ({ idOrSlug }) => run(() => api.get(`${EDITOR_API}/articles/${seg(idOrSlug)}`)),
  );

  // ── update_article ────────────────────────────────────────────────────────────
  // NOTE: `status` is deliberately OMITTED — there is no publish affordance (mirrors update_page/update_book).
  server.registerTool(
    'update_article',
    {
      title: 'Update article',
      description: UPDATE_ARTICLE_DESCRIPTION,
      inputSchema: {
        id: z.string().describe('Article id (uuid).'),
        title: z.string().min(1).max(200).optional().describe('Title, 1-200 chars.'),
        subtitle: z.string().max(300).optional().describe('Subtitle, <=300 chars.'),
        author: z.string().max(120).optional().describe('Author, <=120 chars.'),
        year: z.string().max(12).optional().describe('Publication year, <=12 chars.'),
        coverUrl: httpUrlNullable.describe('Cover image: absolute http(s) URL, <=2000 chars. null clears it.'),
        tags: z.array(z.string().max(40)).max(20).optional().describe('Up to 20 tags, each <=40 chars.'),
        slug: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens')
          .optional()
          .describe('URL slug: lowercase letters, digits and single hyphens, 1-120 chars. Must be unique.'),
        content: tiptapDocInput.optional().describe('The full Tiptap doc ({ type:"doc", content:[...] }). Same vocabulary as book pages — see the content model above. Run validate_content first.'),
      },
    },
    async ({ id, ...patch }) => run(() => api.patch(`${EDITOR_API}/articles/${seg(id)}`, patch)),
  );

  // ── validate_content (local — no API call) ───────────────────────────────────
  server.registerTool(
    'validate_content',
    {
      title: 'Validate content',
      description:
        'Locally validate a Tiptap doc against the editor’s real ProseMirror schema BEFORE saving via update_page or update_article. ' +
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
