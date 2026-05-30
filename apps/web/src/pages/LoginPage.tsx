import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { loginSchema, signupSchema, type LoginInput, type SignupInput } from '@blockpress/shared';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Icons } from '../components/icons';

type Mode = 'login' | 'signup';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [serverError, setServerError] = useState<string | null>(null);

  // Once authenticated (login or refresh), leave the login screen.
  useEffect(() => {
    if (auth.isAuthed) void navigate({ to: '/' });
  }, [auth.isAuthed, navigate]);

  const isSignup = mode === 'signup';
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<SignupInput>({
    resolver: zodResolver(isSignup ? signupSchema : loginSchema) as never,
    defaultValues: { email: '', password: '', name: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (isSignup) {
        await auth.signup(values as SignupInput);
      } else {
        await auth.login(values as LoginInput);
      }
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
            Blockpress
            <small>Editorial workspace</small>
          </div>
        </div>

        <h1 className="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-sub">
          {isSignup ? 'Start writing books and articles.' : 'Sign in to your editorial workspace.'}
        </p>

        {isSignup && (
          <div className="field">
            <label htmlFor="auth-name">Name</label>
            <input id="auth-name" className="input" placeholder="Jane Author" {...register('name')} />
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </div>
        )}

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
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            {...register('password')}
          />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </div>

        {serverError && <div className="auth-error">{serverError}</div>}

        <button className="btn btn-primary auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
        </button>

        <p className="auth-switch">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? 'login' : 'signup');
              setServerError(null);
              reset();
            }}
          >
            {isSignup ? 'Sign in' : 'Create an account'}
          </button>
        </p>

        {!isSignup && (
          <p className="auth-demo">
            Demo: <code>sienna@blockpress.io</code> / <code>password123</code>
          </p>
        )}
      </form>
    </div>
  );
}
