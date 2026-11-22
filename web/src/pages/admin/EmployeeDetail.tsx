import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/Layout';
import { Avatar, Badge, Button, Card, ErrorNote, Field, Input, Modal, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Eod, Sod, Task, User } from '../../lib/types';

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sodHistory, setSodHistory] = useState<Sod[]>([]);
  const [eodHistory, setEodHistory] = useState<Eod[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'tasks' | 'history'>('profile');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit State
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    designation: '',
    phone: '',
    workMode: 'ONSITE',
    status: 'ACTIVE',
  });

  const loadAll = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [empRes, taskRes, sodRes, eodRes] = await Promise.all([
        api.get<any>(`/employees/${id}`),
        api.get<{ data: Task[] }>(`/tasks?assigneeId=${id}&pageSize=20`),
        api.get<{ data: Sod[] }>(`/sod/history?userId=${id}&pageSize=10`),
        api.get<{ data: Eod[] }>(`/eod/history?userId=${id}&pageSize=10`),
      ]);
      const empData: User = empRes?.data || empRes;
      setEmployee(empData);
      setForm({
        firstName: empData.firstName || '',
        lastName: empData.lastName || '',
        designation: empData.designation || '',
        phone: empData.phone || '',
        workMode: empData.workMode || 'ONSITE',
        status: empData.status || 'ACTIVE',
      });
      setTasks(taskRes.data || []);
      setSodHistory(sodRes.data || []);
      setEodHistory(eodRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch employee details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    try {
      setSaving(true);
      const updated = await api.patch<any>(`/employees/${id}`, form);
      const empData: User = updated?.data || updated;
      setEmployee(empData);
      setEditing(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      setDeleting(true);
      await api.delete(`/employees/${id}`);
      navigate('/admin/employees');
    } catch (err: any) {
      alert(err.message || 'Failed to delete employee');
      setDeleting(false);
    }
  };

  if (loading) return <Spinner label="Loading employee record..." />;
  if (error) return <ErrorNote message={error} />;
  if (!employee) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${employee.firstName || ''} ${employee.lastName || ''}`}
        description={`${employee.employeeCode || ''} · ${employee.designation || 'Staff'} · ${
          employee.department?.name || 'No Department'
        }`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant={editing ? 'secondary' : 'primary'} onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel Editing' : 'Edit Employee'}
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete Employee
            </Button>
          </div>
        }
      />

      {/* Header Profile Summary */}
      <Card bodyClassName="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={`${employee.firstName} ${employee.lastName}`} size="md" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {employee.firstName} {employee.lastName}
              </h2>
              <p className="text-xs text-slate-500">{employee.email} · {employee.phone || 'No phone'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">{employee.role.name}</Badge>
            <Badge tone="bg-slate-100 text-slate-800 ring-slate-200">{employee.workMode}</Badge>
            <Badge tone={employee.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}>
              {employee.status}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('profile')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'profile'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Profile Details
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'tasks'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Assigned Tasks ({tasks.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'history'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Daily Work History (SOD/EOD Audit)
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <Card title="Employment & Personal Details">
          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First Name" required>
                  <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </Field>
                <Field label="Last Name" required>
                  <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </Field>
                <Field label="Designation">
                  <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field label="Work Mode">
                  <Select value={form.workMode} onChange={(e) => setForm({ ...form, workMode: e.target.value })}>
                    <option value="ONSITE">Onsite</option>
                    <option value="REMOTE">Remote</option>
                    <option value="HYBRID">Hybrid</option>
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="SUSPENDED">Suspended</option>
                  </Select>
                </Field>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button loading={saving} onClick={handleSave}>
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">Employee Code</p>
                <p className="text-sm font-semibold text-slate-900">{employee.employeeCode}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Email Address</p>
                <p className="text-sm font-semibold text-slate-900">{employee.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Department</p>
                <p className="text-sm font-semibold text-slate-900">{employee.department?.name || 'Unassigned'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Role</p>
                <p className="text-sm font-semibold text-slate-900">{employee.role.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Manager</p>
                <p className="text-sm font-semibold text-slate-900">
                  {employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : 'No Manager'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Shift Schedule</p>
                <p className="text-sm font-semibold text-slate-900">
                  {employee.shiftStart} - {employee.shiftEnd}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Employment Type</p>
                <p className="text-sm font-semibold text-slate-900">{employee.employmentType}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Date of Joining</p>
                <p className="text-sm font-semibold text-slate-900">
                  {employee.dateOfJoining ? formatDate(employee.dateOfJoining) : 'N/A'}
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <Card title="Assigned Tasks History">
          {tasks.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">No tasks assigned to this employee.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-xs font-mono font-semibold text-brand-600">{task.code}</span>
                    <h4 className="text-sm font-medium text-slate-900">{task.title}</h4>
                    <p className="text-xs text-slate-500">
                      Priority: {task.priority} · Due: {task.dueDate ? formatDate(task.dueDate) : 'No deadline'}
                    </p>
                  </div>
                  <Badge tone="bg-slate-100 text-slate-800 ring-slate-200">{task.displayStatus || task.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Work History Audit Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <Card title="Start of Day (SOD) Submissions">
            {sodHistory.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">No SOD submissions on record.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {sodHistory.map((sod) => (
                  <div key={sod.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">{formatDate(sod.date)}</span>
                      <Badge tone={sod.status === 'SUBMITTED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}>
                        {sod.status}
                      </Badge>
                    </div>
                    {sod.plannedNote && <p className="mt-1 text-xs text-slate-600">Note: {sod.plannedNote}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {sod.items?.length || 0} planned task items acknowledged
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="End of Day (EOD) Work Records">
            {eodHistory.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">No EOD work submissions on record.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {eodHistory.map((eod) => (
                  <div key={eod.id} className="py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">{formatDate(eod.date)}</span>
                      <Badge tone={eod.status === 'REVIEWED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-violet-50 text-violet-700 ring-violet-200'}>
                        {eod.status}
                      </Badge>
                    </div>
                    {eod.workSummary && <p className="text-xs text-slate-700 font-medium">Summary: {eod.workSummary}</p>}
                    {eod.blockers && <p className="text-xs text-rose-600 font-medium">Blockers: {eod.blockers}</p>}
                    {eod.nextDayPlan && <p className="text-xs text-slate-500">Next Plan: {eod.nextDayPlan}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Danger Zone */}
      <Card title="Danger Zone" subtitle="Permanent employee deletion and account removal">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Delete this Employee Account</p>
            <p className="text-xs text-slate-500">
              Permanently remove this employee, revoke all active sessions, and reassign reporting lines.
            </p>
          </div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Delete Employee
          </Button>
        </div>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Confirm Employee Deletion"
        description="This action cannot be undone. Are you sure you want to delete this employee account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>
              Confirm & Delete
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-2 text-sm text-slate-700">
          <p>
            You are about to permanently delete <strong>{employee.firstName} {employee.lastName}</strong> ({employee.employeeCode}).
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs text-slate-500">
            <li>All active sessions and tokens will be instantly revoked.</li>
            <li>Subordinate direct reports will be reassigned up the hierarchy.</li>
            <li>Historical daily SOD/EOD and attendance records for this user will be cleared.</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}
