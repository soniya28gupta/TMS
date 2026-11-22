import { useEffect, useState } from 'react';
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
  Spinner,
  Textarea,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import {
  EOD_CATEGORY_STYLES,
  WORKFLOW_STYLES,
  formatDate,
  formatDateTime,
  titleCase,
  todayISO,
} from '../../lib/format';
import type { Eod, EodItem, Paginated } from '../../lib/types';

const CATEGORY_ORDER: EodItem['category'][] = ['COMPLETED', 'PENDING', 'BLOCKED', 'ADDITIONAL'];
const CATEGORY_TITLES: Record<string, string> = {
  COMPLETED: 'Completed today',
  PENDING: 'Still pending',
  BLOCKED: 'Blocked',
  ADDITIONAL: 'Additional work',
};

export default function EodPage() {
  const [date] = useState(todayISO());
  const { data, loading, error, reload } = useApi<{ data: Eod }>('/eod/today');
  const history = useApi<Paginated<Eod>>(`/eod/history${queryString({ pageSize: 10 })}`);
  const { busy, error: actionError, run } = useAction();

  const eod = data?.data;
  const [form, setForm] = useState({
    workSummary: '',
    pendingReason: '',
    blockers: '',
    nextDayPlan: '',
    totalHours: '',
  });
  const [itemDrafts, setItemDrafts] = useState<
    Record<string, { category: 'COMPLETED' | 'PENDING' | 'BLOCKED'; hoursSpent: string; note: string; blockerReason: string }>
  >({});
  const [extras, setExtras] = useState<
    { title: string; category: 'COMPLETED' | 'PENDING' | 'BLOCKED' | 'ADDITIONAL'; pendingReason: string; note: string; hoursSpent: string }[]
  >([]);

  useEffect(() => {
    if (!eod) return;
    setForm({
      workSummary: eod.workSummary ?? '',
      pendingReason: eod.pendingReason ?? '',
      blockers: eod.blockers ?? '',
      nextDayPlan: eod.nextDayPlan ?? '',
      totalHours: eod.totalHours != null ? String(eod.totalHours) : '',
    });
    setItemDrafts(
      Object.fromEntries(
        eod.items.map((item) => [
          item.id,
          {
            category: (item.category === 'ADDITIONAL' ? 'COMPLETED' : item.category) as any,
            hoursSpent: item.hoursSpent != null ? String(item.hoursSpent) : '',
            note: item.note ?? '',
            blockerReason: item.blockerReason ?? '',
          },
        ]),
      ),
    );
  }, [eod?.id, eod?.items.length]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!eod) return null;

  const editable = eod.status === 'PENDING' || eod.status === 'CHANGES_REQUESTED';

  const submit = async () => {
    const result = await run(() =>
      api.post(`/eod/${date}/submit`, {
        workSummary: form.workSummary,
        pendingReason: form.pendingReason || undefined,
        blockers: form.blockers || undefined,
        nextDayPlan: form.nextDayPlan || undefined,
        totalHours: form.totalHours ? Number(form.totalHours) : undefined,
        items: eod.items
          .filter((item) => item.category !== 'ADDITIONAL')
          .map((item) => ({
            id: item.id,
            category: itemDrafts[item.id]?.category || item.category,
            hoursSpent: itemDrafts[item.id]?.hoursSpent ? Number(itemDrafts[item.id].hoursSpent) : undefined,
            note: itemDrafts[item.id]?.note || undefined,
            blockerReason: itemDrafts[item.id]?.blockerReason || undefined,
            pendingReason: itemDrafts[item.id]?.blockerReason || undefined,
          })),
        extraItems: extras
          .filter((row) => row.title.trim())
          .map((row) => ({
            title: row.title.trim(),
            category: row.category,
            pendingReason: row.pendingReason || undefined,
            note: row.note || undefined,
            hoursSpent: row.hoursSpent ? Number(row.hoursSpent) : undefined,
          })),
      }),
    );
    if (result) {
      setExtras([]);
      reload();
      history.reload();
    }
  };

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: eod.items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <PageHeader
        title="End of Day"
        description="Your completed, pending and blocked work is filled in from your tasks. Add the story and submit."
        actions={<Badge tone={WORKFLOW_STYLES[eod.status]}>{titleCase(eod.status)}</Badge>}
      />

      {actionError && <div className="mb-4"><ErrorNote message={actionError} /></div>}
      {eod.status === 'CHANGES_REQUESTED' && eod.reviewNotes && (
        <div className="mb-4">
          <InfoNote tone="amber">
            <strong>Changes requested:</strong> {eod.reviewNotes}
          </InfoNote>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card
            title={`Task summary — ${formatDate(eod.date)}`}
            subtitle="Pulled automatically from today's task activity"
            bodyClassName="p-0"
          >
            {grouped.length === 0 ? (
              <EmptyState title="Nothing to report yet" description="Tasks you work on today will appear here." />
            ) : (
              grouped.map((group) => (
                <div key={group.category} className="border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2 bg-slate-50/70 px-5 py-2">
                    <Badge tone={EOD_CATEGORY_STYLES[group.category]}>
                      {CATEGORY_TITLES[group.category]}
                    </Badge>
                    <span className="text-xs text-slate-500">{group.items.length}</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {group.items.map((item) => {
                      const currentCategory = itemDrafts[item.id]?.category || item.category;
                      return (
                        <li key={item.id} className="px-5 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium text-slate-800">{item.titleSnapshot}</span>
                            <span className="text-xs tabular-nums text-slate-500">
                              {item.task?.code ?? 'Ad-hoc'} · {item.progressAtEod}%
                            </span>
                          </div>

                          {editable ? (
                            <div className="mt-2.5 space-y-2">
                              {/* Quick Category / Status Selector */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-medium text-slate-500 mr-1">Status:</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setItemDrafts((curr) => ({
                                      ...curr,
                                      [item.id]: { ...curr[item.id], category: 'COMPLETED' },
                                    }))
                                  }
                                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                                    currentCategory === 'COMPLETED'
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  ✓ Completed
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setItemDrafts((curr) => ({
                                      ...curr,
                                      [item.id]: { ...curr[item.id], category: 'PENDING' },
                                    }))
                                  }
                                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                                    currentCategory === 'PENDING'
                                      ? 'bg-amber-600 text-white shadow-sm'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  ⏳ Work-In-Progress / Pending
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setItemDrafts((curr) => ({
                                      ...curr,
                                      [item.id]: { ...curr[item.id], category: 'BLOCKED' },
                                    }))
                                  }
                                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                                    currentCategory === 'BLOCKED'
                                      ? 'bg-rose-600 text-white shadow-sm'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  ⛔ Blocked
                                </button>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
                                <Input
                                  placeholder={
                                    currentCategory === 'BLOCKED'
                                      ? 'What is blocking this?'
                                      : currentCategory === 'PENDING'
                                      ? 'Reason why not completed (required)'
                                      : 'Note (optional)'
                                  }
                                  value={itemDrafts[item.id]?.blockerReason ?? itemDrafts[item.id]?.note ?? ''}
                                  onChange={(event) =>
                                    setItemDrafts((curr) => ({
                                      ...curr,
                                      [item.id]: {
                                        ...curr[item.id],
                                        blockerReason: event.target.value,
                                        note: event.target.value,
                                      },
                                    }))
                                  }
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  max={24}
                                  step={0.5}
                                  placeholder="Hours"
                                  value={itemDrafts[item.id]?.hoursSpent ?? ''}
                                  onChange={(event) =>
                                    setItemDrafts((curr) => ({
                                      ...curr,
                                      [item.id]: { ...curr[item.id], hoursSpent: event.target.value },
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1.5 space-y-0.5 text-sm text-slate-600">
                              {item.blockerReason && (
                                <p>
                                  <span className="font-semibold text-slate-700">
                                    {item.category === 'PENDING' ? 'Reason not completed: ' : item.category === 'BLOCKED' ? 'Blocker: ' : 'Reason: '}
                                  </span>
                                  {item.blockerReason}
                                </p>
                              )}
                              {item.note && item.note !== item.blockerReason && (
                                <p><span className="font-semibold text-slate-700">Note:</span> {item.note}</p>
                              )}
                              {item.hoursSpent ? <p className="text-xs text-slate-500">{item.hoursSpent}h spent</p> : null}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}

            {editable && (
              <div className="border-t border-slate-100 px-5 py-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Additional or Pending Work
                </div>
                {extras.map((row, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">Status:</span>
                        <button
                          type="button"
                          onClick={() =>
                            setExtras((curr) =>
                              curr.map((item, i) => (i === index ? { ...item, category: 'PENDING' } : item)),
                            )
                          }
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            row.category === 'PENDING'
                              ? 'bg-amber-600 text-white shadow-sm'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          Work-In-Progress / Pending
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExtras((curr) =>
                              curr.map((item, i) => (i === index ? { ...item, category: 'COMPLETED' } : item)),
                            )
                          }
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            row.category === 'COMPLETED' || row.category === 'ADDITIONAL'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          Completed
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExtras((curr) => curr.filter((_, i) => i !== index))}
                        className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                      >
                        Remove ✕
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_100px]">
                      <Input
                        placeholder={row.category === 'PENDING' ? 'Pending work title' : 'Additional work title'}
                        value={row.title}
                        onChange={(event) =>
                          setExtras((curr) =>
                            curr.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)),
                          )
                        }
                      />
                      <Input
                        placeholder={
                          row.category === 'PENDING'
                            ? 'Reason why not completed (required)'
                            : 'Note / Outcome'
                        }
                        value={row.category === 'PENDING' ? row.pendingReason : row.note}
                        onChange={(event) =>
                          setExtras((curr) =>
                            curr.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    pendingReason: event.target.value,
                                    note: event.target.value,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="Hours"
                        value={row.hoursSpent}
                        onChange={(event) =>
                          setExtras((curr) =>
                            curr.map((item, i) => (i === index ? { ...item, hoursSpent: event.target.value } : item)),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setExtras((curr) => [
                        ...curr,
                        { title: '', category: 'PENDING', pendingReason: '', note: '', hoursSpent: '' },
                      ])
                    }
                  >
                    + Add Pending Work
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setExtras((curr) => [
                        ...curr,
                        { title: '', category: 'COMPLETED', pendingReason: '', note: '', hoursSpent: '' },
                      ])
                    }
                  >
                    + Add Additional Work
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={editable ? 'Write your EOD' : 'Your EOD'}>
            {editable ? (
              <div className="space-y-3">
                <Field label="Work summary" required>
                  <Textarea
                    rows={4}
                    value={form.workSummary}
                    onChange={(event) => setForm({ ...form, workSummary: event.target.value })}
                    placeholder="What you achieved today, in a few lines."
                  />
                </Field>
                <Field label="Reason for pending work">
                  <Textarea
                    rows={2}
                    value={form.pendingReason}
                    onChange={(event) => setForm({ ...form, pendingReason: event.target.value })}
                    placeholder="Why anything is still open."
                  />
                </Field>
                <Field label="Issues / blockers">
                  <Textarea
                    rows={2}
                    value={form.blockers}
                    onChange={(event) => setForm({ ...form, blockers: event.target.value })}
                    placeholder="Anything you need help with."
                  />
                </Field>
                <Field label="Next-day plan">
                  <Textarea
                    rows={2}
                    value={form.nextDayPlan}
                    onChange={(event) => setForm({ ...form, nextDayPlan: event.target.value })}
                    placeholder="What you will pick up tomorrow."
                  />
                </Field>
                <Field label="Total hours" hint="Leave blank to use your attendance hours.">
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={form.totalHours}
                    onChange={(event) => setForm({ ...form, totalHours: event.target.value })}
                  />
                </Field>
                <Button
                  className="w-full"
                  loading={busy}
                  disabled={!form.workSummary.trim()}
                  onClick={() => void submit()}
                >
                  Submit EOD
                </Button>
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                <Detail label="Submitted" value={formatDateTime(eod.submittedAt)} />
                <Detail label="Total hours" value={eod.totalHours != null ? `${eod.totalHours} h` : '—'} />
                <Detail label="Work summary" value={eod.workSummary} block />
                <Detail label="Pending reason" value={eod.pendingReason} block />
                <Detail label="Blockers" value={eod.blockers} block />
                <Detail label="Next-day plan" value={eod.nextDayPlan} block />
                {eod.reviewNotes && <Detail label="Reviewer notes" value={eod.reviewNotes} block />}
              </dl>
            )}
          </Card>

          <Card title="Recent EOD submissions" bodyClassName="p-0">
            {history.loading ? (
              <Spinner />
            ) : !history.data?.data.length ? (
              <EmptyState title="No history yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.data.data.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm text-slate-700">{formatDate(entry.date)}</span>
                    <Badge tone={WORKFLOW_STYLES[entry.status]}>{titleCase(entry.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value, block }: { label: string; value?: string | null; block?: boolean }) {
  if (!value) return null;
  return (
    <div className={block ? '' : 'flex justify-between gap-3'}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={block ? 'mt-1 whitespace-pre-line text-slate-700' : 'text-slate-700'}>{value}</dd>
    </div>
  );
}
