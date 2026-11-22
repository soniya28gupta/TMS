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
  Textarea,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Paginated, Task, User } from '../../lib/types';

export default function AdminTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);

  // Select dropdowns
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // Create Task Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    assigneeId: '',
    departmentId: '',
    startDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    estimatedHours: '8',
  });

  const loadTasks = async () => {
    try {
      setLoading(true);
      const query = queryString({ search, status, priority, assigneeId, departmentId, page, pageSize: 15 });
      const res = await api.get<Paginated<Task>>(`/tasks${query}`);
      setTasks(res.data);
      setMeta(res.meta);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [search, status, priority, assigneeId, departmentId, page]);

  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [eRes, dRes] = await Promise.all([
          api.get<{ data: User[] }>('/employees?pageSize=100'),
          api.get<{ data: { id: string; name: string }[] }>('/org/departments'),
        ]);
        setEmployees(eRes.data || []);
        setDepartments(dRes.data || []);
      } catch (err) {
        // quiet fail
      }
    }
    loadDropdowns();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setFormError(null);
      await api.post('/tasks', {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined,
        assigneeId: form.assigneeId || undefined,
        departmentId: form.departmentId || undefined,
        startDate: form.startDate.trim() || undefined,
        dueDate: form.dueDate.trim() || undefined,
      });
      setCreateOpen(false);
      setForm({
        title: '',
        description: '',
        priority: 'MEDIUM',
        assigneeId: '',
        departmentId: '',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        estimatedHours: '8',
      });
      loadTasks();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'CRITICAL':
        return <Badge tone="bg-rose-100 text-rose-800 ring-rose-300">Critical</Badge>;
      case 'HIGH':
        return <Badge tone="bg-amber-100 text-amber-800 ring-amber-300">High</Badge>;
      case 'MEDIUM':
        return <Badge tone="bg-blue-100 text-blue-800 ring-blue-300">Medium</Badge>;
      default:
        return <Badge tone="bg-slate-100 text-slate-700 ring-slate-200">Low</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task Delegation & Management"
        description="Assign, track, reassign, and monitor progress across all organizational tasks and departments."
        actions={<Button onClick={() => setCreateOpen(true)}>+ Create & Assign Task</Button>}
      />

      {/* Filter Bar */}
      <Card bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Search by code, title..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED_FOR_REVIEW">Submitted For Review</option>
            <option value="CHANGES_REQUESTED">Changes Requested</option>
            <option value="COMPLETED">Completed</option>
            <option value="BLOCKED">Blocked</option>
            <option value="OVERDUE">Overdue</option>
          </Select>

          <Select
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>

          <Select
            value={assigneeId}
            onChange={(e) => {
              setAssigneeId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Assignees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName} ({e.employeeCode})
              </option>
            ))}
          </Select>

          <Button
            variant="secondary"
            onClick={() => {
              setSearch('');
              setStatus('');
              setPriority('');
              setAssigneeId('');
              setDepartmentId('');
              setPage(1);
            }}
          >
            Reset Filters
          </Button>
        </div>
      </Card>

      {/* Task Table */}
      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label="Fetching tasks..." />
        ) : error ? (
          <div className="p-4">
            <ErrorNote message={error} />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            title="No tasks found"
            description="No tasks match the filter criteria."
            action={<Button size="sm" onClick={() => setCreateOpen(true)}>Create Task</Button>}
          />
        ) : (
          <>
            <Table
              head={
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Code & Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Assignee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Due Date</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Action</th>
                </tr>
              }
            >
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-bold text-brand-600">{task.code}</span>
                    <Link
                      to={`/admin/tasks/${task.id}`}
                      className="block font-medium text-slate-900 hover:text-brand-600"
                    >
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {task.assignee ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={`${task.assignee.firstName} ${task.assignee.lastName}`} size="sm" />
                        <span>
                          {task.assignee.firstName} {task.assignee.lastName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{getPriorityBadge(task.priority)}</td>
                  <td className="px-4 py-3 text-xs">
                    <div className="w-24">
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>{task.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200">
                        <div
                          className="h-1.5 rounded-full bg-brand-600 transition-all"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Badge tone="bg-slate-100 text-slate-800 ring-slate-200">
                      {task.displayStatus || task.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                    {task.isOverdue && <span className="ml-1 font-bold text-rose-600">(Overdue)</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <Link
                      to={`/admin/tasks/${task.id}`}
                      className="font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Details & Review →
                    </Link>
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

      {/* Create Task Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create & Assign New Task"
        description="Task will be automatically added to the employee's Start of Day (SOD) queue."
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={submitting} onClick={handleCreateSubmit}>
              Assign Task
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && <ErrorNote message={formError} />}
          <Field label="Task Title" required>
            <Input
              required
              placeholder="e.g. Implement SOD export feature"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Description / Instructions">
            <Textarea
              rows={3}
              placeholder="Detailed instructions, deliverables, requirements..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assignee Employee">
              <Select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                <option value="">Unassigned (Open pool)</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.employeeCode})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Priority Level">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </Field>

            <Field label="Start Date">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </Field>

            <Field label="Due Date / Deadline">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>

            <Field label="Estimated Hours">
              <Input
                type="number"
                step="0.5"
                value={form.estimatedHours}
                onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })}
              />
            </Field>

            <Field label="Department">
              <Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
