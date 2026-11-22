import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/Layout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  InfoNote,
  Modal,
  ProgressBar,
  Spinner,
  StatTile,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { api } from '../../lib/api';
import { useApi, useAction } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import {
  ATTENDANCE_STYLES,
  PRIORITY_STYLES,
  TASK_STATUS_LABELS,
  TASK_STATUS_STYLES,
  WORKFLOW_STYLES,
  formatDate,
  formatTime,
  titleCase,
} from '../../lib/format';
import type { EmployeeDashboard } from '../../lib/types';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<EmployeeDashboard>('/dashboard/me');
  const { busy, run } = useAction();

  const [selectedDuty, setSelectedDuty] = useState<any>(null);
  const [dutyUpdating, setDutyUpdating] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const punch = async (action: 'check-in' | 'check-out') => {
    await run(() => api.post(`/attendance/${action}`, {}));
    reload();
  };

  const updateDutyStatus = async (dutyId: string, newStatus: 'DONE' | 'IN_PROGRESS' | 'PENDING') => {
    try {
      setDutyUpdating(dutyId);
      await api.patch(`/sod/entries/${dutyId}`, { status: newStatus });
      reload();
      if (selectedDuty && selectedDuty.id === dutyId) {
        setSelectedDuty((prev: any) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update duty status');
    } finally {
      setDutyUpdating(null);
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await api.post(`/tasks/${taskId}/status`, { status: newStatus });
      reload();
    } catch (err: any) {
      alert(err.message || 'Failed to update task status');
    }
  };

  const getDutyStatusBadge = (status: string) => {
    if (status === 'DONE' || status === 'COMPLETED') {
      return <Badge tone="bg-emerald-100 text-emerald-800 ring-emerald-300">Completed</Badge>;
    }
    if (status === 'IN_PROGRESS') {
      return <Badge tone="bg-blue-100 text-blue-800 ring-blue-300">Work-In-Progress</Badge>;
    }
    return <Badge tone="bg-amber-100 text-amber-800 ring-amber-300">Pending</Badge>;
  };

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.firstName}`}
        description={`Here is your day at a glance · ${formatDate(data.date)}`}
        actions={
          <>
            {data.attendance.canCheckIn && (
              <Button loading={busy} onClick={() => void punch('check-in')}>
                <Icon.clock /> Check in
              </Button>
            )}
            {data.attendance.canCheckOut && (
              <Button variant="secondary" loading={busy} onClick={() => void punch('check-out')}>
                <Icon.clock /> Check out
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Open tasks"
          value={data.tasks.open}
          hint={`${data.tasks.inProgress} in progress · ${data.tasks.dueToday} due today`}
          icon={<Icon.tasks className="h-6 w-6" />}
        />
        <StatTile
          label="Overdue"
          value={data.tasks.overdue}
          hint={data.tasks.overdue ? 'Needs attention today' : 'Nothing past its deadline'}
          tone={data.tasks.overdue ? 'text-rose-600' : 'text-slate-900'}
          icon={<Icon.alert className="h-6 w-6" />}
        />
        <StatTile
          label="Awaiting review"
          value={data.tasks.inReview}
          hint={`${data.tasks.changesRequired} need changes`}
          icon={<Icon.check className="h-6 w-6" />}
        />
        <StatTile
          label="Hours today"
          value={
            typeof data.attendance?.workedHours === 'number' && data.attendance.workedHours > 0
              ? data.attendance.workedHours < 0.1
                ? data.attendance.workedHours.toFixed(2)
                : data.attendance.workedHours.toFixed(1)
              : '0.0'
          }
          hint={
            data.attendance?.checkInAt
              ? `In ${formatTime(data.attendance.checkInAt)}${data.attendance.checkOutAt ? ` · Out ${formatTime(data.attendance.checkOutAt)}` : ''}`
              : 'Not checked in yet'
          }
          icon={<Icon.clock className="h-6 w-6" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">

          {/* 1. ASSIGNED DAILY DUTIES (From Managers / Leads) */}
          <Card
            title="Assigned Daily Duties"
            subtitle="Direct duties assigned to you by management for today"
            bodyClassName="p-0"
            actions={
              <Link to="/sod">
                <Button size="sm" variant="secondary">View in SOD</Button>
              </Link>
            }
          >
            {(!data.assignedDuties || data.assignedDuties.length === 0) ? (
              <EmptyState
                title="No assigned duties currently"
                description="When your manager or team leader assigns you daily duties, they will appear here."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.assignedDuties.map((duty) => (
                  <li key={duty.id} className="p-4 hover:bg-slate-50 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div
                        className="cursor-pointer min-w-0 flex-1"
                        onClick={() => setSelectedDuty(duty)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 hover:text-brand-600">
                            {duty.titleSnapshot}
                          </span>
                          <Badge tone={PRIORITY_STYLES[duty.prioritySnapshot] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}>
                            {titleCase(duty.prioritySnapshot)}
                          </Badge>
                          {getDutyStatusBadge(duty.status)}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                          {duty.instructions || 'No additional instructions provided. Click to view details.'}
                        </p>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                          {duty.assignedByName && <span>Assigned by: <strong>{duty.assignedByName}</strong></span>}
                          {duty.dueTime && <span>Due by: <strong>{duty.dueTime}</strong></span>}
                          {duty.plannedHours != null && <span>Est: {duty.plannedHours}h</span>}
                        </div>
                      </div>

                      {/* Quick Status Buttons */}
                      <div className="flex items-center gap-1.5 self-start sm:self-center">
                        <Button
                          size="sm"
                          variant={duty.status === 'DONE' ? 'success' : 'ghost'}
                          loading={dutyUpdating === duty.id}
                          onClick={() => updateDutyStatus(duty.id, 'DONE')}
                          className="text-xs px-2.5 py-1"
                        >
                          ✔ Completed
                        </Button>
                        <Button
                          size="sm"
                          variant={duty.status === 'IN_PROGRESS' ? 'primary' : 'ghost'}
                          loading={dutyUpdating === duty.id}
                          onClick={() => updateDutyStatus(duty.id, 'IN_PROGRESS')}
                          className="text-xs px-2.5 py-1"
                        >
                          ⚡ In Progress
                        </Button>
                        <Button
                          size="sm"
                          variant={duty.status === 'PENDING' ? 'secondary' : 'ghost'}
                          loading={dutyUpdating === duty.id}
                          onClick={() => updateDutyStatus(duty.id, 'PENDING')}
                          className="text-xs px-2.5 py-1 text-slate-500"
                        >
                          ⏳ Pending
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 2. ASSIGNED PROJECTS */}
          {data.assignedProjects && data.assignedProjects.length > 0 && (
            <Card
              title="Assigned Projects"
              subtitle="Key organizational projects you are contributing to"
              bodyClassName="p-0"
              actions={
                <Link to="/projects">
                  <Button size="sm" variant="secondary">All Projects</Button>
                </Link>
              }
            >
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {data.assignedProjects.map((proj) => (
                  <Link
                    key={proj.id}
                    to={`/projects/${proj.id}`}
                    className="block p-3.5 rounded-lg border border-slate-200 bg-white hover:border-brand-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                        {proj.code}
                      </span>
                      <Badge tone={proj.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}>
                        {titleCase(proj.status)}
                      </Badge>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-slate-900 truncate">{proj.name}</h4>
                    {proj.description && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-1">{proj.description}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Progress</span>
                      <span className="font-semibold tabular-nums text-slate-700">{proj.progress}%</span>
                    </div>
                    <ProgressBar value={proj.progress} className="mt-1" />
                    {proj.targetDate && (
                      <p className="mt-2 text-[11px] text-slate-400">
                        Target: {formatDate(proj.targetDate)}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* 3. TODAY'S PLAN & UPCOMING TASKS */}
          <Card
            title="Today's Tasks & Plan"
            subtitle="Generated automatically from the tasks assigned to you"
            actions={
              <div className="flex gap-2">
                <Link to="/tasks">
                  <Button size="sm" variant="ghost">My Tasks</Button>
                </Link>
                <Link to="/sod">
                  <Button size="sm" variant="secondary">Open SOD</Button>
                </Link>
              </div>
            }
            bodyClassName="p-0"
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
              <Badge tone={WORKFLOW_STYLES[data.sod.status]}>SOD {titleCase(data.sod.status)}</Badge>
              <span className="text-sm text-slate-600">{data.sod.items} planned item(s)</span>
              {data.sod.submittedAt && (
                <span className="text-xs text-slate-400">
                  submitted {formatTime(data.sod.submittedAt)}
                </span>
              )}
            </div>

            {data.upcomingTasks.length === 0 ? (
              <EmptyState
                title="No open tasks"
                description="When an admin or manager assigns you work it shows up here straight away."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.upcomingTasks.map((task) => (
                  <li key={task.id} className="px-5 py-3 hover:bg-slate-50 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-800 hover:text-brand-600">
                            {task.title}
                          </span>
                          <Badge tone={PRIORITY_STYLES[task.priority]}>{titleCase(task.priority)}</Badge>
                          {task.isOverdue && (
                            <Badge tone={TASK_STATUS_STYLES.OVERDUE}>Overdue</Badge>
                          )}
                          <Badge tone={TASK_STATUS_STYLES[task.status]}>
                            {TASK_STATUS_LABELS[task.status] ?? task.status}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <ProgressBar value={task.progress} className="max-w-[140px]" />
                          <span className="text-xs tabular-nums text-slate-500">{task.progress}%</span>
                          <span className="text-xs text-slate-400">
                            {task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No deadline'}
                          </span>
                        </div>
                      </Link>

                      {/* Quick Task Action Buttons */}
                      <div className="flex items-center gap-1.5">
                        {task.status !== 'IN_PROGRESS' && task.status !== 'COMPLETED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs"
                            onClick={() => updateTaskStatus(task.id, 'IN_PROGRESS')}
                          >
                            ⚡ Work In Progress
                          </Button>
                        )}
                        {task.status !== 'COMPLETED' && task.status !== 'SUBMITTED_FOR_REVIEW' && (
                          <Button
                            size="sm"
                            variant="success"
                            className="text-xs"
                            onClick={() => updateTaskStatus(task.id, 'COMPLETED')}
                          >
                            ✔ Complete
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 4. END OF DAY */}
          <Card
            title="End of day"
            subtitle="Your completed, pending and blocked work is pulled in automatically"
            actions={
              <Link to="/eod">
                <Button size="sm" variant={data.eod.status === 'PENDING' ? 'primary' : 'secondary'}>
                  {data.eod.status === 'PENDING' ? 'Submit EOD' : 'View EOD'}
                </Button>
              </Link>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={WORKFLOW_STYLES[data.eod.status]}>EOD {titleCase(data.eod.status)}</Badge>
              <span className="text-sm text-slate-600">{data.eod.items} item(s) prepared</span>
              {data.eod.status === 'CHANGES_REQUESTED' && (
                <span className="text-sm text-orange-700">Your manager asked for changes.</span>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar Cards */}
        <div className="space-y-4">
          <Card title="Attendance">
            <div className="flex items-center justify-between">
              <Badge tone={ATTENDANCE_STYLES[data.attendance?.status ?? ''] ?? ATTENDANCE_STYLES.UNKNOWN}>
                {titleCase(data.attendance?.status ?? 'ABSENT')}
              </Badge>
              <span className="text-sm tabular-nums text-slate-600">
                {(data.attendance?.workedHours ?? 0).toFixed(2)} h
              </span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Check in</dt>
                <dd className="font-medium text-slate-700">{formatTime(data.attendance.checkInAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Check out</dt>
                <dd className="font-medium text-slate-700">{formatTime(data.attendance.checkOutAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card
            title="Leave balance"
            actions={
              <Link to="/leave">
                <Button size="sm" variant="ghost">
                  Apply
                </Button>
              </Link>
            }
            bodyClassName="p-0"
          >
            {data.leaveBalances.length === 0 ? (
              <EmptyState title="No leave types configured" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.leaveBalances.map((balance) => (
                  <li key={balance.id} className="flex items-center justify-between px-5 py-2.5">
                    <span className="flex items-center gap-2 text-sm text-slate-700">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: balance.leaveType.color }}
                      />
                      {balance.leaveType.name}
                    </span>
                    <span className="text-sm font-medium tabular-nums text-slate-800">
                      {balance.available}
                      <span className="text-xs font-normal text-slate-400"> / {balance.entitled + balance.carriedForward}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.tasks.blocked > 0 && (
            <InfoNote tone="amber">
              You have {data.tasks.blocked} blocked task(s). Add the blocker to your EOD so your
              manager can unblock you.
            </InfoNote>
          )}
        </div>
      </div>

      {/* Duty Detail & Status Modal */}
      {selectedDuty && (
        <Modal
          open={!!selectedDuty}
          onClose={() => setSelectedDuty(null)}
          title="Assigned Duty Details"
          description={selectedDuty.sod?.date ? `Scheduled for: ${formatDate(selectedDuty.sod.date)}` : undefined}
          footer={
            <Button variant="secondary" onClick={() => setSelectedDuty(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-4 py-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">{selectedDuty.titleSnapshot}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={PRIORITY_STYLES[selectedDuty.prioritySnapshot] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}>
                  Priority: {titleCase(selectedDuty.prioritySnapshot)}
                </Badge>
                {getDutyStatusBadge(selectedDuty.status)}
                {selectedDuty.plannedHours != null && (
                  <span className="text-xs text-slate-500">Est. Hours: {selectedDuty.plannedHours}h</span>
                )}
                {selectedDuty.dueTime && (
                  <span className="text-xs text-slate-500">Needed by: {selectedDuty.dueTime}</span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Instructions / Details:</h4>
              <p className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap">
                {selectedDuty.instructions || 'No specific instructions were provided for this duty.'}
              </p>
            </div>

            {selectedDuty.assignedByName && (
              <div className="text-xs text-slate-500">
                Assigned by: <strong>{selectedDuty.assignedByName}</strong>
              </div>
            )}

            {/* Quick Status Update Section */}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-700 mb-2">Update Duty Status:</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={selectedDuty.status === 'DONE' ? 'success' : 'secondary'}
                  className="w-full justify-center text-xs"
                  loading={dutyUpdating === selectedDuty.id}
                  onClick={() => updateDutyStatus(selectedDuty.id, 'DONE')}
                >
                  ✔ Completed
                </Button>
                <Button
                  variant={selectedDuty.status === 'IN_PROGRESS' ? 'primary' : 'secondary'}
                  className="w-full justify-center text-xs"
                  loading={dutyUpdating === selectedDuty.id}
                  onClick={() => updateDutyStatus(selectedDuty.id, 'IN_PROGRESS')}
                >
                  ⚡ In Progress
                </Button>
                <Button
                  variant={selectedDuty.status === 'PENDING' ? 'danger' : 'secondary'}
                  className="w-full justify-center text-xs"
                  loading={dutyUpdating === selectedDuty.id}
                  onClick={() => updateDutyStatus(selectedDuty.id, 'PENDING')}
                >
                  ⏳ Pending
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
