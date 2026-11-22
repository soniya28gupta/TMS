import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../components/Layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  InfoNote,
  Input,
  Select,
  Spinner,
  Table,
} from '../../components/ui';
import { api, downloadFile } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { formatBytes, formatDate, formatDateTime, relativeTime, titleCase } from '../../lib/format';
import type { PrivacyState, UserSession } from '../../lib/types';

type Document = {
  id: string;
  title: string;
  category: string;
  scope: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string };
};

const CATEGORIES = ['ID_PROOF', 'CONTRACT', 'PAYSLIP', 'POLICY', 'CERTIFICATE', 'OTHER'];

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const documents = useApi<{ data: Document[] }>('/documents');
  const profileAction = useAction();
  const passwordAction = useAction();
  const uploadAction = useAction();

  const fileInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('OTHER');
  const [saved, setSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [form, setForm] = useState({
    phone: '',
    address: '',
    gender: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  useEffect(() => {
    if (!user) return;
    setForm({
      phone: user.phone ?? '',
      address: user.address ?? '',
      gender: user.gender ?? '',
      emergencyContactName: user.emergencyContactName ?? '',
      emergencyContactPhone: user.emergencyContactPhone ?? '',
    });
  }, [user?.id]);

  if (!user) return null;

  const saveProfile = async () => {
    const result = await profileAction.run(() => api.patch('/employees/me', form));
    if (result) {
      setSaved(true);
      await refreshUser();
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const changePassword = async () => {
    if (passwords.newPassword !== passwords.confirm) {
      passwordAction.setError('The new passwords do not match');
      return;
    }
    const result = await passwordAction.run(() =>
      api.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      }),
    );
    if (result) {
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      setPasswordSaved(true);
      await refreshUser();
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const body = new FormData();
    Array.from(files).forEach((file) => body.append('files', file));
    body.append('category', category);
    body.append('scope', 'PERSONAL');
    const result = await uploadAction.run(() => api.upload('/documents', body));
    if (result) documents.reload();
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <>
      <PageHeader title="Profile & documents" description="Your personal, employment and contact information." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" title="Employment">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{user.fullName}</p>
              <p className="truncate text-sm text-slate-500">{user.designation ?? '—'}</p>
            </div>
          </div>

          <dl className="mt-5 space-y-2.5 text-sm">
            <Row label="Employee code" value={user.employeeCode} />
            <Row label="Email" value={user.email} />
            <Row label="Role" value={user.role.name} />
            <Row label="Department" value={user.department?.name ?? '—'} />
            <Row label="Teams" value={user.teams.map((team) => team.name).join(', ') || '—'} />
            <Row
              label="Reports to"
              value={user.manager ? `${user.manager.firstName} ${user.manager.lastName}` : '—'}
            />
            <Row label="Employment" value={titleCase(user.employmentType)} />
            <Row label="Work mode" value={titleCase(user.workMode)} />
            <Row label="Joined" value={formatDate(user.dateOfJoining)} />
            <Row label="Shift" value={`${user.shiftStart} – ${user.shiftEnd}`} />
            <Row label="Status" value={<Badge>{titleCase(user.status)}</Badge>} />
          </dl>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Contact information"
            actions={
              <Button size="sm" loading={profileAction.busy} onClick={() => void saveProfile()}>
                Save changes
              </Button>
            }
          >
            {profileAction.error && <div className="mb-3"><ErrorNote message={profileAction.error} /></div>}
            {saved && <div className="mb-3"><InfoNote>Profile updated.</InfoNote></div>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone">
                <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </Field>
              <Field label="Gender">
                <Select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
                  <option value="">Prefer not to say</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </Select>
              </Field>
              <Field label="Emergency contact name">
                <Input
                  value={form.emergencyContactName}
                  onChange={(event) => setForm({ ...form, emergencyContactName: event.target.value })}
                />
              </Field>
              <Field label="Emergency contact phone">
                <Input
                  value={form.emergencyContactPhone}
                  onChange={(event) => setForm({ ...form, emergencyContactPhone: event.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Password">
            {user.mustChangePassword && (
              <div className="mb-3">
                <InfoNote tone="amber">You are using a temporary password. Please set your own.</InfoNote>
              </div>
            )}
            {passwordAction.error && <div className="mb-3"><ErrorNote message={passwordAction.error} /></div>}
            {passwordSaved && <div className="mb-3"><InfoNote>Password changed. Other devices were signed out.</InfoNote></div>}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Current password">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
                />
              </Field>
              <Field label="New password" hint="8+ chars, upper, lower and a number.">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.newPassword}
                  onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                />
              </Field>
              <Field label="Confirm new password">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                />
              </Field>
            </div>
            <Button
              className="mt-3"
              loading={passwordAction.busy}
              disabled={!passwords.currentPassword || passwords.newPassword.length < 8}
              onClick={() => void changePassword()}
            >
              Change password
            </Button>
          </Card>

          <PrivacyAndSessions />

          <Card
            title="Documents"
            subtitle="Your personal files plus anything the company shares with everyone"
            actions={
              <div className="flex items-center gap-2">
                <Select value={category} onChange={(event) => setCategory(event.target.value)} className="w-auto">
                  {CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
                    </option>
                  ))}
                </Select>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => void upload(event.target.files)}
                />
                <Button size="sm" loading={uploadAction.busy} onClick={() => fileInput.current?.click()}>
                  Upload
                </Button>
              </div>
            }
            bodyClassName="p-0"
          >
            {uploadAction.error && <div className="p-4"><ErrorNote message={uploadAction.error} /></div>}
            {documents.loading && !documents.data ? (
              <Spinner />
            ) : !documents.data?.data.length ? (
              <EmptyState title="No documents yet" description="Upload your ID proof, certificates or contracts." />
            ) : (
              <Table
                head={
                  <tr>
                    <th className="th">Title</th>
                    <th className="th">Category</th>
                    <th className="th">Scope</th>
                    <th className="th">Size</th>
                    <th className="th">Uploaded</th>
                    <th className="th" />
                  </tr>
                }
              >
                {documents.data.data.map((doc) => (
                  <tr key={doc.id}>
                    <td className="td max-w-[240px] truncate font-medium">{doc.title}</td>
                    <td className="td">{titleCase(doc.category)}</td>
                    <td className="td">
                      <Badge>{titleCase(doc.scope)}</Badge>
                    </td>
                    <td className="td tabular-nums">{formatBytes(doc.size)}</td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(doc.createdAt)}</td>
                    <td className="td text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void downloadFile(`/files/documents/${doc.id}`, doc.originalName)}
                      >
                        Download
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * Consent and transparency in one place: what the company may capture, whether
 * this employee agreed, and every device currently holding their session.
 */
function PrivacyAndSessions() {
  const privacy = useApi<PrivacyState>('/auth/privacy');
  const sessions = useApi<{ data: UserSession[] }>('/auth/sessions');
  const { busy, error, run } = useAction();

  const setConsent = async (accepted: boolean) => {
    await run(() => api.post('/auth/privacy/consent', { accepted }));
    privacy.reload();
  };

  const revoke = async (sessionId: string) => {
    await run(() => api.post(`/auth/sessions/${sessionId}/revoke`));
    sessions.reload();
  };

  return (
    <>
      <Card title="Location & privacy">
        {privacy.loading && !privacy.data ? (
          <Spinner />
        ) : !privacy.data ? null : (
          <>
            {error && <div className="mb-3"><ErrorNote message={error} /></div>}

            {!privacy.data.enabled ? (
              <InfoNote tone="slate">
                Location capture is switched off for the whole company. Nothing is being recorded.
              </InfoNote>
            ) : (
              <>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  {privacy.data.notice.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                      {line}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge>Precision: {titleCase(privacy.data.precision)}</Badge>
                  <Badge>Kept for {privacy.data.retentionDays} days</Badge>
                  <Badge>Notice v{privacy.data.version}</Badge>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  {privacy.data.consentGiven ? (
                    <>
                      <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">
                        Consent given {privacy.data.consentAt ? formatDate(privacy.data.consentAt) : ''}
                      </Badge>
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => void setConsent(false)}>
                        Withdraw & delete my location data
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Not accepted</Badge>
                      <Button size="sm" loading={busy} onClick={() => void setConsent(true)}>
                        I agree to location capture
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </Card>

      <Card
        title="Where you are signed in"
        subtitle="Every device holding a session for your account"
        bodyClassName="p-0"
      >
        {sessions.loading && !sessions.data ? (
          <Spinner />
        ) : !sessions.data?.data.length ? (
          <EmptyState title="No sessions recorded" />
        ) : (
          <Table
            head={
              <tr>
                <th className="th">Device</th>
                <th className="th">Signed in</th>
                <th className="th">Last seen</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            }
          >
            {sessions.data.data.slice(0, 10).map((session) => (
              <tr key={session.id}>
                <td className="td">
                  <span className="font-medium text-slate-800">
                    {session.device} · {session.browser}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {session.os}
                    {session.ip ? ` · ${session.ip}` : ''}
                  </span>
                </td>
                <td className="td whitespace-nowrap">{formatDateTime(session.loginAt)}</td>
                <td className="td whitespace-nowrap">{relativeTime(session.lastSeenAt)}</td>
                <td className="td">
                  {session.isCurrent ? (
                    <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">This device</Badge>
                  ) : session.isActive ? (
                    <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Active</Badge>
                  ) : (
                    <Badge>{titleCase(session.endedReason ?? 'Ended')}</Badge>
                  )}
                </td>
                <td className="td text-right">
                  {session.isActive && !session.isCurrent && (
                    <Button size="sm" variant="ghost" loading={busy} onClick={() => void revoke(session.id)}>
                      Sign out
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
