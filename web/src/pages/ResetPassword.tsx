import { useState, useEffect, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Button, ErrorNote, Field, Input, Spinner } from '../components/ui';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [associatedEmail, setAssociatedEmail] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      setTokenError('No password reset token was provided. Please use the link sent to your email.');
      return;
    }

    let active = true;
    (async () => {
      try {
        const res = await api.get<{ valid: boolean; email?: string; message?: string }>(
          `/auth/verify-reset-token?token=${encodeURIComponent(token)}`,
        );
        if (active) {
          if (res.valid) {
            setTokenValid(true);
            setAssociatedEmail(res.email ?? null);
          } else {
            setTokenValid(false);
            setTokenError(res.message ?? 'This reset link is invalid or has expired.');
          }
        }
      } catch (err) {
        if (active) {
          setTokenValid(false);
          setTokenError(
            err instanceof ApiError
              ? err.message
              : 'This password reset link is invalid or has expired. Please request a new one.',
          );
        }
      } finally {
        if (active) setVerifying(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setError('Password must include at least one lowercase letter.');
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must include at least one uppercase letter.');
      return;
    }

    if (!/\d/.test(newPassword)) {
      setError('Password must include at least one number.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('The passwords do not match. Please ensure both fields are identical.');
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword,
      });
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reset password. Please try again or request a new link.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full">
      {/* Left blue panel — matches TaskFlow brand styling exactly */}
      <div className="hidden flex-1 flex-col justify-between bg-brand-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-lg font-bold">
            T
          </div>
          <span className="text-lg font-semibold">TaskFlow</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">
            Create a strong, secure new password.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100">
            Choose a unique password with uppercase, lowercase, and numbers to ensure full account protection.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            {[
              'Minimum 8 characters with letters and digits',
              'Old sessions are signed out automatically',
              'Enterprise-grade bcrypt password hashing',
              'Single-use token is immediately invalidated',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-brand-200">Admin Portal &amp; Employee Portal · secure authentication</p>
      </div>

      {/* Right panel — form container */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
                T
              </div>
              <span className="text-lg font-semibold text-slate-900">TaskFlow</span>
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900">Reset Password</h2>
          <p className="mt-1 text-sm text-slate-500">
            {associatedEmail ? `Choose a new password for ${associatedEmail}` : 'Enter your new password below.'}
          </p>

          {verifying ? (
            <div className="mt-8 flex flex-col items-center justify-center py-8">
              <Spinner label="Verifying reset link…" />
            </div>
          ) : !tokenValid ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <p className="font-semibold text-rose-900">Invalid or Expired Link</p>
                <p className="mt-1 text-xs text-rose-700">
                  {tokenError ?? 'This password reset link is invalid or has expired. Please request a new one.'}
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <Link to="/forgot-password">
                  <Button className="w-full">Request New Reset Link</Button>
                </Link>
                <Link to="/login" className="block text-center pt-2">
                  <span className="text-xs font-medium text-slate-600 hover:text-slate-800">
                    ← Back to Sign In
                  </span>
                </Link>
              </div>
            </div>
          ) : success ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-start gap-2.5">
                  <span className="text-base leading-none">✓</span>
                  <div>
                    <p className="font-semibold text-emerald-900">Password Reset Complete</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Your password has been successfully updated. You can now sign in using your new credentials.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Link to="/login">
                  <Button className="w-full">Sign in with New Password</Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {error && <ErrorNote message={error} />}

              <Field
                label="New Password"
                hint="At least 8 characters, with uppercase, lowercase, and a number."
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="••••••••"
                  autoFocus
                />
              </Field>

              <Field label="Confirm New Password">
                <Input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </Field>

              <Button type="submit" loading={busy} className="w-full">
                Reset Password
              </Button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline transition focus:outline-none focus:ring-1 focus:ring-brand-500 rounded"
                >
                  ← Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

