import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyScope, ApiKeySummary, CreateApiKeyResponse } from '@blockpress/shared';
import { apiKeysApi, ApiError } from '../../lib/api';
import { worksQueryOptions } from '../../lib/queries';
import { useAuth } from '../../lib/auth';
import { AppShell } from '../../components/AppShell';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { Topbar } from '../../components/Topbar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icons } from '../../components/icons';

export const Route = createFileRoute('/_app/api-keys')({
  component: ApiKeysPage,
});

// The full scope catalogue, in the order the create form lists it. `works:write` is the
// safe default a draft-only MCP key needs; publish/delete are deliberately opt-in.
const SCOPES: { value: ApiKeyScope; label: string; hint: string }[] = [
  { value: 'works:write', label: 'works:write', hint: 'Create and edit draft content' },
  { value: 'works:publish', label: 'works:publish', hint: 'Publish and edit published content' },
  { value: 'works:delete', label: 'works:delete', hint: 'Delete works, chapters and pages' },
];

const fmtDate = (d: string | null): string =>
  d
    ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const isExpired = (k: ApiKeySummary): boolean =>
  k.expiresAt !== null && new Date(k.expiresAt).getTime() <= Date.now();

function StatusBadge({ k }: { k: ApiKeySummary }) {
  if (k.revokedAt) {
    return (
      <span className="tag" style={{ color: '#c0392b', borderColor: '#c0392b' }}>
        Revoked
      </span>
    );
  }
  if (isExpired(k)) {
    return (
      <span className="tag" style={{ color: 'var(--amber)', borderColor: 'var(--amber)' }}>
        Expired
      </span>
    );
  }
  return (
    <span className="tag" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
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

  // Works power the shared workspace sidebar counts, so the menu stays identical
  // to the Library — only the active highlight and content change here.
  const { data: works = [] } = useQuery(worksQueryOptions());

  const [showCreate, setShowCreate] = useState(false);
  // The raw secret is held ONLY here, for the lifetime of the reveal modal. It is never
  // written to the query cache, localStorage, or any other persistence — closing the modal
  // (which clears this state) makes it unrecoverable, matching the server's show-once contract.
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeySummary | null>(null);

  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setPendingRevoke(null);
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
            works={works}
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
          <div className="member-panel" style={{ maxWidth: 920 }}>
            <header className="member-head">
              <span className="member-icon">
                <Icons.Settings />
              </span>
              <div style={{ flex: 1 }}>
                <h1 className="member-title">API keys</h1>
                <p className="member-sub">
                  Personal keys for the MCP server and other programmatic callers. A key is shown
                  once at creation — copy it then; it cannot be recovered. Keys are draft-only
                  unless you grant publish/delete scopes.
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Icons.Plus /> New key
              </button>
            </header>

            {error ? (
              <div className="auth-error">
                {error instanceof ApiError ? error.message : 'Could not load API keys.'}
              </div>
            ) : isLoading ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Loading keys…
              </p>
            ) : keys.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                No API keys yet. Create one to connect the MCP server.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Prefix</th>
                      <th>Scopes</th>
                      <th>Status</th>
                      <th>Last used</th>
                      <th>Expires</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id} style={k.revokedAt ? { opacity: 0.55 } : undefined}>
                        <td>{k.name}</td>
                        <td>
                          <span className="kbd">{k.prefix}…</span>
                        </td>
                        <td>
                          <span className="tag-row">
                            {k.scopes.map((s) => (
                              <span key={s} className="tag">
                                {s}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td>
                          <StatusBadge k={k} />
                        </td>
                        <td className="muted">{fmtDate(k.lastUsedAt)}</td>
                        <td className="muted">{k.expiresAt ? fmtDate(k.expiresAt) : 'Never'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {!k.revokedAt && (
                            <button
                              className="btn btn-ghost danger-btn"
                              onClick={() => setPendingRevoke(k)}
                            >
                              <Icons.Trash /> Revoke
                            </button>
                          )}
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
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['works:write']);
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
    <div className="modal-overlay" onClick={() => !create.isPending && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create API key"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Create API key</h3>
        <p>Name the key and pick its scopes. The raw key is shown once, right after you create it.</p>

        <div style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="k-name">Name</label>
            <input
              id="k-name"
              className="input"
              placeholder="Claude MCP server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label>Scopes</label>
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
                    <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                      {s.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="k-expires">Expires (optional)</label>
            <input
              id="k-expires"
              className="input"
              type="datetime-local"
              value={expiresLocal}
              onChange={(e) => setExpiresLocal(e.target.value)}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Leave empty for a key that never expires.
            </span>
          </div>

          {serverError && <div className="auth-error">{serverError}</div>}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => create.mutate()} disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create key'}
          </button>
        </div>
      </div>
    </div>
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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="API key created"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Key created</h3>
        <p>
          Copy <strong>{created.name}</strong> now — this is the only time the full key is shown.
          Store it somewhere safe; it cannot be recovered later.
        </p>

        <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
          <label htmlFor="k-raw">Your API key</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="k-raw"
              className="input"
              readOnly
              value={created.rawKey}
              style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button className="btn btn-secondary" onClick={copy} style={{ flex: 'none' }}>
              {copied ? <Icons.Check /> : <Icons.Copy />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
