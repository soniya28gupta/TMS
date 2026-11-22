import { useMemo, useState } from 'react';
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
  Select,
  Spinner,
  Textarea,
  cx,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { PRIORITY_STYLES, WORKFLOW_STYLES, formatDate, titleCase, todayISO } from '../../lib/format';
import type { Paginated, Sod, SodItem } from '../../lib/types';

type EmployeeOption = {
  id: string;
  name: string;
  employeeCode: string;
  designation: string | null;
  department: { id: string; name: string } | null;
};

const SOURCE_LABELS: Record<string, string> = {
  AUTO_TASK: 'From task',
  ASSIGNED: 'Assigned',
  SELF: 'Self-added',
};

const SOURCE_TONES: Record<string, string> = {
  AUTO_TASK: 'bg-slate-100 text-slate-600 ring-slate-200',
  ASSIGNED: 'bg-brand-50 text-brand-700 ring-brand-200',
  SELF: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

/**
 * The manager→employee direction of SOD. Tasks already flow into the plan
 * automatically; this is for duties that are not worth a full task ticket.
 */
export default function AssignSod() {
  const [date, setDate] = useState(todayISO());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    title: '',
    instructions: '',
    priority: 'MEDIUM',
    plannedHours: '',
    dueTime: '',
  });

  const employees = useApi<{ data: EmployeeOption[] }>('/employees/options');
  const plans = useApi<Paginated<Sod>>(`/sod/history${queryString({ from: date, to: date, pageSize: 100 })}`);
  const { busy, error, run } = useAction();
  const [result, setResult] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = employees.data?.data ?? [];
    if (!term) return list;
    return list.filter((person) =>
      `${person.name} ${person.employeeCode} ${person.designation ?? ''}`.toLowerCase().includes(term),
    );
  }, [employees.data, search]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const assign = async () => {
    setResult(null);
    const payload = {
      userIds: [...selected],
      title: form.title.trim(),
      instructions: form.instructions.trim() || undefined,
      priority: form.priority,
      plannedHours: form.plannedHours ? Number(form.plannedHours) : undefined,
      dueTime: form.dueTime || undefined,
    };

    const response = await run(() =>
      api.post<{ count: number }>(`/sod/${date}/entries`, payload),
    );
    if (response) {
      setResult(`Added to ${response.count} employee plan(s).`);
      setForm({ title: '', instructions: '', priority: 'MEDIUM', plannedHours: '', dueTime: '' });
      setSelected(new Set());
      plans.reload();
    }
  };

  const assignedEntries = (plans.data?.data ?? []).flatMap((sod) =>
    sod.items
      .filter((item) => item.source !== 'AUTO_TASK')
      .map((item) => ({ item, sod })),
  );

  return (
    <>
      <PageHeader
        title="Assign daily duties"
        description="Put work straight onto an employee's Start-of-Day plan. Use this for duties that don't warrant a full task."
        actions={
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-auto"
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="New duty">
          <div className="space-y-3">
            {error && <ErrorNote message={error} />}
            {result && <InfoNote>{result}</InfoNote>}

            <Field label="What needs doing" required>
              <Input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Run the daily reconciliation report"
              />
            </Field>

            <Field label="Instructions" hint="Shown to the employee alongside the duty.">
              <Textarea
                rows={3}
                value={form.instructions}
                onChange={(event) => setForm({ ...form, instructions: event.target.value })}
                placeholder="Cover both the staging and production ledgers, then share the summary."
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Priority">
                <Select
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                >
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expected hours">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={form.plannedHours}
                  onChange={(event) => setForm({ ...form, plannedHours: event.target.value })}
                />
              </Field>
              <Field label="Needed by">
                <Input
                  type="time"
                  value={form.dueTime}
                  onChange={(event) => setForm({ ...form, dueTime: event.target.value })}
                />
              </Field>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="label mb-0">
                  Assign to ({selected.size} selected)
                </span>
                <Input
                  placeholder="Filter people…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-48"
                />
              </div>

              {employees.loading ? (
                <Spinner />
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                  {filtered.length === 0 ? (
                    <EmptyState title="No matching employees" />
                  ) : (
                    filtered.map((person) => (
                      <button
                        key={person.id}
                        onClick={() => toggle(person.id)}
                        className={cx(
                          'flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2 text-left transition last:border-0',
                          selected.has(person.id) ? 'bg-brand-50' : 'hover:bg-slate-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={selected.has(person.id)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
                        />
                        <Avatar size="sm" name={person.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {person.name}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {person.employeeCode}
                            {person.designation ? ` · ${person.designation}` : ''}
                          </span>
                        </span>
                        {person.department && (
                          <Badge className="shrink-0">{person.department.name}</Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <Button
              loading={busy}
              disabled={!form.title.trim() || selected.size === 0}
              onClick={() => void assign()}
            >
              Add to {selected.size || 'selected'} plan{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </Card>

        <Card
          title={`Duties on ${formatDate(date)}`}
          subtitle="Assigned and self-added entries — task-generated lines are not shown"
          bodyClassName="p-0"
        >
          {plans.loading && !plans.data ? (
            <Spinner />
          ) : assignedEntries.length === 0 ? (
            <EmptyState
              title="No duties for this day yet"
              description="Anything you assign appears here immediately."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {assignedEntries.map(({ item, sod }) => (
                <li key={item.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{item.titleSnapshot}</span>
                    <Badge tone={SOURCE_TONES[item.source]}>{SOURCE_LABELS[item.source]}</Badge>
                    <Badge tone={PRIORITY_STYLES[item.prioritySnapshot]}>
                      {titleCase(item.prioritySnapshot)}
                    </Badge>
                    <Badge tone={WORKFLOW_STYLES[item.status] ?? ''}>{titleCase(item.status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {sod.user?.firstName} {sod.user?.lastName}
                    {item.assignedBy && ` · assigned by ${item.assignedBy.firstName}`}
                    {item.dueTime && ` · by ${item.dueTime}`}
                  </p>
                  {item.instructions && (
                    <p className="mt-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                      {item.instructions}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
