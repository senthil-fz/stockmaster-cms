import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { loginSchema, type LoginInput } from '@stockmaster/shared';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Icons } from '../components/icons';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  // Once authenticated (login or refresh), leave the login screen.
  useEffect(() => {
    if (auth.isAuthed) void navigate({ to: '/' });
  }, [auth.isAuthed, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await auth.login(values);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  });

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <span className="sb-logo">
            <Icons.Logo />
          </span>
          <div className="sb-brand">
            StockMaster
            <small>Editorial workspace</small>
          </div>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Sign in to your editorial workspace.</p>

        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email')}
          />
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </div>

        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            className="input"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </div>

        {serverError && <div className="auth-error">{serverError}</div>}

        <button className="btn btn-primary auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Please wait…' : 'Sign in'}
        </button>

        <p className="auth-sub" style={{ marginTop: 16, marginBottom: 0 }}>
          Need an account? Ask a workspace member to create one for you.
        </p>
      </form>
    </div>
  );
}
