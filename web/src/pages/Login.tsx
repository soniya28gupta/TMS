import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, ApiError, isTokenExpired, tokens } from '../lib/api';
import { Button, ErrorNote, Field, Input } from '../components/ui';

interface TestAccount {
  label: string;
  email: string;
  role?: string;
}

const DEFAULT_ACCOUNTS: TestAccount[] = [
  { label: 'Super Admin', email: 'admin@acme.test', role: 'SUPER_ADMIN' },
  { label: 'HR Admin', email: 'hr@acme.test', role: 'HR_ADMIN' },
  { label: 'Manager', email: 'manager@acme.test', role: 'MANAGER' },
  { label: 'Team Lead', email: 'lead@acme.test', role: 'TEAM_LEAD' },
  { label: 'Employee', email: 'ananya@acme.test', role: 'EMPLOYEE' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accounts = DEFAULT_ACCOUNTS;
  const defaultPassword = 'Password@123';

  useEffect(() => {
    localStorage.removeItem('tms.demoMode');
    localStorage.removeItem('tms.demoUser');
    // If on the login page with an expired or absent access token, clear stale refresh tokens
    if (!tokens.access || isTokenExpired(tokens.access)) {
      tokens.clear();
    }
  }, []);

  const handleSelectAccount = (account: TestAccount) => {
    setSelectedEmail(account.email);
    setEmail(account.email);
    setPassword(defaultPassword);
    setError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const loggedUser = await login(email.trim(), password);
      if (loggedUser?.role?.portal === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full">
      <div className="hidden flex-1 flex-col justify-between bg-brand-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-lg font-bold">
            T
          </div>
          <span className="text-lg font-semibold">TaskFlow</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">
            Assign work in the morning. Know exactly what happened by evening.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100">
            Tasks flow into each employee's Start-of-Day plan automatically, progress is tracked as
            they work, and the End-of-Day report writes itself from the day's task data.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            {[
              'Automatic SOD generated from assigned tasks',
              'EOD pre-filled with completed, pending and blocked work',
              'Review workflow with approve or request-changes',
              'Attendance, leave and productivity reporting',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-brand-200">Admin Portal &amp; Employee Portal · role-based access</p>
      </div>

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

          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your work email address.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {error && <ErrorNote message={error} />}

            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </Field>

            <Field
              label="Password"
              action={
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline transition focus:outline-none focus:ring-1 focus:ring-brand-500 rounded"
                >
                  Forgot Password?
                </Link>
              }
            >
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </Field>

            <Button type="submit" loading={busy} className="w-full">
              Sign in
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Test accounts
            </p>
            <div className="mt-2 grid gap-1.5" role="group" aria-label="Test accounts">
              {accounts.map((account) => {
                const isSelected = selectedEmail === account.email && email === account.email;
                return (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => handleSelectAccount(account)}
                    aria-pressed={isSelected}
                    className={`group flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                      isSelected
                        ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-300 font-medium'
                        : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                    }`}
                  >
                    <span className="font-medium text-slate-800">{account.label}</span>
                    <span
                      className={`text-xs ${
                        isSelected ? 'font-mono text-brand-700' : 'text-slate-400 group-hover:text-slate-600'
                      }`}
                    >
                      {account.email}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-[11px] text-slate-400">
              All test accounts use the password <code className="font-mono text-slate-500">Password@123</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
