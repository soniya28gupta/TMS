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
  Input,
  Modal,
  Spinner,
  Textarea,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Eod, Sod } from '../../lib/types';

export default function SodEodMonitor() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tab, setTab] = useState<'EOD' | 'SOD'>('EOD');
  const [eodList, setEodList] = useState<Eod[]>([]);
  const [sodList, setSodList] = useState<Sod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // EOD Review Modal
  const [selectedEod, setSelectedEod] = useState<Eod | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      // History is a range query; a single day is from == to.
      const query = queryString({ from: date, to: date, pageSize: 100 });
      if (tab === 'EOD') {
        const res = await api.get<{ data: Eod[] }>(`/eod/history${query}`);
        setEodList(res.data || []);
      } else {
        const res = await api.get<{ data: Sod[] }>(`/sod/history${query}`);
        setSodList(res.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch monitoring data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [date, tab]);

  const handleReviewEod = async (action: 'APPROVE' | 'REQUEST_CHANGES') => {
    if (!selectedEod) return;
    try {
      setSubmitting(true);
      await api.post(`/eod/${selectedEod.id}/review`, {
        action,
        notes: reviewNotes || (action === 'APPROVE' ? 'EOD approved' : 'Please revise your EOD'),
      });
      setSelectedEod(null);
      setReviewNotes('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="SOD & EOD Work Compliance Monitor"
        description="Audit daily Start of Day acknowledgements and review End of Day work summaries across all employees."
      />

      {/* Date & Tab Filter */}
      <Card bodyClassName="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setTab('EOD')}
              className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
                tab === 'EOD' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
              }`}
            >
              End of Day (EOD) Submissions
            </button>
            <button
              onClick={() => setTab('SOD')}
              className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
                tab === 'SOD' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
              }`}
            >
              Start of Day (SOD) Submissions
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Select Date:</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* List Container */}
      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label={`Loading ${tab} submissions for ${formatDate(date)}...`} />
        ) : error ? (
          <div className="p-4">
            <ErrorNote message={error} />
          </div>
        ) : tab === 'EOD' ? (
          eodList.length === 0 ? (
            <EmptyState title="No EOD submissions" description={`No EOD records found for date ${formatDate(date)}.`} />
          ) : (
            <div className="divide-y divide-slate-100">
              {eodList.map((eod) => (
                <div key={eod.id} className="p-5 hover:bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${eod.user?.firstName || ''} ${eod.user?.lastName || ''}`} />
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          {eod.user?.firstName} {eod.user?.lastName} ({eod.user?.employeeCode})
                        </h4>
                        <p className="text-xs text-slate-500">
                          Submitted on {eod.submittedAt ? formatDate(eod.submittedAt) : 'Draft'} · Total Hours:{' '}
                          {eod.totalHours || 0} hrs
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          eod.status === 'REVIEWED'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : eod.status === 'SUBMITTED'
                            ? 'bg-violet-50 text-violet-700 ring-violet-200'
                            : 'bg-amber-50 text-amber-700 ring-amber-200'
                        }
                      >
                        {eod.status}
                      </Badge>
                      {eod.status === 'SUBMITTED' && (
                        <Button size="sm" onClick={() => setSelectedEod(eod)}>
                          Review EOD
                        </Button>
                      )}
                    </div>
                  </div>

                  {eod.workSummary && (
                    <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                      <p className="text-xs font-semibold text-slate-700">Work Summary:</p>
                      <p className="text-xs text-slate-600 mt-0.5">{eod.workSummary}</p>
                    </div>
                  )}

                  {eod.blockers && (
                    <div className="rounded-lg bg-rose-50 p-3 border border-rose-200">
                      <p className="text-xs font-semibold text-rose-800">Blockers Reported:</p>
                      <p className="text-xs text-rose-700 mt-0.5">{eod.blockers}</p>
                    </div>
                  )}

                  {eod.nextDayPlan && (
                    <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
                      <p className="text-xs font-semibold text-blue-800">Next Day Plan:</p>
                      <p className="text-xs text-blue-700 mt-0.5">{eod.nextDayPlan}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : sodList.length === 0 ? (
          <EmptyState title="No SOD submissions" description={`No SOD records found for date ${formatDate(date)}.`} />
        ) : (
          <div className="divide-y divide-slate-100">
            {sodList.map((sod) => (
              <div key={sod.id} className="p-5 hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={`${sod.user?.firstName || ''} ${sod.user?.lastName || ''}`} />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {sod.user?.firstName} {sod.user?.lastName} ({sod.user?.employeeCode})
                      </h4>
                      <p className="text-xs text-slate-500">
                        Submitted: {sod.submittedAt ? formatDate(sod.submittedAt) : 'Pending'}
                      </p>
                    </div>
                  </div>
                  <Badge
                    tone={
                      sod.status === 'SUBMITTED'
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-amber-50 text-amber-700 ring-amber-200'
                    }
                  >
                    {sod.status}
                  </Badge>
                </div>
                {sod.plannedNote && (
                  <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                    <strong>Planned Note:</strong> {sod.plannedNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Review Modal */}
      <Modal
        open={!!selectedEod}
        onClose={() => setSelectedEod(null)}
        title="Review End of Day (EOD) Submission"
        description={`Employee: ${selectedEod?.user?.firstName} ${selectedEod?.user?.lastName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelectedEod(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={submitting} onClick={() => handleReviewEod('REQUEST_CHANGES')}>
              Request Changes
            </Button>
            <Button variant="success" loading={submitting} onClick={() => handleReviewEod('APPROVE')}>
              Approve EOD
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Reviewer Notes / Feedback">
            <Textarea
              rows={3}
              placeholder="Enter optional comments or feedback for employee..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
