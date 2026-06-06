import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyScope, ApiKeySummary, CreateApiKeyResponse } from '@stockmaster/shared';
import { apiKeysApi, ApiError } from '../../lib/api';
import { booksQueryOptions } from '../../lib/queries';
import { useAuth } from '../../lib/auth';
import { AppShell } from '../../components/AppShell';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { Topbar } from '../../components/Topbar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icons } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { Input, Field } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

export const Route = createFileRoute('/_app/api-keys')({
  component: ApiKeysPage,
});

// The full scope catalogue, in the order the create form lists it. `content:write` is the
// safe default a draft-only MCP key needs; publish/delete are deliberately opt-in.
const SCOPES: { value: ApiKeyScope; label: string; hint: string }[] = [
  { value: 'content:write', label: 'content:write', hint: 'Create and edit draft books and articles' },
  { value: 'content:publish', label: 'content:publish', hint: 'Publish and edit published content' },
  { value: 'content:delete', label: 'content:delete', hint: 'Delete books, articles, chapters and pages' },
];

const fmtDate = (d: string | null): string =>
  d
    ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const isExpired = (k: ApiKeySummary): boolean =>
  k.expiresAt !== null && new Date(k.expiresAt).getTime() <= Date.now();

const TAG_CLASS =
  'inline-flex items-center gap-[5px] rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-muted';

function StatusBadge({ k }: { k: ApiKeySummary }) {
  if (k.revokedAt) {
    return (
      <span className={TAG_CLASS} style={{ color: '#c0392b', borderColor: '#c0392b' }}>
        Revoked
      </span>
    );
  }
  if (isExpired(k)) {
    return (
      <span className={TAG_CLASS} style={{ color: 'var(--amber)', borderColor: 'var(--amber)' }}>
        Expired
      </span>
    );
  }
  return (
    <span className={TAG_CLASS} style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
      Active
    </span>
  );
}

function ApiKeysPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: keys = [], isLoading, error } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list(),
  });

  // Books power the shared workspace sidebar counts, so the menu stays identical
  // to the Library — only the active highlight and content change here.
  const { data: books = [] } = useQuery(booksQueryOptions());

  const [showCreate, setShowCreate] = useState(false);
  // The raw secret is held ONLY here, for the lifetime of the reveal modal. It is never
  // written to the query cache, localStorage, or any other persistence — closing the modal
  // (which clears this state) makes it unrecoverable, matching the server's show-once contract.
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeySummary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiKeySummary | null>(null);

  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setPendingRevoke(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiKeysApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setPendingDelete(null);
    },
  });

  const onCreated = async (resp: CreateApiKeyResponse) => {
    setShowCreate(false);
    setCreated(resp);
    await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
  };

  const backToLibrary = () => void navigate({ to: '/' });

  return (
    <>
      <AppShell
        sidebar={() => (
          <WorkspaceSidebar
            user={auth.user!}
            count={books.length}
            active="api-keys"
            onTab={(t) => void navigate({ to: '/', hash: t })}
            onOpenApiKeys={() => undefined}
          />
        )}
      >
        <Topbar>
          <Topbar.Crumbs>
            <Topbar.Crumb onClick={backToLibrary}>Library</Topbar.Crumb>
            <Topbar.Sep />
            <Topbar.Crumb current>API keys</Topbar.Crumb>
          </Topbar.Crumbs>
        </Topbar>

        <div className="canvas-scroll">
          <div className="mx-auto my-6 px-6" style={{ maxWidth: 920 }}>
            <header className="mb-5 flex items-start gap-[14px]">
              <span className="flex-none grid place-items-center w-10 h-10 rounded-md bg-subtle text-muted">
                <Icons.Settings />
              </span>
              <div style={{ flex: 1 }}>
                <h1 className="m-0 text-xl font-bold tracking-[-0.02em]">API keys</h1>
                <p className="mt-1 mb-0 text-sm text-muted">
                  Personal keys for the MCP server and other programmatic callers. A key is shown
                  once at creation — copy it then; it cannot be recovered. Keys are draft-only
                  unless you grant publish/delete scopes.
                </p>
              </div>
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                <Icons.Plus /> New key
              </Button>
            </header>

            {error ? (
              <div className="my-1 rounded-md bg-[color-mix(in_oklch,#c0392b_10%,transparent)] px-3 py-[9px] text-[13px] text-[#c0392b]">
                {error instanceof ApiError ? error.message : 'Could not load API keys.'}
              </div>
            ) : isLoading ? (
              <p className="text-muted" style={{ fontSize: 13 }}>
                Loading keys…
              </p>
            ) : keys.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>
                No API keys yet. Create one to connect the MCP server.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th className="text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-faint px-2.5 py-2 border-b border-line">Name</th>
                      <th className="text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-faint px-2.5 py-2 border-b border-line">Prefix</th>
                      <th className="text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-faint px-2.5 py-2 border-b border-line">Scopes</th>
                      <th className="text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-faint px-2.5 py-2 border-b border-line">Status</th>
                      <th className="text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-faint px-2.5 py-2 border-b border-line">Last used</th>
                      <th className="text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-faint px-2.5 py-2 border-b border-line">Expires</th>
                      <th aria-label="Actions" className="text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-faint px-2.5 py-2 border-b border-line" />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id} style={k.revokedAt ? { opacity: 0.55 } : undefined}>
                        <td className="p-2.5 border-b border-line">{k.name}</td>
                        <td className="p-2.5 border-b border-line">
                          <span className="font-mono bg-canvas border border-line rounded-[4px] px-1.5 py-px text-xs">
                            {k.prefix}…
                          </span>
                        </td>
                        <td className="p-2.5 border-b border-line">
                          <span className="flex flex-wrap gap-1.5">
                            {k.scopes.map((s) => (
                              <span key={s} className={TAG_CLASS}>
                                {s}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="p-2.5 border-b border-line">
                          <StatusBadge k={k} />
                        </td>
                        <td className="p-2.5 border-b border-line text-faint">{fmtDate(k.lastUsedAt)}</td>
                        <td className="p-2.5 border-b border-line text-faint">
                          {k.expiresAt ? fmtDate(k.expiresAt) : 'Never'}
                        </td>
                        <td className="p-2.5 border-b border-line">
                          <span className="flex items-center justify-end gap-1">
                            {!k.revokedAt && (
                              <Button variant="ghostDanger" onClick={() => setPendingRevoke(k)}>
                                <Icons.Ban /> Revoke
                              </Button>
                            )}
                            <Button variant="ghostDanger" onClick={() => setPendingDelete(k)}>
                              <Icons.Trash /> Delete
                            </Button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </AppShell>

      {showCreate && <CreateKeyModal onClose={() => setShowCreate(false)} onCreated={onCreated} />}

      {created && <RevealKeyModal created={created} onClose={() => setCreated(null)} />}

      <ConfirmDialog
        open={pendingRevoke !== null}
        title="Revoke API key?"
        message={
          pendingRevoke
            ? `"${pendingRevoke.name}" will stop working immediately. Any MCP server or script using it will need a new key. This cannot be undone.`
            : ''
        }
        confirmLabel="Revoke key"
        busy={revoke.isPending}
        onConfirm={() => pendingRevoke && revoke.mutate(pendingRevoke.id)}
        onCancel={() => setPendingRevoke(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete API key?"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" will be permanently deleted and removed from this list. Any MCP server or script still using it will stop working immediately. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete key"
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (resp: CreateApiKeyResponse) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  // Default to the draft-only scope — the common MCP case.
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['content:write']);
  // Bound to <input type="datetime-local">, which yields a NAIVE local string. We convert it
  // to an absolute UTC/ISO instant on submit so the server's future-date check can't skew.
  const [expiresLocal, setExpiresLocal] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const toggleScope = (s: ApiKeyScope) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const create = useMutation({
    mutationFn: () =>
      apiKeysApi.create(
        name.trim(),
        scopes,
        expiresLocal ? new Date(expiresLocal).toISOString() : undefined,
      ),
    onSuccess: (resp) => {
      void onCreated(resp);
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : 'Could not create the key. Try again.');
    },
  });

  const canSubmit = name.trim().length > 0 && scopes.length > 0 && !create.isPending;

  return (
    <Modal
      open
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      aria-label="Create API key"
    >
      <h3 className="m-0 mb-2 text-base font-semibold tracking-[-0.01em] text-fg">Create API key</h3>
      <p className="m-0 text-[13.5px] leading-[1.5] text-muted">
        Name the key and pick its scopes. The raw key is shown once, right after you create it.
      </p>

      <div style={{ marginTop: 16 }}>
        <Field label="Name" htmlFor="k-name">
          <Input
            id="k-name"
            placeholder="Claude MCP server"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-muted mb-1.5">Scopes</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SCOPES.map((s) => (
              <label
                key={s.value}
                style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={scopes.includes(s.value)}
                  onChange={() => toggleScope(s.value)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</span>
                  <span className="text-faint" style={{ display: 'block', fontSize: 12 }}>
                    {s.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="k-expires" className="block text-xs font-semibold text-muted mb-1.5">
            Expires (optional)
          </label>
          <Input
            id="k-expires"
            type="datetime-local"
            value={expiresLocal}
            onChange={(e) => setExpiresLocal(e.target.value)}
          />
          <span className="text-faint" style={{ fontSize: 12 }}>
            Leave empty for a key that never expires.
          </span>
        </div>

        {serverError && (
          <div className="my-1 rounded-md bg-[color-mix(in_oklch,#c0392b_10%,transparent)] px-3 py-[9px] text-[13px] text-[#c0392b]">
            {serverError}
          </div>
        )}
      </div>

      <Modal.Actions>
        <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => create.mutate()} disabled={!canSubmit}>
          {create.isPending ? 'Creating…' : 'Create key'}
        </Button>
      </Modal.Actions>
    </Modal>
  );
}

function RevealKeyModal({
  created,
  onClose,
}: {
  created: CreateApiKeyResponse;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard
      .writeText(created.rawKey)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  return (
    <Modal open onClose={onClose} aria-label="API key created">
      <h3 className="m-0 mb-2 text-base font-semibold tracking-[-0.01em] text-fg">Key created</h3>
      <p className="m-0 text-[13.5px] leading-[1.5] text-muted">
        Copy <strong>{created.name}</strong> now — this is the only time the full key is shown.
        Store it somewhere safe; it cannot be recovered later.
      </p>

      <div style={{ marginTop: 16, marginBottom: 0 }}>
        <label htmlFor="k-raw" className="block text-xs font-semibold text-muted mb-1.5">
          Your API key
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            id="k-raw"
            readOnly
            value={created.rawKey}
            style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button variant="secondary" onClick={copy} style={{ flex: 'none' }}>
            {copied ? <Icons.Check /> : <Icons.Copy />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      <Modal.Actions>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
