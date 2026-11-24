import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/Layout';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Input,
  ProgressBar,
  Select,
  Spinner,
  StatTile,
  Table,
} from '../../components/ui';
import { api, getCachedData } from '../../lib/api';
import { formatDate, formatTime } from '../../lib/format';
import type { AdminDashboard as AdminDashboardType, HierarchyRosterMember, Task } from '../../lib/types';

export default function AdminDashboard() {
  const cachedDash = getCachedData<AdminDashboardType>('/dashboard/admin');
  const cachedReview = getCachedData<{ data: Task[] }>('/tasks?status=SUBMITTED_FOR_REVIEW&pageSize=5');
  const [data, setData] = useState<AdminDashboardType | null>(cachedDash);
  const [tasksInReview, setTasksInReview] = useState<Task[]>(cachedReview?.data ?? []);
  const [loading, setLoading] = useState(!cachedDash);
  const [error, setError] = useState<string | null>(null);

  // Hierarchy Roster Filter State
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!cachedDash) setLoading(true);
        const [dashRes, reviewRes] = await Promise.all([
          api.get<AdminDashboardType>('/dashboard/admin'),
          api.get<{ data: Task[] }>('/tasks?status=SUBMITTED_FOR_REVIEW&pageSize=5'),
        ]);
        if (!active) return;
        setData(dashRes);
        setTasksInReview(reviewRes.data || []);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || 'Failed to load executive dashboard');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Spinner label="Loading Founder Executive statistics & hierarchy…" />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  // Filter roster
  const filteredRoster = (data.hierarchyRoster || []).filter((emp: HierarchyRosterMember) => {
    const matchesSearch =
      !search ||
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      (emp.positionTitle && emp.positionTitle.toLowerCase().includes(search.toLowerCase()));

    const matchesDept = !selectedDept || emp.departmentName === selectedDept;

    const matchesStatus =
      !selectedStatus ||
      (selectedStatus === 'PRESENT' && ['PRESENT', 'WFH', 'LATE'].includes(emp.attendanceStatus)) ||
      (selectedStatus === 'WFH' && emp.attendanceStatus === 'WFH') ||
      (selectedStatus === 'LATE' && emp.attendanceStatus === 'LATE') ||
      (selectedStatus === 'ABSENT' && ['ABSENT', 'NOT_MARKED'].includes(emp.attendanceStatus));

    return matchesSearch && matchesDept && matchesStatus;
  });

  const getAttendanceBadge = (status: string, checkInAt: string | null) => {
    switch (status) {
      case 'PRESENT':
        return (
          <div>
            <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Present</Badge>
            {checkInAt && <p className="mt-0.5 text-[10px] text-slate-500">{formatTime(checkInAt)}</p>}
          </div>
        );
      case 'WFH':
        return (
          <div>
            <Badge tone="bg-blue-50 text-blue-700 ring-blue-200">WFH</Badge>
            {checkInAt && <p className="mt-0.5 text-[10px] text-slate-500">{formatTime(checkInAt)}</p>}
          </div>
        );
      case 'LATE':
        return (
          <div>
            <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Late</Badge>
            {checkInAt && <p className="mt-0.5 text-[10px] text-slate-500">{formatTime(checkInAt)}</p>}
          </div>
        );
      case 'HALF_DAY':
        return <Badge tone="bg-purple-50 text-purple-700 ring-purple-200">Half Day</Badge>;
      case 'ON_LEAVE':
        return <Badge tone="bg-slate-100 text-slate-700 ring-slate-200">On Leave</Badge>;
      default:
        return <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">Not Marked</Badge>;
    }
  };

  const getSodBadge = (status: string) => {
    return status === 'SUBMITTED' ? (
      <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Submitted</Badge>
    ) : (
      <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Pending</Badge>
    );
  };

  const getEodBadge = (status: string) => {
    switch (status) {
      case 'REVIEWED':
        return <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Reviewed</Badge>;
      case 'SUBMITTED':
        return <Badge tone="bg-violet-50 text-violet-700 ring-violet-200">Submitted</Badge>;
      default:
        return <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Founder Command Center"
        description={`Executive organization overview, workforce attendance, and task execution summary for ${formatDate(
          data.date,
        )}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/hierarchy"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Org Chart & Hierarchy
            </Link>
            <Link
              to="/admin/employees"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              + Add Employee
            </Link>
            <Link
              to="/admin/tasks"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              + Assign Task
            </Link>
          </div>
        }
      />

      {/* Top Level Metric Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total Workforce"
          value={data.employees.total}
          hint={`${data.employees.active} active · ${data.employees.onLeave} on leave`}
          tone="text-slate-900"
        />
        <StatTile
          label="Attendance Today"
          value={`${data.attendance.present} Present`}
          hint={`${data.attendance.late} late · ${data.attendance.wfh} WFH · ${data.attendance.notMarked} absent`}
          tone="text-emerald-700"
        />
        <StatTile
          label="SOD Plan Compliance"
          value={`${data.sod.submitted} Submitted`}
          hint={`${data.sod.pending} morning plans pending`}
          tone="text-amber-700"
        />
        <StatTile
          label="EOD Report Status"
          value={`${data.eod.submitted} Submitted`}
          hint={`${data.eod.awaitingReview} awaiting review · ${data.eod.pending} pending`}
          tone="text-violet-700"
        />
      </div>

      {/* Department & Division Breakdown */}
      {data.departmentBreakdown && data.departmentBreakdown.length > 0 && (
        <Card
          title="Departmental Hierarchy & Workforce Distribution"
          subtitle="Real-time attendance rate, SOD planning, and task execution per department"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.departmentBreakdown.map((dept) => {
              const presentPct =
                dept.totalHeadcount > 0 ? Math.round((dept.presentToday / dept.totalHeadcount) * 100) : 0;
              return (
                <div key={dept.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-mono font-bold uppercase text-brand-600">{dept.code}</span>
                      <h3 className="text-sm font-bold text-slate-900">{dept.name}</h3>
                      {dept.headName && (
                        <p className="text-xs text-slate-500">Lead: <strong>{dept.headName}</strong></p>
                      )}
                    </div>
                    <Badge tone="bg-slate-200 text-slate-800 ring-slate-300">
                      {dept.totalHeadcount} Staff
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Attendance ({presentPct}%)</span>
                      <span className="font-semibold text-slate-800">
                        {dept.presentToday} / {dept.totalHeadcount}
                      </span>
                    </div>
                    <ProgressBar value={presentPct} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-slate-200/80 pt-2 text-xs">
                    <div>
                      <p className="text-slate-500">SOD Submitted</p>
                      <p className="font-semibold text-slate-800">{dept.sodSubmitted} / {dept.totalHeadcount}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Active Tasks</p>
                      <p className="font-semibold text-brand-600">{dept.activeTasks} in flight</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Live Employee Hierarchy & Attendance Roster */}
      <Card
        title="Live Organization Hierarchy & Attendance Roster"
        subtitle="Full employee roster with direct reporting lines, live punch status, SOD planning, and active tasks"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search by name, code, title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 sm:w-60 text-xs"
            />
            <Select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="text-xs w-36"
            >
              <option value="">All Departments</option>
              {(data.departmentBreakdown || []).map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs w-32"
            >
              <option value="">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="WFH">WFH</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent / Not Marked</option>
            </Select>
          </div>
        }
        bodyClassName="p-0"
      >
        {filteredRoster.length === 0 ? (
          <EmptyState
            title="No employees match your search"
            description="Try clearing your search query or status filter."
          />
        ) : (
          <Table
            head={
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Department & Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Reports To (Manager)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Today's Attendance</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">SOD Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">EOD Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Active Tasks</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Action</th>
              </tr>
            }
          >
            {filteredRoster.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-50 transition">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={`${emp.firstName} ${emp.lastName}`} size="sm" />
                    <div>
                      <Link
                        to={`/admin/employees/${emp.id}`}
                        className="font-medium text-slate-900 hover:text-brand-600"
                      >
                        {emp.firstName} {emp.lastName}
                      </Link>
                      <p className="text-xs text-slate-500 font-mono">{emp.employeeCode}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <p className="font-semibold text-slate-800">{emp.departmentName || 'General'}</p>
                  <p className="text-slate-500">{emp.positionTitle || emp.roleName}</p>
                </td>
                <td className="px-4 py-3 text-xs">
                  {emp.managerName ? (
                    <span className="font-medium text-slate-700">{emp.managerName}</span>
                  ) : (
                    <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">Executive / Root</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {getAttendanceBadge(emp.attendanceStatus, emp.checkInAt)}
                </td>
                <td className="px-4 py-3 text-xs">{getSodBadge(emp.sodStatus)}</td>
                <td className="px-4 py-3 text-xs">{getEodBadge(emp.eodStatus)}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-800">
                  {emp.activeTasksCount > 0 ? (
                    <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">
                      {emp.activeTasksCount} active
                    </Badge>
                  ) : (
                    <span className="text-slate-400">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs">
                  <Link
                    to={`/admin/employees/${emp.id}`}
                    className="font-semibold text-brand-600 hover:text-brand-700"
                  >
                    View & Edit →
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Pipeline Status & Review Queues */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Task Workflow Health */}
        <Card title="Task Pipeline Status" subtitle="Live breakdown of assigned workforce tasks">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
              <span className="text-slate-600">Total Active Tasks</span>
              <span className="font-semibold text-slate-900">{data.tasks.total}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
              <span className="text-slate-600">In Progress</span>
              <span className="font-semibold text-brand-600">{data.tasks.inProgress}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
              <span className="text-slate-600">Awaiting Review</span>
              <span className="font-semibold text-amber-600">{data.tasks.inReview}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
              <span className="text-slate-600">Changes Requested</span>
              <span className="font-semibold text-violet-600">{data.tasks.changesRequired}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
              <span className="text-slate-600">Overdue Tasks</span>
              <span className="font-bold text-rose-600">{data.tasks.overdue}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Completed Today</span>
              <span className="font-semibold text-emerald-600">{data.tasks.completed}</span>
            </div>
          </div>
        </Card>

        {/* Action Queues */}
        <Card
          title="Executive Action & Approval Queues"
          subtitle="Pending approvals across company workflows"
          actions={
            <Link to="/admin/review" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View All Queue →
            </Link>
          }
        >
          <div className="space-y-3">
            <Link
              to="/admin/review"
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-slate-50"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">Tasks Submitted for Review</p>
                <p className="text-xs text-slate-500">Employee task completion submissions</p>
              </div>
              <Badge tone="bg-amber-100 text-amber-800 ring-amber-200">{data.queues.taskReview} Pending</Badge>
            </Link>

            <Link
              to="/admin/sod-eod"
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-slate-50"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">EOD Submissions to Review</p>
                <p className="text-xs text-slate-500">End of day daily summaries</p>
              </div>
              <Badge tone="bg-violet-100 text-violet-800 ring-violet-200">
                {data.eod.awaitingReview} Pending
              </Badge>
            </Link>

            <Link
              to="/admin/leave"
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-slate-50"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">Leave Approval Queue</p>
                <p className="text-xs text-slate-500">Pending employee leave applications</p>
              </div>
              <Badge tone="bg-blue-100 text-blue-800 ring-blue-200">
                {data.queues.leaveApproval} Pending
              </Badge>
            </Link>
          </div>
        </Card>
      </div>

      {/* Task Submissions Awaiting Review */}
      <Card
        title="Tasks Submitted for Review"
        subtitle="Recent task completion requests waiting for supervisor sign-off"
      >
        {tasksInReview.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">No tasks currently awaiting review.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {tasksInReview.map((task) => (
              <div key={task.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={`${task.assignee?.firstName || ''} ${task.assignee?.lastName || ''}`} size="sm" />
                  <div>
                    <Link
                      to={`/admin/tasks/${task.id}`}
                      className="text-sm font-medium text-slate-900 hover:text-brand-600"
                    >
                      {task.code}: {task.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      Assigned to {task.assignee?.firstName} {task.assignee?.lastName} · Submitted{' '}
                      {formatDate(task.updatedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="bg-amber-100 text-amber-800 ring-amber-200">Needs Review</Badge>
                  <Link
                    to="/admin/review"
                    className="rounded bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                  >
                    Review Now
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
