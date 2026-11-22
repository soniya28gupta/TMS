import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/Layout';
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
  Pagination,
  Select,
  Spinner,
  Table,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { formatDate, titleCase } from '../../lib/format';
import type { Paginated, Role, User, HireableResponse, Position } from '../../lib/types';

/** titleCase() would render "IC" as "Ic", so spell the bands out. */
const BAND_LABELS: Record<string, string> = {
  EXECUTIVE: 'Executive',
  MANAGEMENT: 'Management',
  LEAD: 'Leads',
  IC: 'Individual contributors',
};

export default function Employees() {
  const [employees, setEmployees] = useState<User[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);

  // Dropdown lists
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [hireable, setHireable] = useState<HireableResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdSuccess, setCreatedSuccess] = useState<{
    email: string;
    name: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    employeeCode: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    roleId: '',
    positionId: '',
    managerId: '',
    departmentId: '',
    designation: '',
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const query = queryString({ search, departmentId, roleId, status, page, pageSize: 15 });
      const res = await api.get<Paginated<User>>(`/employees${query}`);
      setEmployees(res.data);
      setMeta(res.meta);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch employee records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, departmentId, roleId, status, page]);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [rRes, dRes] = await Promise.all([
          api.get<{ data: Role[] }>('/org/roles'),
          api.get<{ data: { id: string; name: string }[] }>('/org/departments'),
        ]);
        setRoles(rRes.data || []);
        setDepartments(dRes.data || []);
        if (rRes.data.length > 0 && !form.roleId) {
          setForm((f) => ({ ...f, roleId: rRes.data[0].id }));
        }
      } catch (err) {
        // ignore setup load failures
      }
    }
    loadOptions();
  }, []);

  // Loaded when the modal opens rather than on mount: the answer depends on
  // who is signed in, and it is only needed for the create flow.
  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    api
      .get<HireableResponse>('/positions/hireable')
      .then((res) => {
        if (cancelled) return;
        setHireable(res);
        // Preselect the most junior option — the usual case when hiring.
        if (res.data.length) {
          setForm((f) => (f.positionId ? f : { ...f, positionId: res.data[res.data.length - 1].id }));
        }
      })
      .catch((err) => !cancelled && setFormError(err.message ?? 'Could not load positions'));
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setFormError(null);
      const payload = {
        ...form,
        employeeCode: form.employeeCode.trim() || undefined,
        departmentId: form.departmentId.trim() || undefined,
        managerId: form.managerId.trim() || undefined,
        designation: form.designation.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password.trim() || undefined,
      };
      const res = await api.post<{ data: User; initialPassword?: string; temporaryPassword?: string }>('/employees', payload);
      const initialPass = res.initialPassword || res.temporaryPassword || form.password.trim() || 'TradeAmplification@123';
      setCreateOpen(false);
      setCreatedSuccess({
        email: form.email.trim(),
        name: `${form.firstName.trim()} ${form.lastName.trim()}`,
        password: initialPass,
      });
      setForm({
        employeeCode: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        roleId: roles[0]?.id || '',
        positionId: '',
        managerId: '',
        departmentId: '',
        designation: '',
        employmentType: 'FULL_TIME',
        workMode: 'ONSITE',
      });
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create employee');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Directory"
        description="Manage employee accounts, designations, roles, departments, and active statuses across the organization."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            + Add Employee
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Search by name, email or code..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>

          <Select
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>

          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="ACTIVE">Active Employees</option>
            <option value="INACTIVE">Inactive Employees</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="">All Statuses</option>
          </Select>

          <Button
            variant="secondary"
            onClick={() => {
              setSearch('');
              setDepartmentId('');
              setRoleId('');
              setStatus('ACTIVE');
              setPage(1);
            }}
          >
            Reset Filters
          </Button>
        </div>
      </Card>

      {/* Main Table */}
      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label="Loading employees..." />
        ) : error ? (
          <div className="p-4">
            <ErrorNote message={error} />
          </div>
        ) : employees.length === 0 ? (
          <EmptyState
            title="No employees found"
            description="No employees match your search query or filters."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Add First Employee
              </Button>
            }
          />
        ) : (
          <>
            <Table
              head={
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Department & Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Work Mode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Action</th>
                </tr>
              }
            >
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${emp.firstName} ${emp.lastName}`} />
                      <div>
                        <Link
                          to={`/admin/employees/${emp.id}`}
                          className="font-medium text-slate-900 hover:text-brand-600"
                        >
                          {emp.firstName} {emp.lastName}
                        </Link>
                        <p className="text-xs text-slate-500">{emp.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono font-medium text-slate-600">{emp.employeeCode}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    <p className="font-semibold text-slate-800">{emp.department?.name || 'Unassigned'}</p>
                    <p className="text-slate-500">{emp.designation || 'Staff'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Badge tone="bg-slate-100 text-slate-800 ring-slate-200">{emp.role.name}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-600">{emp.workMode}</td>
                  <td className="px-4 py-3 text-xs">
                    {emp.status === 'ACTIVE' ? (
                      <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Active</Badge>
                    ) : (
                      <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">{emp.status}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/admin/employees/${emp.id}`}
                        className="font-semibold text-brand-600 hover:text-brand-700"
                      >
                        View & Edit
                      </Link>
                      <button
                        onClick={async () => {
                          if (window.confirm(`Are you sure you want to permanently delete employee ${emp.firstName} ${emp.lastName}?`)) {
                            try {
                              await api.delete(`/employees/${emp.id}`);
                              loadData();
                            } catch (err: any) {
                              alert(err.message || 'Failed to delete employee');
                            }
                          }
                        }}
                        className="font-semibold text-rose-600 hover:text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              onChange={(p) => setPage(p)}
            />
          </>
        )}
      </Card>

      {/* Create Employee Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add New Employee"
        description="Create a new employee account and set their role and position."
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={submitting} onClick={handleCreateSubmit}>
              Create Employee
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && <ErrorNote message={formError} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee Code" required hint="e.g. EMP-0012">
              <Input
                required
                value={form.employeeCode}
                onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
              />
            </Field>
            <Field label="Work Email Address" required>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="First Name" required>
              <Input
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
            <Field label="Last Name" required>
              <Input
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
            <Field label="Role" required>
              <Select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.portal})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Department">
              <Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">No Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Position"
              required
              hint={
                hireable?.myPosition
                  ? `You hold ${hireable.myPosition.title} — you can add anyone below it.`
                  : hireable?.isSystemAdmin
                    ? 'System administrators can assign any position.'
                    : undefined
              }
              error={hireable && hireable.data.length === 0 ? hireable.reason : undefined}
            >
              <Select
                value={form.positionId}
                onChange={(e) => setForm({ ...form, positionId: e.target.value })}
                disabled={!hireable?.data.length}
              >
                <option value="">Select a position…</option>
                {Object.entries(
                  (hireable?.data ?? []).reduce<Record<string, Position[]>>((groups, p) => {
                    (groups[p.band] ??= []).push(p);
                    return groups;
                  }, {}),
                ).map(([band, list]) => (
                  <optgroup key={band} label={BAND_LABELS[band] ?? titleCase(band)}>
                    {list.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                        {p.department ? ` · ${p.department.name}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>

            <Field label="Phone Number">
              <Input
                placeholder="+1 555-0199"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Employment Type">
              <Select
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
              >
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </Select>
            </Field>
            <Field label="Work Mode">
              <Select value={form.workMode} onChange={(e) => setForm({ ...form, workMode: e.target.value })}>
                <option value="ONSITE">Onsite</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
              </Select>
            </Field>
            <Field
              label="Initial Login Password (Optional)"
              hint="Leave empty to use default: TradeAmplification@123"
            >
              <Input
                type="text"
                placeholder="TradeAmplification@123"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
          </div>
        </form>
      </Modal>

      {/* Account Created Success Modal with Credentials */}
      {createdSuccess && (
        <Modal
          open={!!createdSuccess}
          onClose={() => {
            setCreatedSuccess(null);
            setCopied(false);
          }}
          title="🎉 Employee Account Ready!"
          description="The employee account has been created and can log in immediately."
          footer={
            <Button
              onClick={() => {
                setCreatedSuccess(null);
                setCopied(false);
              }}
            >
              Done
            </Button>
          }
        >
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <p className="text-sm font-bold mb-3 text-emerald-900">Login Credentials for {createdSuccess.name}:</p>
              <div className="space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between bg-white p-2.5 rounded border border-emerald-100">
                  <span className="text-slate-500 font-sans">Login Email:</span>
                  <span className="font-bold text-slate-900">{createdSuccess.email}</span>
                </div>
                <div className="flex items-center justify-between bg-white p-2.5 rounded border border-emerald-100">
                  <span className="text-slate-500 font-sans">Initial Password:</span>
                  <span className="font-bold text-emerald-700 select-all">{createdSuccess.password}</span>
                </div>
              </div>
            </div>

            <Button
              variant="secondary"
              className="w-full justify-center"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Login Portal: https://task-management-system-nine-rouge.vercel.app/login\nEmail: ${createdSuccess.email}\nPassword: ${createdSuccess.password}`
                );
                setCopied(true);
              }}
            >
              {copied ? '✔ Copied to Clipboard!' : '📋 Copy Login Details to Clipboard'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
