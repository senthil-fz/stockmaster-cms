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
import { Button } from './ui/Button';
import { Input, Field } from './ui/Input';
import { Modal } from './ui/Modal';

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
      <div className="mx-auto my-6 px-6" style={{ maxWidth: 880 }}>
        <header className="mb-5 flex items-start gap-[14px]">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-md bg-subtle text-muted">
            <Icons.Users />
          </span>
          <div style={{ flex: 1 }}>
            <h1 className="m-0 text-xl font-bold tracking-[-0.02em]">Authors</h1>
            <p className="mt-1 text-sm text-muted">
              Everyone with an account in this workspace. Add members, reset their details, or
              suspend access — they sign in with the email and password set here.
            </p>
          </div>
          <Button
            variant="primary"
            style={{ flex: 'none' }}
            onClick={() => {
              setActionError(null);
              setShowCreate(true);
            }}
          >
            <Icons.Plus /> Add a member
          </Button>
        </header>

        {justCreated && (
          <div
            className="mb-4 flex items-center gap-2 rounded-md bg-[color-mix(in_oklch,var(--green)_12%,transparent)] px-3 py-2.5 text-[13px] text-green [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:flex-none"
            role="status"
            aria-live="polite"
          >
            <Icons.Check /> Created <strong>{justCreated.name}</strong> ({justCreated.email}). They
            can sign in now.
          </div>
        )}
        {actionError && (
          <div
            className="my-1 rounded-md bg-[color-mix(in_oklch,#c0392b_10%,transparent)] px-3 py-[9px] text-[13px] text-[#c0392b]"
            role="alert"
          >
            {actionError}
          </div>
        )}

        {error ? (
          <div
            className="my-1 rounded-md bg-[color-mix(in_oklch,#c0392b_10%,transparent)] px-3 py-[9px] text-[13px] text-[#c0392b]"
            role="alert"
          >
            {error instanceof ApiError ? error.message : 'Could not load authors.'}
          </div>
        ) : isLoading ? (
          <p className="text-[13px] text-muted">Loading authors…</p>
        ) : users.length === 0 ? (
          <p className="text-[13px] text-muted">No authors yet. Add the first member to get started.</p>
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
                        <span className="flex items-center gap-2.5">
                          <Avatar name={u.name} color={u.avatarColor} size={32} />
                          <span className={suspended ? 'font-semibold text-faint' : 'font-semibold'}>
                            {u.name}
                          </span>
                          {isSelf && (
                            <span className="inline-flex items-center rounded-full border border-[color-mix(in_oklch,var(--accent)_32%,transparent)] bg-[color-mix(in_oklch,var(--accent)_16%,transparent)] px-2 py-px text-[11px] font-semibold tracking-[0.02em] text-accent">
                              You
                            </span>
                          )}
                          {suspended && (
                            <span className="inline-flex items-center rounded-full border border-[color-mix(in_oklch,var(--amber)_32%,transparent)] bg-[color-mix(in_oklch,var(--amber)_14%,transparent)] px-2 py-px text-[11px] font-semibold tracking-[0.02em] text-amber">
                              Suspended
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="text-muted">{u.email}</td>
                      <td className="text-muted">{fmtJoined(u.createdAt)}</td>
                      <td>
                        <span className="flex justify-end gap-1 [&_button]:px-2 [&_button]:py-1 [&_button]:text-xs">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setActionError(null);
                              setEditing(u);
                            }}
                          >
                            <Icons.Pencil /> Edit
                          </Button>
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              disabled={suspendToggle.isPending}
                              onClick={() => {
                                setActionError(null);
                                suspendToggle.mutate({ id: u.id, suspended: !suspended });
                              }}
                            >
                              {suspended ? 'Reactivate' : 'Suspend'}
                            </Button>
                          )}
                          {!isSelf && (
                            // Ghost+danger (red text, red-tint hover) has no primitive variant —
                            // built inline to avoid colliding with ghost's text/hover utilities.
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-semibold tracking-[-0.01em] text-[#c0392b] transition-[background-color,border-color,box-shadow,opacity] duration-[120ms] hover:bg-[color-mix(in_oklch,#c0392b_10%,transparent)] [&_svg]:size-4"
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
            <p className="mt-3 text-xs text-muted">
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
    <Modal
      open
      onClose={() => !create.isPending && onClose()}
      aria-label="Add a member"
    >
      <h3 className="m-0 mb-2 text-base font-semibold tracking-[-0.01em] text-fg">Add a member</h3>
      <p className="m-0 text-[13.5px] leading-[1.5] text-muted">
        Create an account for someone on your team. They sign in with the email and temporary
        password you set here — creating them does not change who is logged in.
      </p>

      <form className="mt-4 flex flex-col gap-[14px]" onSubmit={onSubmit}>
        <Field label="Name" htmlFor="m-name">
          <Input id="m-name" placeholder="Jane Author" autoFocus {...register('name')} />
          {errors.name && (
            <span className="mt-[5px] block text-xs text-[#c0392b]">{errors.name.message}</span>
          )}
        </Field>

        <Field label="Email" htmlFor="m-email">
          <Input
            id="m-email"
            type="email"
            autoComplete="off"
            placeholder="jane@example.com"
            {...register('email')}
          />
          {errors.email && (
            <span className="mt-[5px] block text-xs text-[#c0392b]">{errors.email.message}</span>
          )}
        </Field>

        <Field label="Temporary password" htmlFor="m-password">
          <Input
            id="m-password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            {...register('password')}
          />
          {errors.password && (
            <span className="mt-[5px] block text-xs text-[#c0392b]">{errors.password.message}</span>
          )}
        </Field>

        {serverError && (
          <div
            className="my-1 rounded-md bg-[color-mix(in_oklch,#c0392b_10%,transparent)] px-3 py-[9px] text-[13px] text-[#c0392b]"
            role="alert"
          >
            {serverError}
          </div>
        )}

        <Modal.Actions style={{ marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            <Icons.Plus /> {isSubmitting ? 'Creating…' : 'Create member'}
          </Button>
        </Modal.Actions>
      </form>
    </Modal>
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
    <Modal open onClose={() => !save.isPending && onClose()} aria-label={`Edit ${user.name}`}>
      <h3 className="m-0 mb-2 text-base font-semibold tracking-[-0.01em] text-fg">Edit member</h3>
      <p className="m-0 text-[13.5px] leading-[1.5] text-muted">
        Update this member's details. Leave the password blank to keep their current one.
      </p>

      <form
        className="mt-4 flex flex-col gap-[14px]"
        onSubmit={(e) => {
          e.preventDefault();
          setServerError(null);
          if (canSubmit) save.mutate();
        }}
      >
        <Field label="Name" htmlFor="e-name">
          <Input id="e-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Email" htmlFor="e-email">
          <Input
            id="e-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="New password" htmlFor="e-password">
          <Input
            id="e-password"
            type="password"
            autoComplete="new-password"
            placeholder="Leave blank to keep current"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {serverError && (
          <div
            className="my-1 rounded-md bg-[color-mix(in_oklch,#c0392b_10%,transparent)] px-3 py-[9px] text-[13px] text-[#c0392b]"
            role="alert"
          >
            {serverError}
          </div>
        )}

        <Modal.Actions style={{ marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!canSubmit}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </Modal.Actions>
      </form>
    </Modal>
  );
}
