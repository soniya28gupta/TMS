import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Button, ErrorNote, Field, Input } from '../components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    submitted: boolean;
    message: string;
    emailConfigured?: boolean;
  } | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const data = await api.post<{
        ok: boolean;
        message: string;
        emailConfigured?: boolean;
        emailStatus?: string;
      }>('/auth/forgot-password', { email: email.trim() });

      setResult({
        submitted: true,
        message: data.message,
        emailConfigured: data.emailConfigured,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not submit password reset request. Please check your network and try again.',
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
            Account recovery &amp; password reset.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100">
            Keep your credentials safe. Reset tokens are single-use, time-limited, and sent directly
            to your registered work email.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            {[
              'Secure single-use cryptographic reset tokens',
              'Automated session revocation on password change',
              'Time-limited access link valid for 20 minutes',
              'Protects your account with enterprise security',
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

          <h2 className="text-2xl font-semibold text-slate-900">Forgot Password?</h2>
          <p className="mt-1 text-sm text-slate-500">
            Enter your registered work email address. We will send you a password reset link.
          </p>

          {result?.submitted ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-start gap-2.5">
                  <span className="text-base leading-none">✓</span>
                  <div>
                    <p className="font-semibold text-emerald-900">Check your inbox</p>
                    <p className="mt-1 text-xs text-emerald-700">{result.message}</p>
                  </div>
                </div>
              </div>

              {!result.emailConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                  <p className="font-semibold">Notice regarding email dispatch:</p>
                  <p className="mt-0.5 text-amber-700">
                    SMTP is currently not configured on this environment. The password reset email has
                    been securely queued in the database outbox.
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-500">
                The reset link will expire in 20 minutes and can only be used once. If you don't see the email,
                check your spam folder.
              </p>

              <div className="pt-2">
                <Link to="/login">
                  <Button variant="secondary" className="w-full">
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {error && <ErrorNote message={error} />}

              <Field label="Registered Email Address">
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoFocus
                />
              </Field>

              <Button type="submit" loading={busy} className="w-full">
                Send Reset Link
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

