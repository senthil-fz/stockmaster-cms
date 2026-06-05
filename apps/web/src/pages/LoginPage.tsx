import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { loginSchema, type LoginInput } from '@stockmaster/shared';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Icons } from '../components/icons';
import { Button } from '../components/ui/Button';
import { Input, Field } from '../components/ui/Input';

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
    <div className="grid min-h-full place-items-center bg-app p-6">
      <form
        className="w-full max-w-[380px] rounded-xl border border-line bg-canvas p-7 shadow-md"
        onSubmit={onSubmit}
      >
        <div className="mb-[22px] flex items-center gap-2.5">
          <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-md bg-primary text-onprimary [&>svg]:h-4 [&>svg]:w-4">
            <Icons.Logo />
          </span>
          <div className="text-sm font-semibold tracking-[-0.01em]">
            StockMaster
            <small className="block text-[11px] font-medium text-faint">Editorial workspace</small>
          </div>
        </div>

        <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em]">Welcome back</h1>
        <p className="mt-1 mb-5 text-sm text-muted">Sign in to your editorial workspace.</p>

        <Field label="Email" htmlFor="auth-email">
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email')}
          />
          {errors.email && (
            <span className="mt-[5px] block text-xs text-[#c0392b]">{errors.email.message}</span>
          )}
        </Field>

        <Field label="Password" htmlFor="auth-password">
          <Input
            id="auth-password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password && (
            <span className="mt-[5px] block text-xs text-[#c0392b]">{errors.password.message}</span>
          )}
        </Field>

        {serverError && (
          <div className="my-1 rounded-md bg-[color-mix(in_oklch,#c0392b_10%,transparent)] px-3 py-[9px] text-[13px] text-[#c0392b]">
            {serverError}
          </div>
        )}

        <Button
          variant="primary"
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full justify-center"
        >
          {isSubmitting ? 'Please wait…' : 'Sign in'}
        </Button>

        <p className="mt-4 mb-0 text-sm text-muted">
          Need an account? Ask a workspace member to create one for you.
        </p>
      </form>
    </div>
  );
}
