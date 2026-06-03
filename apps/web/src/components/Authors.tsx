import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  signupSchema,
  type SignupInput,
  type UpdateUserInput,
  type User,
} from '@stockmaster/shared';
import { usersApi, ApiError } from '../lib/api';
import { usersQueryOptions, queryKeys } from '../lib/queries';
import { Avatar } from './ui/Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { Icons } from './icons';

const fmtJoined = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * The Authors view: a table of every account in the shared workspace, plus the flows to add,
 * edit, suspend/reactivate, and delete members. There is no public signup — any signed-in
 * member manages accounts here. You cannot suspend or delete your OWN account (the server
 * enforces this too); editing your own profile is allowed.
 */
export function Authors({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading, error } = useQuery(usersQueryOptions());

  const [showCreate, setShowCreate] = useState(false);
  const [justCreated, setJustCreated] = useState<{ name: string; email: string } | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.users() });

  const suspendToggle = useMutation({
    mutationFn: (vars: { id: string; suspended: boolean }) =>
      usersApi.update(vars.id, { suspended: vars.suspended }),
    onSuccess: () => invalidate(),
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : 'Could not update the account.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: async () => {
      await invalidate();
      setPendingDelete(null);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Could not delete the account.');
      setPendingDelete(null);
    },
  });

  const onCreated = async (user: User) => {
    setShowCreate(false);
    setJustCreated({ name: user.name, email: user.email });
    await invalidate();
  };

  return (
    <>
      <div className="member-panel" style={{ maxWidth: 880 }}>
        <header className="member-head">
          <span className="member-icon">
            <Icons.Users />
          </span>
          <div style={{ flex: 1 }}>
            <h1 className="member-title">Authors</h1>
            <p className="member-sub">
              Everyone with an account in this workspace. Add members, reset their details, or
              suspend access — they sign in with the email and password set here.
            </p>
          </div>
          <button
            className="btn btn-primary"
            style={{ flex: 'none' }}
            onClick={() => {
              setActionError(null);
              setShowCreate(true);
            }}
          >
            <Icons.Plus /> Add a member
          </button>
        </header>

        {justCreated && (
          <div className="member-ok" role="status" aria-live="polite">
            <Icons.Check /> Created <strong>{justCreated.name}</strong> ({justCreated.email}). They
            can sign in now.
          </div>
        )}
        {actionError && (
          <div className="auth-error" role="alert">
            {actionError}
          </div>
        )}

        {error ? (
          <div className="auth-error" role="alert">
            {error instanceof ApiError ? error.message : 'Could not load authors.'}
          </div>
        ) : isLoading ? (
          <p className="muted" style={{ fontSize: 13 }}>
            Loading authors…
          </p>
        ) : users.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No authors yet. Add the first member to get started.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table authors-table" aria-label="Authors">
              <thead>
                <tr>
                  <th scope="col">Author</th>
                  <th scope="col">Email</th>
                  <th scope="col">Joined</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const isSelf = u.id === currentUserId;
                  // Boolean() — a present ISO string is suspended; null/undefined are not. Using
                  // `!== null` would mis-read a missing field (undefined) as suspended.
                  const suspended = Boolean(u.suspendedAt);
                  return (
                    <tr
                      key={u.id}
                      className={suspended ? 'is-suspended' : undefined}
                      style={{
                        animationDelay: `${Math.min(i, 12) * 40}ms`,
                        ...(suspended ? { opacity: 0.62 } : {}),
                      }}
                    >
                      <td>
                        <span className="author-cell">
                          <Avatar name={u.name} color={u.avatarColor} size={32} />
                          <span className="name">{u.name}</span>
                          {isSelf && <span className="you-badge">You</span>}
                          {suspended && <span className="status-suspended">Suspended</span>}
                        </span>
                      </td>
                      <td className="muted">{u.email}</td>
                      <td className="muted">{fmtJoined(u.createdAt)}</td>
                      <td>
                        <span className="author-actions">
                          <button
                            className="btn btn-ghost"
                            onClick={() => {
                              setActionError(null);
                              setEditing(u);
                            }}
                          >
                            <Icons.Pencil /> Edit
                          </button>
                          {!isSelf && (
                            <button
                              className="btn btn-ghost"
                              disabled={suspendToggle.isPending}
                              onClick={() => {
                                setActionError(null);
                                suspendToggle.mutate({ id: u.id, suspended: !suspended });
                              }}
                            >
                              {suspended ? 'Reactivate' : 'Suspend'}
                            </button>
                          )}
                          {!isSelf && (
                            <button
                              className="btn btn-ghost danger-btn"
                              onClick={() => {
                                setActionError(null);
                                setPendingDelete(u);
                              }}
                            >
                              <Icons.Trash /> Delete
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              {users.length} {users.length === 1 ? 'author' : 'authors'}
            </p>
          </div>
        )}
      </div>

      {showCreate && <AddAuthorModal onClose={() => setShowCreate(false)} onCreated={onCreated} />}
      {editing && (
        <EditAuthorModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await invalidate();
          }}
        />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete member?"
        message={
          pendingDelete
            ? `This permanently removes ${pendingDelete.name} (${pendingDelete.email}). Their books and articles are kept (authorship is cleared) and their API keys are deleted. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete member"
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

function AddAuthorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: User) => void | Promise<void>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const create = useMutation({
    mutationFn: (values: SignupInput) => usersApi.create(values),
    onSuccess: ({ user }) => {
      void onCreated(user);
    },
    onError: (err) =>
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.'),
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    create.mutate(values);
  });

  return (
    <div className="modal-overlay" onClick={() => !create.isPending && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add a member"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Add a member</h3>
        <p>
          Create an account for someone on your team. They sign in with the email and temporary
          password you set here — creating them does not change who is logged in.
        </p>

        <form className="member-form" style={{ marginTop: 16 }} onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="m-name">Name</label>
            <input id="m-name" className="input" placeholder="Jane Author" autoFocus {...register('name')} />
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </div>

          <div className="field">
            <label htmlFor="m-email">Email</label>
            <input
              id="m-email"
              className="input"
              type="email"
              autoComplete="off"
              placeholder="jane@example.com"
              {...register('email')}
            />
            {errors.email && <span className="field-error">{errors.email.message}</span>}
          </div>

          <div className="field">
            <label htmlFor="m-password">Temporary password</label>
            <input
              id="m-password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              {...register('password')}
            />
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </div>

          {serverError && (
            <div className="auth-error" role="alert">
              {serverError}
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
              <Icons.Plus /> {isSubmitting ? 'Creating…' : 'Create member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditAuthorModal({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const input: UpdateUserInput = { name: name.trim(), email: email.trim() };
      // Only send a password when one was typed — blank means "keep the current password".
      if (password.trim()) input.password = password;
      return usersApi.update(user.id, input);
    },
    onSuccess: () => {
      void onSaved();
    },
    onError: (err) =>
      setServerError(err instanceof ApiError ? err.message : 'Could not save changes. Try again.'),
  });

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && !save.isPending;

  return (
    <div className="modal-overlay" onClick={() => !save.isPending && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${user.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Edit member</h3>
        <p>Update this member's details. Leave the password blank to keep their current one.</p>

        <form
          className="member-form"
          style={{ marginTop: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            setServerError(null);
            if (canSubmit) save.mutate();
          }}
        >
          <div className="field">
            <label htmlFor="e-name">Name</label>
            <input
              id="e-name"
              className="input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="e-email">Email</label>
            <input
              id="e-email"
              className="input"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="e-password">New password</label>
            <input
              id="e-password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank to keep current"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {serverError && (
            <div className="auth-error" role="alert">
              {serverError}
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
