import { useState } from 'react';
import { PageHeader } from '../../components/Layout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  Spinner,
  StatTile,
  Table,
  Textarea,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { api, queryString } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { ATTENDANCE_STYLES, formatDate, formatTime, shiftDate, titleCase, todayISO } from '../../lib/format';
import { formatCoordinates, getDetailedPosition } from '../../lib/geo';
import type { Attendance, Paginated } from '../../lib/types';

type AttendanceResponse = Paginated<Attendance> & {
  summary: Record<string, { count: number; minutes: number }>;
};

function formatWorkedDuration(
  workedMinutes?: number | null,
  checkInAt?: string | Date | null,
  checkOutAt?: string | Date | null,
): string {
  if (checkInAt && checkOutAt) {
    const inMs = new Date(checkInAt).getTime();
    const outMs = new Date(checkOutAt).getTime();
    if (!Number.isNaN(inMs) && !Number.isNaN(outMs)) {
      const ms = Math.max(0, outMs - inMs);
      const totalSec = Math.floor(ms / 1000);
      const hours = ms / 3600000;
      if (totalSec < 60) {
        return `${totalSec}s (${hours.toFixed(2)} hrs)`;
      }
      const mins = Math.floor(totalSec / 60);
      const remSec = totalSec % 60;
      if (mins < 60) {
        return remSec > 0 ? `${mins}m ${remSec}s (${hours.toFixed(2)} hrs)` : `${mins}m (${hours.toFixed(2)} hrs)`;
      }
      return `${hours.toFixed(2)} hrs (${Math.floor(hours)}h ${mins % 60}m)`;
    }
  }
  const mins = Number(workedMinutes) || 0;
  if (mins > 0) {
    const hours = mins / 60;
    if (mins < 60) {
      return `${mins}m (${hours.toFixed(2)} hrs)`;
    }
    return `${hours.toFixed(1)} hrs`;
  }
  return '0.0 hrs';
}

export default function AttendancePage() {
  const today = todayISO();
  const [range, setRange] = useState({ from: shiftDate(today, -29), to: today });
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<{
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const todayState = useApi<{ data: Attendance | null; canCheckIn: boolean; canCheckOut: boolean }>(
    '/attendance/today',
  );
  const list = useApi<AttendanceResponse>(
    `/attendance${queryString({ from: range.from, to: range.to, pageSize: 60 })}`,
  );
  const { error, run } = useAction();

  const punch = async (action: 'check-in' | 'check-out') => {
    setGpsNotice({ message: 'Acquiring location...', type: 'info' });
    setLocating(true);
    let capturedPosition: { latitude: number; longitude: number; accuracy?: number } | null = null;

    try {
      const { position, error: geoError } = await getDetailedPosition(8000);
      if (position) {
        capturedPosition = position;
        const accuracyNote = position.accuracy ? ` (±${Math.round(position.accuracy)}m)` : '';
        setGpsNotice({
          message: `GPS Captured${accuracyNote}. Submitting attendance...`,
          type: 'success',
        });
      } else {
        setGpsNotice({
          message: geoError
            ? `${geoError} Submitting attendance...`
            : 'GPS Unavailable. Submitting attendance...',
          type: geoError?.includes('denied') ? 'error' : 'warning',
        });
      }
    } catch {
      setGpsNotice({ message: 'GPS Unavailable. Submitting attendance...', type: 'warning' });
    } finally {
      setLocating(false);
    }

    setSubmitting(true);
    try {
      await run(() => api.post(`/attendance/${action}`, capturedPosition ? { position: capturedPosition } : {}));
      todayState.reload();
      list.reload();
      setTimeout(() => {
        setGpsNotice(null);
      }, 5000);
    } catch {
      setGpsNotice(null);
    } finally {
      setSubmitting(false);
    }
  };

  const summary = list.data?.summary ?? {};
  const totalMinutes = Object.values(summary).reduce((sum, entry) => sum + (entry?.minutes || 0), 0);

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Check in and out, review your working hours and raise corrections."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setCorrectionOpen(true)}>
              Request correction
            </Button>
            {todayState.data?.canCheckIn && (
              <Button loading={locating || submitting} onClick={() => void punch('check-in')}>
                <Icon.clock /> {locating ? 'Acquiring GPS…' : submitting ? 'Checking in…' : 'Check in'}
              </Button>
            )}
            {todayState.data?.canCheckOut && (
              <Button variant="secondary" loading={locating || submitting} onClick={() => void punch('check-out')}>
                <Icon.clock /> {locating ? 'Acquiring GPS…' : submitting ? 'Checking out…' : 'Check out'}
              </Button>
            )}
          </div>
        }
      />

      {gpsNotice && (
        <div
          className={`mb-4 flex items-center justify-between rounded-lg px-4 py-3 text-xs border ${
            gpsNotice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : gpsNotice.type === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : gpsNotice.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-brand-200 bg-brand-50 text-brand-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {locating ? <Spinner label="" /> : <span className="h-2 w-2 rounded-full bg-current" />}
            <span className="font-medium">{gpsNotice.message}</span>
          </div>
          {!locating && (
            <button
              onClick={() => setGpsNotice(null)}
              className="text-xs font-semibold underline hover:opacity-80 ml-3"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Today"
          value={
            todayState.data?.data ? titleCase(todayState.data.data.status) : 'Not marked'
          }
          hint={
            todayState.data?.data?.checkInAt
              ? `In ${formatTime(todayState.data.data.checkInAt)}${todayState.data.data.checkOutAt ? ` · Out ${formatTime(todayState.data.data.checkOutAt)}` : ''}`
              : 'No check-in recorded'
          }
        />
        <StatTile label="Present" value={summary.PRESENT?.count ?? 0} hint="in selected range" />
        <StatTile
          label="Late / half day"
          value={(summary.LATE?.count ?? 0) + (summary.HALF_DAY?.count ?? 0)}
          tone={(summary.LATE?.count ?? 0) > 0 ? 'text-amber-600' : 'text-slate-900'}
        />
        <StatTile label="Total hours" value={((totalMinutes || 0) / 60).toFixed(1)} hint="in selected range" />
      </div>

      {/* Completed Shift Banner */}
      {todayState.data?.data?.checkInAt && todayState.data?.data?.checkOutAt && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Icon.check className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-950">Shift Completed for Today</p>
                <p className="text-xs text-emerald-700">
                  In: {formatTime(todayState.data.data.checkInAt)} · Out: {formatTime(todayState.data.data.checkOutAt)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
              <div>
                <span className="font-medium text-slate-500">Check-In GPS: </span>
                {todayState.data.data.checkInLatitude != null && todayState.data.data.checkInLongitude != null ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>GPS Captured</span>
                    <span className="font-mono font-normal text-slate-600 text-[11px]">
                      ({formatCoordinates(todayState.data.data.checkInLatitude, todayState.data.data.checkInLongitude)}
                      {todayState.data.data.checkInAccuracy ? ` · ±${Math.round(todayState.data.data.checkInAccuracy)}m` : ''})
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-slate-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
                    <span>GPS Unavailable</span>
                  </span>
                )}
              </div>
              <div>
                <span className="font-medium text-slate-500">Check-Out GPS: </span>
                {todayState.data.data.checkOutLatitude != null && todayState.data.data.checkOutLongitude != null ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>GPS Captured</span>
                    <span className="font-mono font-normal text-slate-600 text-[11px]">
                      ({formatCoordinates(todayState.data.data.checkOutLatitude, todayState.data.data.checkOutLongitude)}
                      {todayState.data.data.checkOutAccuracy ? ` · ±${Math.round(todayState.data.data.checkOutAccuracy)}m` : ''})
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-slate-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
                    <span>GPS Unavailable</span>
                  </span>
                )}
              </div>
              <div>
                <span className="font-medium text-slate-500">Worked: </span>
                <span className="font-bold text-slate-900">
                  {formatWorkedDuration(
                    todayState.data.data.workedMinutes,
                    todayState.data.data.checkInAt,
                    todayState.data.data.checkOutAt,
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Shift Card */}
      {todayState.data?.data?.checkInAt && !todayState.data?.data?.checkOutAt && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                <Icon.clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-950">Active Shift in Progress</p>
                <p className="text-xs text-brand-700">
                  Checked in at {formatTime(todayState.data.data.checkInAt)} · Check-In GPS:{' '}
                  {todayState.data.data.checkInLatitude != null && todayState.data.data.checkInLongitude != null ? (
                    <span className="font-semibold text-emerald-800">
                      GPS Captured{' '}
                      <span className="font-mono font-normal text-slate-700 text-[11px]">
                        ({formatCoordinates(todayState.data.data.checkInLatitude, todayState.data.data.checkInLongitude)}
                        {todayState.data.data.checkInAccuracy ? ` · ±${Math.round(todayState.data.data.checkInAccuracy)}m` : ''})
                      </span>
                    </span>
                  ) : (
                    <span className="font-medium text-slate-400">GPS Unavailable</span>
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              loading={locating || submitting}
              onClick={() => void punch('check-out')}
            >
              <Icon.clock /> {locating ? 'Acquiring GPS…' : submitting ? 'Checking out…' : 'Check out'}
            </Button>
          </div>
        </div>
      )}

      <Card
        className="mt-4"
        title="History"
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={range.from}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
              className="w-auto"
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              value={range.to}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
              className="w-auto"
            />
          </div>
        }
        bodyClassName="p-0"
      >
        {list.loading && !list.data ? (
          <Spinner />
        ) : !list.data?.data.length ? (
          <EmptyState title="No attendance records in this range" />
        ) : (
          <Table
            head={
              <tr>
                <th className="th">Date</th>
                <th className="th">Status</th>
                <th className="th">Check in</th>
                <th className="th">Check out</th>
                <th className="th">Hours</th>
                <th className="th">Location</th>
                <th className="th">Note</th>
              </tr>
            }
          >
            {list.data.data.map((record) => {
              const inCoords = formatCoordinates(record.checkInLatitude, record.checkInLongitude);
              const outCoords = formatCoordinates(record.checkOutLatitude, record.checkOutLongitude);
              return (
                <tr key={record.id}>
                  <td className="td whitespace-nowrap font-medium">{formatDate(record.date)}</td>
                  <td className="td">
                    <Badge tone={ATTENDANCE_STYLES[record.status] ?? ATTENDANCE_STYLES.UNKNOWN}>
                      {titleCase(record.status)}
                    </Badge>
                  </td>
                  <td className="td">{formatTime(record.checkInAt)}</td>
                  <td className="td">{formatTime(record.checkOutAt)}</td>
                  <td className="td tabular-nums">
                    {(() => {
                      const mins = Number(record.workedMinutes) || 0;
                      if (mins > 0) return (mins / 60).toFixed(2);
                      if (record.checkInAt && record.checkOutAt) {
                        const inMs = new Date(record.checkInAt).getTime();
                        const outMs = new Date(record.checkOutAt).getTime();
                        if (!Number.isNaN(inMs) && !Number.isNaN(outMs)) {
                          const ms = Math.max(0, outMs - inMs);
                          return Math.max(0.01, ms / 3600000).toFixed(2);
                        }
                      }
                      return '0.00';
                    })()}
                  </td>
                  <td className="td text-xs">
                    {inCoords || outCoords ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 font-semibold text-emerald-700 text-[11px]">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span>GPS Captured</span>
                        </div>
                        {inCoords && (
                          <div className="font-mono text-slate-700 flex items-center gap-1 text-[11px]">
                            <span className="text-[10px] text-slate-400 font-sans uppercase">In:</span> {inCoords}
                            {record.checkInAccuracy ? <span className="text-[10px] text-slate-400 font-sans">±{Math.round(record.checkInAccuracy)}m</span> : null}
                          </div>
                        )}
                        {outCoords && (
                          <div className="font-mono text-slate-600 flex items-center gap-1 text-[11px]">
                            <span className="text-[10px] text-slate-400 font-sans uppercase">Out:</span> {outCoords}
                            {record.checkOutAccuracy ? <span className="text-[10px] text-slate-400 font-sans">±{Math.round(record.checkOutAccuracy)}m</span> : null}
                          </div>
                        )}
                        {record.checkInWithinGeofence === false && (
                          <Badge tone="bg-amber-50 text-amber-700 ring-amber-200 text-[10px]">
                            Off-site
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 font-medium text-slate-400 text-xs">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
                        <span>GPS Unavailable</span>
                      </div>
                    )}
                  </td>
                  <td className="td text-xs text-slate-500">
                    {record.isManual ? 'Manual entry · ' : ''}
                    {record.note ?? '—'}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <CorrectionModal
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        onDone={() => {
          setCorrectionOpen(false);
          list.reload();
        }}
      />
    </>
  );
}

function CorrectionModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ date: todayISO(), checkIn: '09:30', checkOut: '18:30', reason: '' });
  const { busy, error, run } = useAction();

  const submit = async () => {
    const result = await run(() =>
      api.post('/attendance/corrections', {
        date: form.date,
        requestedCheckIn: new Date(`${form.date}T${form.checkIn}:00`).toISOString(),
        requestedCheckOut: new Date(`${form.date}T${form.checkOut}:00`).toISOString(),
        reason: form.reason,
      }),
    );
    if (result) onDone();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request attendance correction"
      description="Your manager or HR will review this."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={form.reason.trim().length < 5} onClick={() => void submit()}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorNote message={error} />}
        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Check in">
            <Input type="time" value={form.checkIn} onChange={(event) => setForm({ ...form, checkIn: event.target.value })} />
          </Field>
          <Field label="Check out">
            <Input type="time" value={form.checkOut} onChange={(event) => setForm({ ...form, checkOut: event.target.value })} />
          </Field>
        </div>
        <Field label="Reason" required hint="At least 5 characters.">
          <Textarea
            rows={3}
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
            placeholder="Forgot to check out — left the office at 18:30."
          />
        </Field>
      </div>
    </Modal>
  );
}
