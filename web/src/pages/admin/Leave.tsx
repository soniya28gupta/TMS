import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/Layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Pagination,
  Select,
  Spinner,
  Table,
  Textarea,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { LeaveRequest, Paginated } from '../../lib/types';

export default function AdminLeave() {
  const [status, setStatus] = useState('PENDING');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Approval Modal
  const [selectedReq, setSelectedReq] = useState<LeaveRequest | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchActionType, setBatchActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [batchNote, setBatchNote] = useState('');
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  const loadLeaves = async () => {
    try {
      setLoading(true);
      const query = queryString({ status, page, pageSize: 15 });
      const res = await api.get<Paginated<LeaveRequest>>(`/leave${query}`);
      setRequests(res.data || []);
      setMeta(res.meta);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch leave requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, [status, page]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingRequests = requests.filter((r) => r.status === 'PENDING');
  const allSelected = pendingRequests.length > 0 && pendingRequests.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRequests.map((r) => r.id)));
    }
  };

  const handleActionSubmit = async () => {
    if (!selectedReq || !actionType) return;
    try {
      setSubmitting(true);
      await api.post(`/leave/${selectedReq.id}/decide`, { action: actionType, note });
      setSelectedReq(null);
      setActionType(null);
      setNote('');
      loadLeaves();
    } catch (err: any) {
      alert(err.message || 'Failed to process request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchSubmit = async () => {
    if (!batchActionType || selectedIds.size === 0) return;
    try {
      setSubmitting(true);
      await api.post('/leave/batch-decide', {
        ids: Array.from(selectedIds),
        action: batchActionType,
        note: batchNote || undefined,
      });
      setBatchModalOpen(false);
      setBatchActionType(null);
      setBatchNote('');
      setSelectedIds(new Set());
      loadLeaves();
    } catch (err: any) {
      alert(err.message || 'Failed to process batch request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management & Approvals"
        description="Review, approve, or reject leave applications submitted by workforce members."
      />

      {/* Filter Bar & Batch Bar */}
      <Card bodyClassName="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="PENDING">Pending Approval Queue</option>
            <option value="APPROVED">Approved Requests</option>
            <option value="REJECTED">Rejected Requests</option>
            <option value="">All Requests</option>
          </Select>
          <Button variant="secondary" onClick={() => { setStatus('PENDING'); setPage(1); }}>
            Reset Filter
          </Button>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                {selectedIds.size}
              </span>
              <span className="text-sm font-semibold text-primary-950">
                {selectedIds.size} request{selectedIds.size > 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="success"
                size="sm"
                onClick={() => {
                  setBatchActionType('APPROVE');
                  setBatchModalOpen(true);
                }}
              >
                ✓ Approve Selected ({selectedIds.size})
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setBatchActionType('REJECT');
                  setBatchModalOpen(true);
                }}
              >
                ✕ Reject Selected ({selectedIds.size})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Deselect All
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Requests Table */}
      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label="Loading leave applications..." />
        ) : error ? (
          <div className="p-4">
            <ErrorNote message={error} />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState title="No leave applications" description="No requests match your selected status filter." />
        ) : (
          <>
            <Table
              head={
                <tr>
                  <th className="w-10 px-4 py-3 text-center">
                    {pendingRequests.length > 0 && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        title="Select All Pending"
                      />
                    )}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Leave Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Dates & Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Action</th>
                </tr>
              }
            >
              {requests.map((req) => {
                const isSelected = selectedIds.has(req.id);
                return (
                  <tr key={req.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-primary-50/40' : ''}`}>
                    <td className="w-10 px-4 py-3 text-center">
                      {req.status === 'PENDING' ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelect(req.id)}
                        />
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={`${req.user?.firstName || ''} ${req.user?.lastName || ''}`} />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {req.user?.firstName} {req.user?.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{req.user?.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700">{req.leaveType.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-800">
                      <p className="font-semibold">{formatDate(req.startDate)} to {formatDate(req.endDate)}</p>
                      <p className="text-slate-500">{req.days} Day{req.days > 1 ? 's' : ''} {req.isHalfDay ? '(Half Day)' : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{req.reason}</td>
                    <td className="px-4 py-3 text-xs">
                      <Badge
                        tone={
                          req.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : req.status === 'PENDING'
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-rose-50 text-rose-700 ring-rose-200'
                        }
                      >
                        {req.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {req.status === 'PENDING' ? (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => { setSelectedReq(req); setActionType('APPROVE'); }}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => { setSelectedReq(req); setActionType('REJECT'); }}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-slate-400">Processed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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

      {/* Decision Modal */}
      <Modal
        open={!!selectedReq}
        onClose={() => setSelectedReq(null)}
        title={actionType === 'APPROVE' ? 'Approve Leave Request' : 'Reject Leave Request'}
        description={`Applicant: ${selectedReq?.user?.firstName} ${selectedReq?.user?.lastName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelectedReq(null)}>
              Cancel
            </Button>
            <Button
              variant={actionType === 'APPROVE' ? 'success' : 'danger'}
              loading={submitting}
              onClick={handleActionSubmit}
            >
              {actionType === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Note / Remark for Employee (Optional)">
            <Textarea
              rows={3}
              placeholder="Enter remark..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* Batch Decision Modal */}
      <Modal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        title={batchActionType === 'APPROVE' ? `Approve ${selectedIds.size} Requests` : `Reject ${selectedIds.size} Requests`}
        description={`Perform bulk ${batchActionType === 'APPROVE' ? 'approval' : 'rejection'} for ${selectedIds.size} selected leave applications.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBatchModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={batchActionType === 'APPROVE' ? 'success' : 'danger'}
              loading={submitting}
              onClick={handleBatchSubmit}
            >
              {batchActionType === 'APPROVE' ? 'Approve All Selected' : 'Reject All Selected'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Optional Note / Reason for Batch Decision">
            <Textarea
              rows={3}
              placeholder="Reason or notes applied to all selected requests..."
              value={batchNote}
              onChange={(e) => setBatchNote(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
