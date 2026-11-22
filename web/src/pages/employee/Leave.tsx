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
  Modal,
  Select,
  Spinner,
  Table,
  Textarea,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { WORKFLOW_STYLES, formatDate, titleCase, todayISO } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import type { LeaveBalance, LeaveRequest, Paginated } from '../../lib/types';

type LeaveType = { id: string; name: string; code: string; color: string; allowHalfDay: boolean };
type Holiday = { id: string; name: string; date: string; isOptional: boolean };

export default function LeavePage() {
  const { user, can } = useAuth();
  const canApprove = can('leave.approve');
  const [applyOpen, setApplyOpen] = useState(false);

  // My requests & balances
  const balances = useApi<{ data: LeaveBalance[] }>('/leave/balance');
  const requests = useApi<Paginated<LeaveRequest>>(
    user?.id ? `/leave${queryString({ userId: user.id, pageSize: 25 })}` : `/leave${queryString({ pageSize: 25 })}`,
  );
  const holidays = useApi<{ data: Holiday[] }>('/leave/holidays');

  // Approvals queue for managers / approvers
  const pendingApprovals = useApi<Paginated<LeaveRequest>>(
    canApprove ? `/leave${queryString({ status: 'PENDING', pageSize: 50 })}` : null,
  );

  const { busy, error, run } = useAction();

  // Selection & decision state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [decideModal, setDecideModal] = useState<{
    open: boolean;
    batch: boolean;
    targetReq?: LeaveRequest;
    action: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [decideNote, setDecideNote] = useState('');

  const cancel = async (id: string) => {
    await run(() => api.post(`/leave/${id}/cancel`));
    requests.reload();
    balances.reload();
  };

  const teamPendingList = (pendingApprovals?.data?.data || []).filter(
    (r) => (r.user?.id ? r.user.id !== user?.id : r.userId !== user?.id),
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allTeamSelected =
    teamPendingList.length > 0 && teamPendingList.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allTeamSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(teamPendingList.map((r) => r.id)));
    }
  };

  const executeDecision = async () => {
    if (!decideModal) return;
    if (decideModal.batch) {
      await run(() =>
        api.post('/leave/batch-decide', {
          ids: Array.from(selectedIds),
          action: decideModal.action,
          note: decideNote || undefined,
        }),
      );
      setSelectedIds(new Set());
    } else if (decideModal.targetReq) {
      await run(() =>
        api.post(`/leave/${decideModal.targetReq!.id}/decide`, {
          action: decideModal.action,
          note: decideNote || undefined,
        }),
      );
    }
    setDecideModal(null);
    setDecideNote('');
    pendingApprovals.reload();
    requests.reload();
    balances.reload();
  };

  return (
    <>
      <PageHeader
        title="Leave"
        description="Check your balance, apply for time off and follow the approval status."
        actions={<Button onClick={() => setApplyOpen(true)}>Apply for leave</Button>}
      />

      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balances.loading && !balances.data ? (
          <Spinner />
        ) : (
          balances.data?.data.map((balance) => (
            <div key={balance.id} className="card p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: balance.leaveType.color }} />
                <p className="text-sm font-medium text-slate-700">{balance.leaveType.name}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
                {balance.available}
                <span className="text-sm font-normal text-slate-400">
                  {' '}
                  / {balance.entitled + balance.carriedForward}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {balance.used} used · {balance.pending} pending
              </p>
            </div>
          ))
        )}
      </div>

      {canApprove && (
        <div className="mt-4">
          <Card
            title={
              <div className="flex items-center gap-2">
                <span>Team Leave Requests (Pending Approval)</span>
                {teamPendingList.length > 0 && (
                  <Badge tone="bg-amber-100 text-amber-800 ring-amber-200">
                    {teamPendingList.length} Pending
                  </Badge>
                )}
              </div>
            }
            subtitle="Approve or reject leave applications submitted by your reporting subordinates"
            bodyClassName="p-0"
          >
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100 bg-primary-50/90 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                    {selectedIds.size}
                  </span>
                  <span className="text-xs font-semibold text-primary-950">
                    {selectedIds.size} application{selectedIds.size > 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() =>
                      setDecideModal({ open: true, batch: true, action: 'APPROVE' })
                    }
                  >
                    ✓ Approve Selected ({selectedIds.size})
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      setDecideModal({ open: true, batch: true, action: 'REJECT' })
                    }
                  >
                    ✕ Reject Selected ({selectedIds.size})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Deselect
                  </Button>
                </div>
              </div>
            )}

            {pendingApprovals.loading && !pendingApprovals.data ? (
              <Spinner />
            ) : teamPendingList.length === 0 ? (
              <EmptyState
                title="No pending team requests"
                description="When your team members submit leave applications, they will appear here with checkboxes for your approval."
              />
            ) : (
              <Table
                head={
                  <tr>
                    <th className="w-10 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                        checked={allTeamSelected}
                        onChange={toggleSelectAll}
                        title="Select All"
                      />
                    </th>
                    <th className="th">Employee</th>
                    <th className="th">Type</th>
                    <th className="th">Dates</th>
                    <th className="th">Days</th>
                    <th className="th">Reason</th>
                    <th className="th text-right">Action</th>
                  </tr>
                }
              >
                {teamPendingList.map((req) => {
                  const isSelected = selectedIds.has(req.id);
                  return (
                    <tr
                      key={req.id}
                      className={`hover:bg-slate-50 transition ${isSelected ? 'bg-primary-50/40' : ''}`}
                    >
                      <td className="w-10 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelect(req.id)}
                        />
                      </td>
                      <td className="td whitespace-nowrap">
                        <p className="font-semibold text-slate-800">
                          {req.user?.firstName} {req.user?.lastName}
                        </p>
                        <p className="text-xs text-slate-400">{req.user?.employeeCode}</p>
                      </td>
                      <td className="td whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: req.leaveType?.color }}
                          />
                          {req.leaveType?.name}
                        </span>
                      </td>
                      <td className="td whitespace-nowrap">
                        {formatDate(req.startDate)}
                        {req.startDate !== req.endDate && ` → ${formatDate(req.endDate)}`}
                      </td>
                      <td className="td tabular-nums">
                        {req.days} {req.isHalfDay ? '(Half)' : ''}
                      </td>
                      <td className="td max-w-[200px] truncate text-slate-600">{req.reason}</td>
                      <td className="td text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() =>
                              setDecideModal({
                                open: true,
                                batch: false,
                                targetReq: req,
                                action: 'APPROVE',
                              })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() =>
                              setDecideModal({
                                open: true,
                                batch: false,
                                targetReq: req,
                                action: 'REJECT',
                              })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="My requests" bodyClassName="p-0">
          {requests.loading && !requests.data ? (
            <Spinner />
          ) : !requests.data?.data.length ? (
            <EmptyState title="No leave requests yet" />
          ) : (
            <Table
              head={
                <tr>
                  <th className="th">Type</th>
                  <th className="th">Dates</th>
                  <th className="th">Days</th>
                  <th className="th">Status</th>
                  <th className="th">Reason</th>
                  <th className="th" />
                </tr>
              }
            >
              {requests.data.data.map((request) => (
                <tr key={request.id}>
                  <td className="td whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: request.leaveType.color }}
                      />
                      {request.leaveType.name}
                    </span>
                  </td>
                  <td className="td whitespace-nowrap">
                    {formatDate(request.startDate)}
                    {request.startDate !== request.endDate && ` → ${formatDate(request.endDate)}`}
                  </td>
                  <td className="td tabular-nums">{request.days}</td>
                  <td className="td">
                    <Badge tone={WORKFLOW_STYLES[request.status]}>{titleCase(request.status)}</Badge>
                  </td>
                  <td className="td max-w-[220px] truncate text-slate-500">{request.reason}</td>
                  <td className="td text-right">
                    {['PENDING', 'APPROVED'].includes(request.status) && (
                      <Button size="sm" variant="ghost" loading={busy} onClick={() => void cancel(request.id)}>
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Holiday calendar" bodyClassName="p-0">
          {holidays.loading ? (
            <Spinner />
          ) : !holidays.data?.data.length ? (
            <EmptyState title="No holidays configured" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {holidays.data.data.map((holiday) => (
                <li key={holiday.id} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-slate-700">{holiday.name}</span>
                  <span className="text-xs text-slate-500">{formatDate(holiday.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Decision Modal */}
      {decideModal && (
        <Modal
          open={decideModal.open}
          onClose={() => setDecideModal(null)}
          title={
            decideModal.batch
              ? `${decideModal.action === 'APPROVE' ? 'Approve' : 'Reject'} ${selectedIds.size} Requests`
              : `${decideModal.action === 'APPROVE' ? 'Approve' : 'Reject'} Leave Request`
          }
          description={
            decideModal.batch
              ? `You are about to ${decideModal.action.toLowerCase()} ${selectedIds.size} team leave applications.`
              : `Applicant: ${decideModal.targetReq?.user?.firstName} ${decideModal.targetReq?.user?.lastName}`
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setDecideModal(null)}>
                Cancel
              </Button>
              <Button
                variant={decideModal.action === 'APPROVE' ? 'success' : 'danger'}
                loading={busy}
                onClick={executeDecision}
              >
                {decideModal.action === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Note / Remark for Employee (Optional)">
              <Textarea
                rows={3}
                placeholder="Enter remark or message to applicant..."
                value={decideNote}
                onChange={(e) => setDecideNote(e.target.value)}
              />
            </Field>
          </div>
        </Modal>
      )}

      <ApplyModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onDone={() => {
          setApplyOpen(false);
          requests.reload();
          balances.reload();
        }}
      />
    </>
  );
}

function ApplyModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const types = useApi<{ data: LeaveType[] }>(open ? '/leave/types' : null);
  const { busy, error, run } = useAction();
  const [form, setForm] = useState({
    leaveTypeId: '',
    startDate: todayISO(),
    endDate: todayISO(),
    isHalfDay: false,
    reason: '',
  });
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    if (!types.data?.data.length || form.leaveTypeId) return;
    setForm((current) => ({ ...current, leaveTypeId: types.data!.data[0].id }));
  }, [types.data]);

  // Ask the server how many working days the range costs — it knows the
  // employee's week and the holiday calendar.
  useEffect(() => {
    if (!open || !form.startDate || !form.endDate) return;
    let cancelled = false;
    api
      .get<{ days: number }>(
        `/leave/estimate${queryString({ startDate: form.startDate, endDate: form.endDate, isHalfDay: form.isHalfDay })}`,
      )
      .then((res) => {
        if (!cancelled) setDays(res.days);
      })
      .catch(() => setDays(null));
    return () => {
      cancelled = true;
    };
  }, [open, form.startDate, form.endDate, form.isHalfDay]);

  const submit = async () => {
    const result = await run(() =>
      api.post('/leave', {
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.isHalfDay ? form.startDate : form.endDate,
        isHalfDay: form.isHalfDay,
        reason: form.reason,
      }),
    );
    if (result) onDone();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply for leave"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!form.leaveTypeId || form.reason.trim().length < 5}
            onClick={() => void submit()}
          >
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorNote message={error} />}

        <Field label="Leave type" required>
          <Select
            value={form.leaveTypeId}
            onChange={(event) => setForm({ ...form, leaveTypeId: event.target.value })}
          >
            {types.data?.data.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isHalfDay}
            onChange={(event) => setForm({ ...form, isHalfDay: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
          />
          Half day
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" required>
            <Input
              type="date"
              value={form.startDate}
              onChange={(event) =>
                setForm({
                  ...form,
                  startDate: event.target.value,
                  endDate: event.target.value > form.endDate ? event.target.value : form.endDate,
                })
              }
            />
          </Field>
          <Field label="To" required>
            <Input
              type="date"
              disabled={form.isHalfDay}
              value={form.isHalfDay ? form.startDate : form.endDate}
              min={form.startDate}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
            />
          </Field>
        </div>

        {days !== null && (
          <InfoNote>
            This request uses <strong>{days}</strong> working day{days === 1 ? '' : 's'} (weekends and
            holidays are not counted).
          </InfoNote>
        )}

        <Field label="Reason" required hint="At least 5 characters.">
          <Textarea
            rows={3}
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
