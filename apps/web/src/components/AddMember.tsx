import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupSchema, type SignupInput } from '@stockmaster/shared';
import { usersApi, ApiError } from '../lib/api';
import { Icons } from './icons';

/**
 * Authenticated user-creation. There is no public signup — any signed-in member adds
 * new accounts here. Creating a user does not change who is logged in; the new member
 * signs in afterwards with the password set below.
 */
export function AddMember() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const { user } = await usersApi.create(values);
      setCreated({ name: user.name, email: user.email });
      reset();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  });

  return (
    <div className="member-panel">
      <header className="member-head">
        <span className="member-icon">
          <Icons.Users />
        </span>
        <div>
          <h1 className="member-title">Add a member</h1>
          <p className="member-sub">
            Create an account for someone on your team. They sign in with the email and
            password you set here.
          </p>
        </div>
      </header>

      {created && (
        <div className="member-ok">
          <Icons.Check /> Created <strong>{created.name}</strong> ({created.email}). They can
          sign in now.
        </div>
      )}

      <form className="member-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="m-name">Name</label>
          <input id="m-name" className="input" placeholder="Jane Author" {...register('name')} />
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

        {serverError && <div className="auth-error">{serverError}</div>}

        <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
          <Icons.Plus /> {isSubmitting ? 'Creating…' : 'Create member'}
        </button>
      </form>
    </div>
  );
}
