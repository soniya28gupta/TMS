import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/Layout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  InfoNote,
  Input,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui';
import { api, downloadFile, queryString } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import {
  PRIORITY_STYLES,
  SKIP_REASON_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_STYLES,
  WORKFLOW_STYLES,
  formatBytes,
  formatDate,
  formatDateTime,
  titleCase,
  todayISO,
} from '../../lib/format';
import type { Paginated, Sod, SodItem } from '../../lib/types';

type ItemDraft = { plannedOutcome: string; plannedHours: string };

/** Visual key for the three ways a line reaches the plan. */
const SOURCE_TONES = {
  ASSIGNED: 'bg-brand-50 text-brand-700 ring-brand-200',
  SELF: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export default function SodPage() {
  const [date] = useState(todayISO());
  const { data, loading, error, reload } = useApi<{ data: Sod; taskCount: number }>('/sod/today');
  const history = useApi<Paginated<Sod>>(`/sod/history${queryString({ pageSize: 10 })}`);
  const { busy, error: actionError, run } = useAction();

  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const [ownEntry, setOwnEntry] = useState({ title: '', plannedOutcome: '', plannedHours: '' });

  const sod = data?.data;

  const addOwnEntry = async () => {
    const created = await run(() =>
      api.post(`/sod/${date}/entries`, {
        title: ownEntry.title.trim(),
        plannedOutcome: ownEntry.plannedOutcome.trim() || undefined,
        plannedHours: ownEntry.plannedHours ? Number(ownEntry.plannedHours) : undefined,
      }),
    );
    if (created) {
      setOwnEntry({ title: '', plannedOutcome: '', plannedHours: '' });
      reload();
    }
  };

  const setItemStatus = async (itemId: string, status: string) => {
    await run(() => api.patch(`/sod/entries/${itemId}`, { status }));
    reload();
  };

  useEffect(() => {
    if (!sod) return;
    setNote(sod.plannedNote ?? '');
    setDrafts(
      Object.fromEntries(
        sod.items.map((item) => [
          item.id,
          {
            plannedOutcome: item.plannedOutcome ?? '',
            plannedHours: item.plannedHours != null ? String(item.plannedHours) : '',
          },
        ]),
      ),
    );
  }, [sod?.id, sod?.items.length]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!sod) return null;

  const submitted = sod.status === 'SUBMITTED';
  const skipped = sod.status === 'SKIPPED';

  const submit = async () => {
    const items = sod.items.map((item) => ({
      id: item.id,
      plannedOutcome: drafts[item.id]?.plannedOutcome || undefined,
      plannedHours: drafts[item.id]?.plannedHours ? Number(drafts[item.id].plannedHours) : undefined,
    }));
    const result = await run(() =>
      api.post(`/sod/${date}/submit`, { plannedNote: note || undefined, items }),
    );
    if (result) {
      reload();
      history.reload();
    }
  };

  return (
    <>
      <PageHeader
        title="Start of Day"
        description="Your plan is built automatically from the tasks assigned to you. Review it and confirm."
        actions={
          <Badge tone={WORKFLOW_STYLES[sod.status]}>
            {sod.status === 'SUBMITTED' ? 'Submitted' : sod.status === 'SKIPPED' ? 'Not required' : 'Awaiting confirmation'}
          </Badge>
        }
      />

      {actionError && <div className="mb-4"><ErrorNote message={actionError} /></div>}

      {skipped ? (
        <Card title={formatDate(sod.date)}>
          <div className="space-y-4 p-2">
            <InfoNote tone="slate">
              {SKIP_REASON_LABELS[sod.skipReason ?? ''] ?? 'Non-working day'}.
              {data.taskCount > 0 && ` You have ${data.taskCount} open task(s).`}
            </InfoNote>
            <p className="text-sm text-slate-600">
              Working today? You can plan and submit your Start of Day plan 7 days a week.
            </p>
            <Button
              loading={busy}
              onClick={async () => {
                await run(() => api.post(`/sod/${date}/entries`, { title: 'Working today' }));
                reload();
              }}
            >
              + Activate & Start Today's Plan
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card
              title={`Today's work — ${formatDate(sod.date)}`}
              subtitle={`${sod.items.length} item(s) pulled from your assigned tasks`}
              bodyClassName="p-0"
            >
              {sod.items.length === 0 ? (
                <EmptyState
                  title="No tasks assigned yet"
                  description="As soon as an admin assigns you work it appears here automatically."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {sod.items.map((item) => (
                    <li key={item.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.task ? (
                              <Link
                                to={`/tasks/${item.task.id}`}
                                className="text-sm font-medium text-slate-800 hover:text-brand-700"
                              >
                                {item.titleSnapshot}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium text-slate-800">{item.titleSnapshot}</span>
                            )}
                            {item.source === 'SELF' && <Badge tone={SOURCE_TONES.SELF}>Added by you</Badge>}
                            {item.source === 'ASSIGNED' && (
                              <Badge tone={SOURCE_TONES.ASSIGNED}>
                                {item.assignedBy
                                  ? `Assigned by ${item.assignedBy.firstName}`
                                  : 'Assigned'}
                              </Badge>
                            )}
                            <Badge tone={PRIORITY_STYLES[item.prioritySnapshot]}>
                              {titleCase(item.prioritySnapshot)}
                            </Badge>
                            {item.task?.isOverdue && <Badge tone={TASK_STATUS_STYLES.OVERDUE}>Overdue</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.task?.code ? `${item.task.code} · ` : ''}
                            {item.source === 'AUTO_TASK'
                              ? (TASK_STATUS_LABELS[item.statusSnapshot] ?? item.statusSnapshot)
                              : titleCase(item.status)}
                            {item.task?.dueDate ? ` · due ${formatDate(item.task.dueDate)}` : ''}
                            {item.dueTime ? ` · needed by ${item.dueTime}` : ''}
                          </p>
                        </div>

                        {/* Duties assigned to you are tracked on the plan itself,
                            so they can be closed without creating a task. */}
                        {item.source !== 'AUTO_TASK' && (
                          <Select
                            value={item.status}
                            onChange={(event) => void setItemStatus(item.id, event.target.value)}
                            className="w-auto min-w-[130px] py-1 text-xs"
                          >
                            {['PENDING', 'IN_PROGRESS', 'DONE', 'DROPPED'].map((value) => (
                              <option key={value} value={value}>
                                {titleCase(value)}
                              </option>
                            ))}
                          </Select>
                        )}
                      </div>

                      {item.instructions && (
                        <p className="mt-2 rounded-md border-l-2 border-brand-300 bg-brand-50/50 px-3 py-2 text-sm text-slate-700">
                          {item.instructions}
                        </p>
                      )}

                      <SodFiles item={item} onChange={reload} />

                      {submitted ? (
                        item.plannedOutcome && (
                          <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            {item.plannedOutcome}
                          </p>
                        )
                      ) : (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
                          <Input
                            placeholder="What will you get done on this today?"
                            value={drafts[item.id]?.plannedOutcome ?? ''}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: { ...current[item.id], plannedOutcome: event.target.value },
                              }))
                            }
                          />
                          <Input
                            type="number"
                            min={0}
                            max={24}
                            step={0.5}
                            placeholder="Hours"
                            value={drafts[item.id]?.plannedHours ?? ''}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: { ...current[item.id], plannedHours: event.target.value },
                              }))
                            }
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Employees can add their own entries at any point in the day —
                  before submitting, and after, when new work turns up. */}
              <div className="border-t border-slate-100 px-5 py-4">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_110px_auto]">
                  <Input
                    placeholder="Add your own planned work"
                    value={ownEntry.title}
                    onChange={(event) => setOwnEntry({ ...ownEntry, title: event.target.value })}
                  />
                  <Input
                    placeholder="Expected outcome"
                    value={ownEntry.plannedOutcome}
                    onChange={(event) => setOwnEntry({ ...ownEntry, plannedOutcome: event.target.value })}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    placeholder="Hours"
                    value={ownEntry.plannedHours}
                    onChange={(event) => setOwnEntry({ ...ownEntry, plannedHours: event.target.value })}
                  />
                  <Button
                    variant="secondary"
                    loading={busy}
                    disabled={ownEntry.title.trim().length < 3}
                    onClick={() => void addOwnEntry()}
                  >
                    Add
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Anything you add here is marked as your own entry and stays on the plan.
                </p>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Confirm your day">
              {submitted ? (
                <div className="space-y-3">
                  <InfoNote>
                    Submitted at {formatDateTime(sod.submittedAt)}. Your plan is locked for today.
                  </InfoNote>
                  {sod.plannedNote && (
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {sod.plannedNote}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Field label="Note for the day" hint="Optional — focus, priorities or anything your manager should know.">
                    <Textarea
                      rows={4}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Focusing on the release notes first, then review comments."
                    />
                  </Field>
                  <Button className="w-full" loading={busy} onClick={() => void submit()}>
                    Submit SOD
                  </Button>
                </div>
              )}
            </Card>

            <Card title="Recent SOD submissions" bodyClassName="p-0">
              {history.loading ? (
                <Spinner />
              ) : !history.data?.data.length ? (
                <EmptyState title="No history yet" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {history.data.data.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between px-5 py-2.5">
                      <span className="text-sm text-slate-700">{formatDate(entry.date)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{entry.items.length} item(s)</span>
                        <Badge tone={WORKFLOW_STYLES[entry.status]}>{titleCase(entry.status)}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Files on a single plan entry — a brief attached by whoever assigned the duty,
 * or evidence attached by the person doing it. Visibility is enforced on the
 * server by the reporting hierarchy; this is only the surface.
 */
function SodFiles({ item, onChange }: { item: SodItem; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAction();
  const { user } = useAuth();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const body = new FormData();
    Array.from(files).forEach((file) => body.append('files', file));
    const result = await run(() => api.upload(`/sod/entries/${item.id}/attachments`, body));
    if (input.current) input.current.value = '';
    if (result) onChange();
  };

  const remove = async (id: string) => {
    await run(() => api.delete(`/sod/attachments/${id}`));
    onChange();
  };

  const files = item.attachments ?? [];

  return (
    <div className="mt-2">
      {error && (
        <div className="mb-2">
          <ErrorNote message={error} />
        </div>
      )}

      {files.length > 0 && (
        <ul className="mb-2 space-y-1">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="h-3.5 w-3.5 shrink-0 text-slate-400"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinejoin="round" />
                <path d="M14 2v6h6" strokeLinejoin="round" />
              </svg>
              <button
                onClick={() => void downloadFile(`/sod/attachments/${file.id}/download`, file.originalName)}
                className="min-w-0 flex-1 truncate text-left font-medium text-slate-700 hover:text-brand-700 hover:underline"
              >
                {file.originalName}
              </button>
              <span className="shrink-0 text-slate-400">{formatBytes(file.size)}</span>
              <span className="hidden shrink-0 text-slate-400 sm:inline">{file.uploadedBy.firstName}</span>
              {file.uploadedBy.id === user?.id && (
                <button
                  onClick={() => void remove(file.id)}
                  className="shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Remove ${file.originalName}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <input ref={input} type="file" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
      <Button size="sm" variant="ghost" loading={busy} onClick={() => input.current?.click()}>
        {files.length ? '+ Add another file' : '+ Attach a file'}
      </Button>
    </div>
  );
}
