import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  Textarea,
} from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { useAuth } from '../../../lib/auth';
import type { Department, Team } from '../../../lib/types';

type EmployeeOption = { id: string; name: string; employeeCode: string };

export default function OrgTab() {
  const { can } = useAuth();
  const departments = useApi<{ data: Department[] }>('/org/departments');
  const teams = useApi<{ data: Team[] }>('/org/teams');
  const people = useApi<{ data: EmployeeOption[] }>('/employees/options');

  const [deptOpen, setDeptOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  const canManage = can('org.manage');

  return (
    <div className="space-y-4">
      <Card
        title="Departments"
        subtitle="The structural organisation, separate from the reporting chain"
        actions={canManage && <Button size="sm" onClick={() => setDeptOpen(true)}>Add department</Button>}
        bodyClassName="p-0"
      >
        {departments.loading && !departments.data ? (
          <Spinner />
        ) : departments.error ? (
          <div className="p-4"><ErrorNote message={departments.error} /></div>
        ) : !departments.data?.data.length ? (
          <EmptyState title="No departments yet" />
        ) : (
          <Table
            head={
              <tr>
                <th className="th">Department</th>
                <th className="th">Code</th>
                <th className="th">Head</th>
                <th className="th">Employees</th>
                <th className="th">Teams</th>
                <th className="th">Status</th>
              </tr>
            }
          >
            {departments.data.data.map((dept) => (
              <tr key={dept.id}>
                <td className="td font-medium text-slate-800">{dept.name}</td>
                <td className="td font-mono text-xs">{dept.code}</td>
                <td className="td">
                  {dept.head ? `${dept.head.firstName} ${dept.head.lastName}` : <span className="text-slate-400">—</span>}
                </td>
                <td className="td tabular-nums">{dept._count?.users ?? 0}</td>
                <td className="td tabular-nums">{dept._count?.teams ?? 0}</td>
                <td className="td">
                  <Badge
                    tone={dept.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}
                  >
                    {dept.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Teams"
        actions={canManage && <Button size="sm" onClick={() => setTeamOpen(true)}>Add team</Button>}
        bodyClassName="p-0"
      >
        {teams.loading && !teams.data ? (
          <Spinner />
        ) : !teams.data?.data.length ? (
          <EmptyState title="No teams yet" description="Teams group people for assignment and review." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {teams.data.data.map((team) => (
              <li key={team.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{team.name}</span>
                  {team.department && <Badge>{team.department.name}</Badge>}
                  {team.leader && (
                    <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">
                      Lead: {team.leader.firstName} {team.leader.lastName}
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-slate-500">
                    {team.members.length} member{team.members.length === 1 ? '' : 's'}
                  </span>
                </div>
                {team.description && <p className="mt-1 text-xs text-slate-500">{team.description}</p>}
                {team.members.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {team.members.map((member) => (
                      <span
                        key={member.id}
                        className="flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2.5 text-xs text-slate-700"
                      >
                        <Avatar size="sm" name={`${member.user.firstName} ${member.user.lastName}`} />
                        {member.user.firstName} {member.user.lastName}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DepartmentModal
        open={deptOpen}
        people={people.data?.data ?? []}
        onClose={() => setDeptOpen(false)}
        onDone={() => {
          setDeptOpen(false);
          departments.reload();
        }}
      />
      <TeamModal
        open={teamOpen}
        departments={departments.data?.data ?? []}
        people={people.data?.data ?? []}
        onClose={() => setTeamOpen(false)}
        onDone={() => {
          setTeamOpen(false);
          teams.reload();
          departments.reload();
        }}
      />
    </div>
  );
}

function DepartmentModal({
  open,
  people,
  onClose,
  onDone,
}: {
  open: boolean;
  people: EmployeeOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState({ name: '', code: '', description: '', headId: '' });

  const submit = async () => {
    const result = await run(() =>
      api.post('/org/departments', {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || undefined,
        headId: form.headId || undefined,
      }),
    );
    if (result) {
      setForm({ name: '', code: '', description: '', headId: '' });
      onDone();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add department"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={form.name.trim().length < 2 || form.code.trim().length < 2} onClick={() => void submit()}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorNote message={error} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Code" required hint="Short, e.g. ENG">
            <Input
              value={form.code}
              maxLength={10}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
            />
          </Field>
        </div>
        <Field label="Head of department">
          <Select value={form.headId} onChange={(event) => setForm({ ...form, headId: event.target.value })}>
            <option value="">Not set</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.employeeCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function TeamModal({
  open,
  departments,
  people,
  onClose,
  onDone,
}: {
  open: boolean;
  departments: Department[];
  people: EmployeeOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState({ name: '', departmentId: '', description: '', leaderId: '' });
  const [members, setMembers] = useState<Set<string>>(new Set());

  const submit = async () => {
    const result = await run(() =>
      api.post('/org/teams', {
        name: form.name.trim(),
        departmentId: form.departmentId,
        description: form.description.trim() || undefined,
        leaderId: form.leaderId || undefined,
        memberIds: [...members],
      }),
    );
    if (result) {
      setForm({ name: '', departmentId: '', description: '', leaderId: '' });
      setMembers(new Set());
      onDone();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add team"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={form.name.trim().length < 2 || !form.departmentId} onClick={() => void submit()}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorNote message={error} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Team name" required>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Department" required>
            <Select value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>
              <option value="">Select…</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Team leader">
          <Select value={form.leaderId} onChange={(event) => setForm({ ...form, leaderId: event.target.value })}>
            <option value="">Not set</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.employeeCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>
        <div>
          <p className="label">Members ({members.size} selected)</p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {people.map((person) => (
              <label key={person.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={members.has(person.id)}
                  onChange={() =>
                    setMembers((current) => {
                      const next = new Set(current);
                      if (next.has(person.id)) next.delete(person.id);
                      else next.add(person.id);
                      return next;
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
                />
                {person.name}
                <span className="text-xs text-slate-400">{person.employeeCode}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
