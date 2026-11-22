import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  Modal,
  ProgressBar,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui';
import { api, downloadFile } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import {
  PRIORITY_STYLES,
  TASK_STATUS_LABELS,
  TASK_STATUS_STYLES,
  formatBytes,
  formatDate,
  formatDateTime,
  relativeTime,
  titleCase,
} from '../../lib/format';
import type { TaskDetail as TaskDetailType } from '../../lib/types';

type EmployeeOption = { id: string; name: string; employeeCode: string };

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const { data, loading, error, reload } = useApi<{ data: TaskDetailType }>(id ? `/tasks/${id}` : null);
  const action = useAction();

  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState<'APPROVE' | 'REQUEST_CHANGES' | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  const task = data.data;
  const isAssignee = task.assignee?.id === user?.id;
  const canReview = can('task.review');
  const canReassign = can('task.reassign');

  const changeStatus = async (status: string, extra?: Record<string, unknown>) => {
    const result = await action.run(() => api.post(`/tasks/${task.id}/status`, { status, ...extra }));
    if (result) {
      reload();
      setBlockOpen(false);
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    const result = await action.run(() =>
      api.post(`/tasks/${task.id}/comments`, { body: comment.trim(), isInternal: internal }),
    );
    if (result) {
      setComment('');
      reload();
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const body = new FormData();
    Array.from(files).forEach((file) => body.append('files', file));
    const result = await action.run(() => api.upload(`/tasks/${task.id}/attachments`, body));
    if (result) reload();
    if (fileInput.current) fileInput.current.value = '';
  };

  // What the current user is allowed to do next, given the workflow state.
  const actions: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'success' }[] = [];
  if (isAssignee || canReview) {
    if (task.status === 'ASSIGNED') {
      actions.push({ label: 'Accept task', onClick: () => void changeStatus('ACCEPTED') });
      actions.push({ label: 'Start work', onClick: () => void changeStatus('IN_PROGRESS'), variant: 'secondary' });
    }
    if (task.status === 'ACCEPTED' || task.status === 'CHANGES_REQUIRED') {
      actions.push({ label: 'Start work', onClick: () => void changeStatus('IN_PROGRESS') });
    }
    if (task.status === 'BLOCKED') {
      actions.push({ label: 'Unblock & resume', onClick: () => void changeStatus('IN_PROGRESS') });
    }
    if (['IN_PROGRESS', 'CHANGES_REQUIRED'].includes(task.status)) {
      actions.push({ label: 'Update progress', onClick: () => setProgressOpen(true), variant: 'secondary' });
      actions.push({
        label: canReview ? 'Mark completed' : 'Submit for review',
        onClick: () => void changeStatus('COMPLETED'),
        variant: 'success',
      });
    }
    if (!['COMPLETED', 'CANCELLED', 'BLOCKED'].includes(task.status)) {
      actions.push({ label: 'Raise blocker', onClick: () => setBlockOpen(true), variant: 'secondary' });
    }
  }

  return (
    <>
      <PageHeader
        title={task.title}
        description={`${task.code} · created by ${task.createdBy.firstName} ${task.createdBy.lastName} · ${formatDate(task.createdAt)}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Back
            </Button>
            {canReassign && (
              <Button variant="secondary" onClick={() => setReassignOpen(true)}>
                Reassign
              </Button>
            )}
            {canReview && task.status === 'SUBMITTED_FOR_REVIEW' && (
              <>
                <Button variant="secondary" onClick={() => setReviewOpen('REQUEST_CHANGES')}>
                  Request changes
                </Button>
                <Button variant="success" onClick={() => setReviewOpen('APPROVE')}>
                  Approve
                </Button>
              </>
            )}
          </>
        }
      />

      {action.error && <div className="mb-4"><ErrorNote message={action.error} /></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TASK_STATUS_STYLES[task.displayStatus]}>
                {TASK_STATUS_LABELS[task.displayStatus] ?? task.displayStatus}
              </Badge>
              <Badge tone={PRIORITY_STYLES[task.priority]}>{titleCase(task.priority)} priority</Badge>
              {task.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <ProgressBar value={task.progress} />
              <span className="w-12 shrink-0 text-sm font-medium tabular-nums text-slate-700">
                {task.progress}%
              </span>
            </div>

            {task.description && (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {task.description}
              </p>
            )}

            {task.status === 'BLOCKED' && task.blockedReason && (
              <div className="mt-4">
                <InfoNote tone="amber">
                  <strong>Blocked:</strong> {task.blockedReason}
                </InfoNote>
              </div>
            )}
            {task.status === 'CHANGES_REQUIRED' && task.reviewNotes && (
              <div className="mt-4">
                <InfoNote tone="amber">
                  <strong>Changes requested:</strong> {task.reviewNotes}
                </InfoNote>
              </div>
            )}
            {task.status === 'COMPLETED' && task.reviewedBy && (
              <div className="mt-4">
                <InfoNote>
                  Approved by {task.reviewedBy.firstName} {task.reviewedBy.lastName} on{' '}
                  {formatDateTime(task.reviewedAt)}
                  {task.reviewNotes ? ` — “${task.reviewNotes}”` : ''}
                </InfoNote>
              </div>
            )}

            {actions.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {actions.map((item) => (
                  <Button
                    key={item.label}
                    variant={item.variant ?? 'primary'}
                    loading={action.busy}
                    onClick={item.onClick}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Comments"
            subtitle={`${task.comments.length} message(s)`}
            bodyClassName="p-0"
          >
            <div className="divide-y divide-slate-100">
              {task.comments.length === 0 ? (
                <EmptyState title="No comments yet" description="Ask a question or share an update." />
              ) : (
                task.comments.map((entry) => (
                  <div key={entry.id} className="flex gap-3 px-5 py-3.5">
                    <Avatar size="sm" name={`${entry.author.firstName} ${entry.author.lastName}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {entry.author.firstName} {entry.author.lastName}
                        </span>
                        <span className="text-xs text-slate-400">{relativeTime(entry.createdAt)}</span>
                        {entry.isInternal && <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Internal</Badge>}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{entry.body}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-100 p-4">
              <Textarea
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Write a comment…"
              />
              <div className="mt-2 flex items-center justify-between">
                {user?.role.portal === 'ADMIN' ? (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={internal}
                      onChange={(event) => setInternal(event.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
                    />
                    Internal note (hidden from the employee)
                  </label>
                ) : (
                  <span />
                )}
                <Button size="sm" loading={action.busy} disabled={!comment.trim()} onClick={() => void addComment()}>
                  Comment
                </Button>
              </div>
            </div>
          </Card>

          <Card
            title="Attachments"
            actions={
              <>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => void uploadFiles(event.target.files)}
                />
                <Button size="sm" variant="secondary" loading={action.busy} onClick={() => fileInput.current?.click()}>
                  Upload file
                </Button>
              </>
            }
            bodyClassName={task.attachments.length ? 'p-0' : undefined}
          >
            {task.attachments.length === 0 ? (
              <p className="text-sm text-slate-500">No files attached yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {task.attachments.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{file.originalName}</p>
                      <p className="text-xs text-slate-500">
                        {formatBytes(file.size)} · {file.uploadedBy.firstName} · {formatDate(file.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void downloadFile(`/files/attachments/${file.id}`, file.originalName)}
                    >
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Details">
            <dl className="space-y-2.5 text-sm">
              <Row label="Assignee">
                {task.assignee ? (
                  <span className="flex items-center justify-end gap-2">
                    <Avatar size="sm" name={`${task.assignee.firstName} ${task.assignee.lastName}`} />
                    {task.assignee.firstName} {task.assignee.lastName}
                  </span>
                ) : (
                  'Unassigned'
                )}
              </Row>
              <Row label="Department">{task.department?.name ?? '—'}</Row>
              <Row label="Team">{task.team?.name ?? '—'}</Row>
              <Row label="Start date">{formatDate(task.startDate)}</Row>
              <Row label="Deadline">
                <span className={task.isOverdue ? 'font-semibold text-rose-600' : ''}>
                  {formatDate(task.dueDate)}
                </span>
              </Row>
              <Row label="Estimated">{task.estimatedHours != null ? `${task.estimatedHours} h` : '—'}</Row>
              <Row label="Logged">{task.actualHours} h</Row>
              <Row label="Review rounds">{task.reviewRounds}</Row>
              <Row label="Last update">{formatDateTime(task.updatedAt)}</Row>
            </dl>
          </Card>

          <Card title="Activity" bodyClassName="p-0">
            {task.activities.length === 0 ? (
              <EmptyState title="No activity" />
            ) : (
              <ol className="max-h-[420px] overflow-y-auto p-4">
                {task.activities.map((entry) => (
                  <li key={entry.id} className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
                    <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500" />
                    <p className="text-xs font-medium text-slate-700">
                      {titleCase(entry.type)}
                      {entry.toValue && (
                        <span className="font-normal text-slate-500">
                          {' '}
                          → {TASK_STATUS_LABELS[entry.toValue] ?? entry.toValue}
                        </span>
                      )}
                    </p>
                    {entry.note && <p className="mt-0.5 text-xs text-slate-500">{entry.note}</p>}
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName} · ` : 'System · '}
                      {relativeTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {task.subtasks.length > 0 && (
            <Card title="Subtasks" bodyClassName="p-0">
              <ul className="divide-y divide-slate-100">
                {task.subtasks.map((sub) => (
                  <li key={sub.id} className="px-5 py-2.5">
                    <Link to={`/tasks/${sub.id}`} className="text-sm text-slate-700 hover:text-brand-700">
                      {sub.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <ProgressModal
        open={progressOpen}
        task={task}
        onClose={() => setProgressOpen(false)}
        onDone={() => {
          setProgressOpen(false);
          reload();
        }}
      />

      <BlockModal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onSubmit={(reason) => void changeStatus('BLOCKED', { blockedReason: reason })}
        busy={action.busy}
      />

      <ReviewModal
        mode={reviewOpen}
        taskId={task.id}
        onClose={() => setReviewOpen(null)}
        onDone={() => {
          setReviewOpen(null);
          reload();
        }}
      />

      <ReassignModal
        open={reassignOpen}
        taskId={task.id}
        onClose={() => setReassignOpen(false)}
        onDone={() => {
          setReassignOpen(false);
          reload();
        }}
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function ProgressModal({
  open,
  task,
  onClose,
  onDone,
}: {
  open: boolean;
  task: TaskDetailType;
  onClose: () => void;
  onDone: () => void;
}) {
  const [progress, setProgress] = useState(task.progress);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();

  const submit = async () => {
    const result = await run(() =>
      api.post(`/tasks/${task.id}/progress`, {
        progress,
        hoursSpent: hours ? Number(hours) : undefined,
        note: note || undefined,
      }),
    );
    if (result) onDone();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update progress"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Progress</span>
            <span className="text-sm font-semibold tabular-nums text-slate-800">{progress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(event) => setProgress(Number(event.target.value))}
            className="w-full accent-brand-600"
          />
        </div>
        <Field label="Hours spent today">
          <Input type="number" min={0} max={24} step={0.5} value={hours} onChange={(event) => setHours(event.target.value)} />
        </Field>
        <Field label="Note">
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function BlockModal({
  open,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a blocker"
      description="Your manager and the task creator are notified immediately."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => onSubmit(reason.trim())}>
            Mark blocked
          </Button>
        </>
      }
    >
      <Field label="What is blocking this task?" required>
        <Textarea
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Waiting on API credentials from the vendor."
        />
      </Field>
    </Modal>
  );
}

function ReviewModal({
  mode,
  taskId,
  onClose,
  onDone,
}: {
  mode: 'APPROVE' | 'REQUEST_CHANGES' | null;
  taskId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState('');
  const { busy, error, run } = useAction();
  const approving = mode === 'APPROVE';

  const submit = async () => {
    const result = await run(() => api.post(`/tasks/${taskId}/review`, { action: mode, notes: notes || undefined }));
    if (result) {
      setNotes('');
      onDone();
    }
  };

  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      title={approving ? 'Approve this task' : 'Request changes'}
      description={
        approving
          ? 'The task is marked completed and the employee is notified.'
          : 'The task goes back to the employee with your notes.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={approving ? 'success' : 'primary'}
            loading={busy}
            disabled={!approving && !notes.trim()}
            onClick={() => void submit()}
          >
            {approving ? 'Approve' : 'Send back'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorNote message={error} />}
        <Field label="Notes" required={!approving}>
          <Textarea
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={approving ? 'Optional feedback.' : 'Explain what needs to change.'}
          />
        </Field>
      </div>
    </Modal>
  );
}

function ReassignModal({
  open,
  taskId,
  onClose,
  onDone,
}: {
  open: boolean;
  taskId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const options = useApi<{ data: EmployeeOption[] }>(open ? '/employees/options' : null);
  const [assigneeId, setAssigneeId] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();

  const submit = async () => {
    const result = await run(() => api.post(`/tasks/${taskId}/reassign`, { assigneeId, note: note || undefined }));
    if (result) onDone();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reassign task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!assigneeId} onClick={() => void submit()}>
            Reassign
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorNote message={error} />}
        <Field label="New assignee" required>
          <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="">Select an employee…</option>
            {options.data?.data.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} ({option.employeeCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note">
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
