import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryString } from '../lib/api';
import { useApi } from '../lib/hooks';
import {
  PRIORITY_STYLES,
  TASK_STATUS_LABELS,
  TASK_STATUS_STYLES,
  formatDate,
  titleCase,
} from '../lib/format';
import type { Paginated, Task } from '../lib/types';
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorNote,
  Input,
  Pagination,
  ProgressBar,
  Select,
  Spinner,
  Table,
} from './ui';

const STATUS_OPTIONS = [
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'SUBMITTED_FOR_REVIEW',
  'CHANGES_REQUIRED',
  'BLOCKED',
  'OVERDUE',
  'COMPLETED',
  'CANCELLED',
];

export type TaskFilters = {
  status?: string;
  priority?: string;
  assigneeId?: string;
  departmentId?: string;
  search?: string;
};

export function TaskListView({
  basePath,
  fixedAssigneeId,
  showAssignee = true,
  extraFilters,
  refreshKey = 0,
}: {
  basePath: string;
  fixedAssigneeId?: string;
  showAssignee?: boolean;
  extraFilters?: React.ReactNode;
  refreshKey?: number;
}) {
  const [filters, setFilters] = useState<TaskFilters>({});
  const [page, setPage] = useState(1);

  const query = queryString({
    page,
    pageSize: 15,
    status: filters.status,
    priority: filters.priority,
    assigneeId: fixedAssigneeId ?? filters.assigneeId,
    departmentId: filters.departmentId,
    search: filters.search,
  });

  const { data, loading, error } = useApi<Paginated<Task>>(`/tasks${query}`, [refreshKey]);

  const update = (patch: TaskFilters) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Input
            placeholder="Search by title or code…"
            value={filters.search ?? ''}
            onChange={(event) => update({ search: event.target.value })}
            className="pl-9"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
        </div>

        <Select
          value={filters.status ?? ''}
          onChange={(event) => update({ status: event.target.value || undefined })}
          className="w-auto min-w-[150px]"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {TASK_STATUS_LABELS[status] ?? status}
            </option>
          ))}
        </Select>

        <Select
          value={filters.priority ?? ''}
          onChange={(event) => update({ priority: event.target.value || undefined })}
          className="w-auto min-w-[130px]"
        >
          <option value="">All priorities</option>
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((priority) => (
            <option key={priority} value={priority}>
              {titleCase(priority)}
            </option>
          ))}
        </Select>

        {extraFilters}
      </div>

      {error && (
        <div className="p-4">
          <ErrorNote message={error} />
        </div>
      )}

      {loading && !data ? (
        <Spinner />
      ) : !data?.data.length ? (
        <EmptyState
          title="No tasks match these filters"
          description="Try clearing the search or choosing a different status."
        />
      ) : (
        <>
          <Table
            head={
              <tr>
                <th className="th">Task</th>
                {showAssignee && <th className="th">Assignee</th>}
                <th className="th">Priority</th>
                <th className="th">Status</th>
                <th className="th w-44">Progress</th>
                <th className="th">Due</th>
              </tr>
            }
          >
            {data.data.map((task) => (
              <tr key={task.id} className="transition hover:bg-slate-50">
                <td className="td">
                  <Link to={`${basePath}/${task.id}`} className="block max-w-md">
                    <span className="block truncate font-medium text-slate-800 hover:text-brand-700">
                      {task.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-slate-400">
                      {task.code}
                      {task.counts.comments > 0 && ` · ${task.counts.comments} comment(s)`}
                    </span>
                  </Link>
                </td>
                {showAssignee && (
                  <td className="td">
                    {task.assignee ? (
                      <span className="flex items-center gap-2">
                        <Avatar
                          size="sm"
                          name={`${task.assignee.firstName} ${task.assignee.lastName}`}
                        />
                        <span className="whitespace-nowrap text-sm">
                          {task.assignee.firstName} {task.assignee.lastName}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </td>
                )}
                <td className="td">
                  <Badge tone={PRIORITY_STYLES[task.priority]}>{titleCase(task.priority)}</Badge>
                </td>
                <td className="td">
                  <Badge tone={TASK_STATUS_STYLES[task.displayStatus]}>
                    {TASK_STATUS_LABELS[task.displayStatus] ?? task.displayStatus}
                  </Badge>
                </td>
                <td className="td">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={task.progress} />
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-500">
                      {task.progress}%
                    </span>
                  </div>
                </td>
                <td className="td whitespace-nowrap">
                  <span className={task.isOverdue ? 'font-medium text-rose-600' : 'text-slate-600'}>
                    {formatDate(task.dueDate)}
                  </span>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
