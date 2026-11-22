import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  InfoNote,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  cx,
} from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { useAuth } from '../../../lib/auth';
import type { PermissionCatalogue, Role } from '../../../lib/types';

type RolesResponse = { data: Role[]; catalogue: PermissionCatalogue };

const SCOPE_SUFFIXES = ['own', 'team', 'reports', 'department', 'all'];

/** Splits `task.read.team` into its base and scope for compact display. */
function splitPermission(key: string): { base: string; scope: string | null } {
  const parts = key.split('.');
  const last = parts[parts.length - 1];
  if (SCOPE_SUFFIXES.includes(last)) {
    return { base: parts.slice(0, -1).join('.'), scope: last };
  }
  return { base: key, scope: null };
}

/**
 * The editable RBAC matrix. Permissions are rows in the database, so changing
 * one here changes what a role can do immediately — no deploy.
 */
export default function RolesTab() {
  const { user, refreshUser } = useAuth();
  const { data, loading, error, reload } = useApi<RolesResponse>('/org/roles');
  const action = useAction();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const roles = data?.data ?? [];
  const selected = roles.find((role) => role.id === selectedId) ?? roles[0] ?? null;

  useEffect(() => {
    if (selected) setDraft(new Set(selected.permissions ?? []));
  }, [selected?.id, data]);

  const isWildcard = draft.has('*');
  const dirty = useMemo(() => {
    const original = new Set(selected?.permissions ?? []);
    if (original.size !== draft.size) return true;
    for (const key of draft) if (!original.has(key)) return true;
    return false;
  }, [draft, selected]);

  const toggle = (key: string) =>
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleGroup = (keys: string[], on: boolean) =>
    setDraft((current) => {
      const next = new Set(current);
      keys.forEach((key) => (on ? next.add(key) : next.delete(key)));
      return next;
    });

  const save = async () => {
    if (!selected) return;
    const result = await action.run(() =>
      api.patch(`/org/roles/${selected.id}`, { permissions: [...draft] }),
    );
    if (result) {
      setSaved(true);
      reload();
      // The signed-in user may have just changed their own abilities.
      await refreshUser();
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card title="Roles" bodyClassName="p-0" actions={<Button size="sm" onClick={() => setCreateOpen(true)}>New</Button>}>
        <ul className="divide-y divide-slate-100">
          {roles.map((role) => (
            <li key={role.id}>
              <button
                onClick={() => setSelectedId(role.id)}
                className={cx(
                  'w-full px-4 py-3 text-left transition',
                  selected?.id === role.id ? 'bg-brand-50' : 'hover:bg-slate-50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{role.name}</span>
                  {role.isSystem && <Badge>System</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {role.portal === 'ADMIN' ? 'Admin portal' : 'Employee portal'} ·{' '}
                  {role.userCount ?? 0} user{role.userCount === 1 ? '' : 's'} ·{' '}
                  {role.permissions?.includes('*') ? 'all' : (role.permissions?.length ?? 0)} perms
                </p>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-4">
        {!selected ? (
          <Card>
            <EmptyState title="Select a role" />
          </Card>
        ) : (
          <>
            <Card
              title={`${selected.name} — permissions`}
              subtitle={selected.description ?? undefined}
              actions={
                <>
                  {dirty && <span className="text-xs font-medium text-amber-600">Unsaved changes</span>}
                  <Button size="sm" loading={action.busy} disabled={!dirty} onClick={() => void save()}>
                    Save permissions
                  </Button>
                </>
              }
            >
              {action.error && <div className="mb-3"><ErrorNote message={action.error} /></div>}
              {saved && <div className="mb-3"><InfoNote>Permissions updated.</InfoNote></div>}

              {isWildcard ? (
                <InfoNote tone="amber">
                  This role holds the <code className="font-mono">*</code> wildcard — unrestricted
                  access to every module. It cannot be reduced, so the system can never lock itself
                  out. Create a separate role if you need a narrower administrator.
                </InfoNote>
              ) : (
                <>
                  <InfoNote tone="slate">
                    Scopes decide <em>whose</em> data an action reaches:{' '}
                    <strong>own</strong> → self only, <strong>team</strong> → their teams,{' '}
                    <strong>reports</strong> → their whole reporting line,{' '}
                    <strong>department</strong>, <strong>all</strong> → everyone. The widest one
                    granted wins.
                  </InfoNote>

                  <div className="mt-4 space-y-5">
                    {(data?.catalogue ?? []).map((group) => {
                      const keys = group.items.map((item) => item.key);
                      const allOn = keys.every((key) => draft.has(key));

                      return (
                        <section key={group.group}>
                          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-1.5">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {group.group}
                            </h3>
                            <button
                              onClick={() => toggleGroup(keys, !allOn)}
                              className="text-xs font-medium text-brand-600 hover:underline"
                            >
                              {allOn ? 'Clear all' : 'Select all'}
                            </button>
                          </div>

                          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                            {group.items.map((item) => {
                              const { scope } = splitPermission(item.key);
                              const on = draft.has(item.key);
                              return (
                                <label
                                  key={item.key}
                                  className={cx(
                                    'flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm transition',
                                    on
                                      ? 'border-brand-200 bg-brand-50/60'
                                      : 'border-slate-200 hover:bg-slate-50',
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => toggle(item.key)}
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-slate-700">{item.label}</span>
                                    <span className="block truncate font-mono text-[10px] text-slate-400">
                                      {item.key}
                                    </span>
                                  </span>
                                  {scope && (
                                    <Badge className="ml-auto shrink-0" tone="bg-slate-100 text-slate-600 ring-slate-200">
                                      {scope}
                                    </Badge>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>

            <Card title="Role details">
              <dl className="grid gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="label mb-0.5">Key</dt>
                  <dd className="font-mono text-xs text-slate-700">{selected.key}</dd>
                </div>
                <div>
                  <dt className="label mb-0.5">Portal</dt>
                  <dd className="text-slate-700">{selected.portal}</dd>
                </div>
                <div>
                  <dt className="label mb-0.5">Rank</dt>
                  <dd className="text-slate-700">{selected.rank ?? '—'}</dd>
                </div>
                <div>
                  <dt className="label mb-0.5">Assigned to</dt>
                  <dd className="text-slate-700">{selected.userCount ?? 0} employee(s)</dd>
                </div>
              </dl>
              {selected.isSystem && (
                <p className="mt-3 text-xs text-slate-500">
                  System roles cannot be deleted, but their permissions can be tuned.
                </p>
              )}
            </Card>
          </>
        )}
      </div>

      <CreateRoleModal
        open={createOpen}
        catalogue={data?.catalogue ?? []}
        onClose={() => setCreateOpen(false)}
        onDone={() => {
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateRoleModal({
  open,
  catalogue,
  onClose,
  onDone,
}: {
  open: boolean;
  catalogue: PermissionCatalogue;
  onClose: () => void;
  onDone: () => void;
}) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState({
    key: '',
    name: '',
    description: '',
    portal: 'ADMIN' as 'ADMIN' | 'EMPLOYEE',
    rank: 50,
  });
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const submit = async () => {
    const result = await run(() =>
      api.post('/org/roles', { ...form, permissions: [...permissions] }),
    );
    if (result) {
      setForm({ key: '', name: '', description: '', portal: 'ADMIN', rank: 50 });
      setPermissions(new Set());
      onDone();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Create a role"
      description="Start from nothing and grant only what this role needs."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!form.key.trim() || !form.name.trim()} onClick={() => void submit()}>
            Create role
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorNote message={error} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Key" required hint="UPPER_SNAKE_CASE, e.g. REGIONAL_MANAGER">
            <Input
              value={form.key}
              onChange={(event) => setForm({ ...form, key: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
            />
          </Field>
          <Field label="Display name" required>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Portal">
            <Select
              value={form.portal}
              onChange={(event) => setForm({ ...form, portal: event.target.value as 'ADMIN' | 'EMPLOYEE' })}
            >
              <option value="ADMIN">Admin portal</option>
              <option value="EMPLOYEE">Employee portal</option>
            </Select>
          </Field>
          <Field label="Rank" hint="Lower is more senior.">
            <Input
              type="number"
              min={0}
              max={999}
              value={form.rank}
              onChange={(event) => setForm({ ...form, rank: Number(event.target.value) })}
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div>
          <p className="label">Permissions ({permissions.size} selected)</p>
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {catalogue.map((group) => (
              <div key={group.group}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {group.group}
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <label key={item.key} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={permissions.has(item.key)}
                        onChange={() =>
                          setPermissions((current) => {
                            const next = new Set(current);
                            if (next.has(item.key)) next.delete(item.key);
                            else next.add(item.key);
                            return next;
                          })
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
