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
  ProgressBar,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { formatDate, PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import type { Paginated, Project, User } from '../../lib/types';

interface ProjectStats {
  total: number;
  notStarted: number;
  planning: number;
  inProgress: number;
  onHold: number;
  underReview: number;
  completed: number;
  rejected: number;
  pendingApprovals: number;
}

export default function Projects() {
  const { user, can } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [meta, setMeta] = useState({ page: 1, pageSize: 12, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);

  // Create Project Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    departmentId: '',
    managerId: user?.id || '',
    startDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    status: 'NOT_STARTED',
    progress: 0,
  });

  const canCreate =
    can('*') ||
    ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'TEAM_LEAD'].includes(user?.role.key || '');

  const isManagement =
    can('*') ||
    ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'].includes(user?.role.key || '');

  const loadStats = async () => {
    try {
      const res = await api.get<ProjectStats>('/projects/stats');
      setStats(res);
    } catch {
      // ignore
    }
  };

  const loadProjects = async () => {
    try {
      setLoading(true);
      const query = queryString({ search, status, departmentId, page, pageSize: 12 });
      const res = await api.get<Paginated<Project>>(`/projects${query}`);
      setProjects(res.data || []);
      setMeta(res.meta);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    loadStats();
  }, [search, status, departmentId, page]);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [eRes, dRes] = await Promise.all([
          api.get<{ data: User[] }>('/employees?pageSize=100'),
          api.get<{ data: { id: string; name: string }[] }>('/org/departments'),
        ]);
        setEmployees(eRes.data || []);
        setDepartments(dRes.data || []);
      } catch {
        // ignore
      }
    }
    if (canCreate) loadOptions();
  }, [canCreate]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await api.post('/projects', {
        ...form,
        managerId: form.managerId || user?.id,
        departmentId: form.departmentId || user?.department?.id,
      });
      setCreateOpen(false);
      setForm({
        name: '',
        description: '',
        departmentId: '',
        managerId: user?.id || '',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        status: 'NOT_STARTED',
        progress: 0,
      });
      loadProjects();
      loadStats();
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (st: string) => {
    const label = PROJECT_STATUS_LABELS[st] || st;
    const tone = PROJECT_STATUS_STYLES[st] || 'bg-slate-100 text-slate-700 ring-slate-200';
    return <Badge tone={tone}>{label}</Badge>;
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'text-emerald-600';
    if (pct >= 70) return 'text-indigo-600';
    if (pct >= 30) return 'text-amber-600';
    return 'text-slate-600';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Management & Progress Tracking"
        description="Comprehensive project spaces, manual progress tracking, daily/weekly status updates, file attachments, and management approvals."
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>+ Create Project</Button>
          ) : undefined
        }
      />

      {/* Admin / Management Project Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <div
            onClick={() => {
              setStatus('');
              setPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition ${
              status === ''
                ? 'border-brand-500 bg-brand-50/50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-xs font-medium text-slate-500">Total Projects</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>

          <div
            onClick={() => {
              setStatus('NOT_STARTED');
              setPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition ${
              status === 'NOT_STARTED'
                ? 'border-slate-500 bg-slate-100 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-xs font-medium text-slate-500">Not Started</p>
            <p className="mt-1 text-2xl font-bold text-slate-700">{stats.notStarted}</p>
          </div>

          <div
            onClick={() => {
              setStatus('IN_PROGRESS');
              setPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition ${
              status === 'IN_PROGRESS'
                ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-xs font-medium text-indigo-700">In Progress</p>
            <p className="mt-1 text-2xl font-bold text-indigo-700">{stats.inProgress}</p>
          </div>

          <div
            onClick={() => {
              setStatus('ON_HOLD');
              setPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition ${
              status === 'ON_HOLD'
                ? 'border-amber-500 bg-amber-50/50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-xs font-medium text-amber-700">On Hold</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{stats.onHold}</p>
          </div>

          <div
            onClick={() => {
              setStatus('UNDER_REVIEW');
              setPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition ${
              status === 'UNDER_REVIEW'
                ? 'border-purple-500 bg-purple-50/50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-purple-700">Under Review</p>
              {stats.underReview > 0 && (
                <span className="inline-flex h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
              )}
            </div>
            <p className="mt-1 text-2xl font-bold text-purple-700">{stats.underReview}</p>
          </div>

          <div
            onClick={() => {
              setStatus('COMPLETED');
              setPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition ${
              status === 'COMPLETED'
                ? 'border-emerald-500 bg-emerald-50/50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-xs font-medium text-emerald-700">Completed</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.completed}</p>
          </div>

          <div
            onClick={() => {
              setStatus('UNDER_REVIEW');
              setPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition ${
              stats.pendingApprovals > 0
                ? 'border-amber-400 bg-amber-50/70 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-xs font-medium text-amber-800">Pending Approvals</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{stats.pendingApprovals}</p>
          </div>
        </div>
      )}

      {/* Pending Approvals Notice for Management */}
      {isManagement && stats && stats.pendingApprovals > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800 font-bold text-base">
              !
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {stats.pendingApprovals} Project Submission{stats.pendingApprovals > 1 ? 's' : ''} Awaiting Management Approval
              </p>
              <p className="text-xs text-amber-700">
                Employees have submitted final deliverables and project summaries for review.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            onClick={() => {
              setStatus('UNDER_REVIEW');
              setPage(1);
            }}
          >
            Review Submissions ({stats.pendingApprovals})
          </Button>
        </div>
      )}

      {/* Filter Bar */}
      <Card bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search projects by name, code, or description..."
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
            <option value="">All Project Statuses</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="PLANNING">Planning</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="COMPLETED">Completed</option>
            <option value="REJECTED">Rejected</option>
          </Select>

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

          <Button
            variant="secondary"
            onClick={() => {
              setSearch('');
              setStatus('');
              setDepartmentId('');
              setPage(1);
            }}
          >
            Reset Filters
          </Button>
        </div>
      </Card>

      {/* Project Grid */}
      {loading ? (
        <Spinner label="Loading projects..." />
      ) : error ? (
        <ErrorNote message={error} />
      ) : projects.length === 0 ? (
        <Card bodyClassName="p-0">
          <EmptyState
            title="No projects found"
            description="No projects match your current filters. Adjust your search or create a new project."
            action={
              canCreate ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  Create Project
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((prj) => {
            const progress = prj.progress ?? 0;
            const taskCount = prj._count?.tasks ?? prj.counts?.tasks ?? 0;
            const memberCount = prj._count?.members ?? prj.members?.length ?? 0;
            const updateCount = prj._count?.progressUpdates ?? 0;
            const fileCount = prj._count?.attachments ?? 0;

            return (
              <Card
                key={prj.id}
                className="flex flex-col justify-between transition hover:border-brand-300 hover:shadow-md"
                bodyClassName="p-5 flex flex-col justify-between h-full"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-brand-600">{prj.code}</span>
                    {getStatusBadge(prj.status)}
                  </div>

                  <div>
                    <Link
                      to={`/projects/${prj.id}`}
                      className="text-base font-bold text-slate-900 hover:text-brand-600 line-clamp-1"
                    >
                      {prj.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                      {prj.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Manual Progress Bar */}
                  <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-600">Project Progress</span>
                      <span className={`font-bold ${getProgressColor(progress)}`}>{progress}%</span>
                    </div>
                    <ProgressBar value={progress} />
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{taskCount} Tasks</span>
                      <span>{updateCount} Updates</span>
                      <span>{fileCount} Files</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1">
                    <p>
                      <strong>Department:</strong> {prj.department?.name || 'General Organization'}
                    </p>
                    <p>
                      <strong>Target Due:</strong>{' '}
                      {prj.dueDate ? formatDate(prj.dueDate) : 'No target date'}
                    </p>
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={`${prj.manager?.firstName || ''} ${prj.manager?.lastName || ''}`}
                      size="sm"
                    />
                    <div className="text-left">
                      <p className="text-xs font-medium text-slate-800 leading-tight">
                        {prj.manager?.firstName} {prj.manager?.lastName}
                      </p>
                      <p className="text-[10px] text-slate-400">Project Lead</p>
                    </div>
                  </div>
                  <Link
                    to={`/projects/${prj.id}`}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    View Project →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        onChange={(p) => setPage(p)}
      />

      {/* Create Project Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Project"
        description="Set up a project space, assign a manager, team members, and define initial project status."
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={submitting} onClick={handleCreateSubmit}>
              Create Project
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <Field label="Project Name" required>
            <Input
              required
              placeholder="e.g. Mobile App Redesign 2026"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={3}
              placeholder="Project goals, scope, and key deliverables..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project Lead / Manager">
              <Select
                value={form.managerId}
                onChange={(e) => setForm({ ...form, managerId: e.target.value })}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.employeeCode})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Department">
              <Select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Initial Status">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="NOT_STARTED">Not Started</option>
                <option value="PLANNING">Planning</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="ON_HOLD">On Hold</option>
              </Select>
            </Field>

            <Field label="Initial Progress (%)">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}
              />
            </Field>

            <Field label="Start Date">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </Field>

            <Field label="Target Completion Date">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
