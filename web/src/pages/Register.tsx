import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '../components/ui';

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
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
            Enterprise team workflow, built for modern organizations.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100">
            Tasks flow into each employee's Start-of-Day plan automatically, progress is tracked as
            they work, and the End-of-Day report writes itself from the day's task data.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            {[
              'Enterprise role-based access control',
              'Automated SOD & EOD submission pipelines',
              'Integrated attendance, leave & review queues',
              'Single sign-on & administrator account provisioning',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-brand-200">Admin Portal &amp; Employee Portal · enterprise access</p>
      </div>

      {/* Right form container */}
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

          <h2 className="text-2xl font-semibold text-slate-900">Get started</h2>
          <p className="mt-1 text-sm text-slate-500">Workspace account registration &amp; access.</p>

          {submitted ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-semibold text-emerald-950">Registration request submitted</p>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                  Your access request for <span className="font-medium font-mono">{email}</span> has been logged.
                  Your organization administrator will provision your account and assign your role.
                </p>
              </div>

              <div className="pt-2">
                <Button onClick={() => navigate('/login')} className="w-full">
                  Return to Sign in
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3.5 text-xs text-brand-900">
                <p className="font-medium">Enterprise Workspace Provisioning</p>
                <p className="mt-1 text-brand-700 leading-relaxed">
                  Accounts in this organization are provisioned by your system administrator. You can request access below or sign in directly with your assigned credentials.
                </p>
              </div>

              <Field label="Full Name" required>
                <Input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </Field>

              <Field label="Work Email Address" required>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane.doe@company.com"
                />
              </Field>

              <Button type="submit" className="w-full">
                Request Account Access
              </Button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline transition focus:outline-none focus:ring-1 focus:ring-brand-500 rounded"
                >
                  ← Already have an account? Sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
