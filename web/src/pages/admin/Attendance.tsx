import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/Layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Input,
  Pagination,
  Select,
  Spinner,
  Table,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { formatCoordinates, mapsUrl } from '../../lib/geo';
import type { Attendance, Paginated } from '../../lib/types';

export default function AdminAttendance() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState('');
  const [records, setRecords] = useState<Attendance[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      // The attendance list is a date *range* query; a single day is from == to.
      const query = queryString({ from: date, to: date, status, page, pageSize: 15 });
      const res = await api.get<Paginated<Attendance>>(`/attendance${query}`);
      setRecords(res.data || []);
      setMeta(res.meta);
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [date, status, page]);

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'PRESENT':
        return <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Present</Badge>;
      case 'LATE':
        return <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Late</Badge>;
      case 'WFH':
        return <Badge tone="bg-blue-50 text-blue-700 ring-blue-200">WFH</Badge>;
      case 'HALF_DAY':
        return <Badge tone="bg-purple-50 text-purple-700 ring-purple-200">Half Day</Badge>;
      case 'ON_LEAVE':
        return <Badge tone="bg-slate-100 text-slate-700 ring-slate-200">On Leave</Badge>;
      default:
        return <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">Absent / Not Marked</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Attendance Tracker"
        description="Monitor daily employee check-ins, working hours, late arrivals, WFH logs, and attendance corrections."
      />

      {/* Date & Filters */}
      <Card bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Attendance Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Status Filter</label>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late Arrival</option>
              <option value="WFH">Work From Home</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="ABSENT">Absent</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="secondary"
              onClick={() => {
                setDate(new Date().toISOString().split('T')[0]);
                setStatus('');
                setPage(1);
              }}
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Attendance Table */}
      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label="Loading attendance logs..." />
        ) : error ? (
          <div className="p-4">
            <ErrorNote message={error} />
          </div>
        ) : records.length === 0 ? (
          <EmptyState title="No attendance logs" description={`No records found for ${formatDate(date)}.`} />
        ) : (
          <>
            <Table
              head={
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Check In</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Check Out</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Worked Hours</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Mode</th>
                </tr>
              }
            >
              {records.map((rec) => {
                const inCoords = formatCoordinates(rec.checkInLatitude, rec.checkInLongitude);
                const outCoords = formatCoordinates(rec.checkOutLatitude, rec.checkOutLongitude);
                return (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={`${rec.user?.firstName || ''} ${rec.user?.lastName || ''}`} />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {rec.user?.firstName} {rec.user?.lastName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-medium text-slate-600">
                      {rec.user?.employeeCode}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-800">
                      {rec.checkInAt ? new Date(rec.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-800">
                      {rec.checkOutAt ? new Date(rec.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-brand-700">
                      {(() => {
                        const workedMins = Number(rec.workedMinutes) || 0;
                        if (workedMins > 0) return `${(workedMins / 60).toFixed(1)} hrs`;
                        if (rec.checkInAt && rec.checkOutAt) {
                          const inMs = new Date(rec.checkInAt).getTime();
                          const outMs = new Date(rec.checkOutAt).getTime();
                          if (!Number.isNaN(inMs) && !Number.isNaN(outMs)) {
                            const ms = Math.max(0, outMs - inMs);
                            const totalSec = Math.floor(ms / 1000);
                            const hrs = ms / 3600000;
                            if (totalSec < 60) return `${totalSec}s (${hrs.toFixed(2)} hrs)`;
                            return `${hrs.toFixed(2)} hrs`;
                          }
                        }
                        return '0.0 hrs';
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {inCoords || outCoords ? (
                        <div className="space-y-1">
                          {inCoords && (
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700">
                              <span className="text-[10px] uppercase font-sans text-slate-400">In:</span>
                              <span>{inCoords}</span>
                              {rec.checkInLatitude != null && rec.checkInLongitude != null && (
                                <a
                                  href={mapsUrl(rec.checkInLatitude, rec.checkInLongitude)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] font-sans font-medium text-brand-600 hover:underline"
                                >
                                  Map ↗
                                </a>
                              )}
                            </div>
                          )}
                          {outCoords && (
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
                              <span className="text-[10px] uppercase font-sans text-slate-400">Out:</span>
                              <span>{outCoords}</span>
                              {rec.checkOutLatitude != null && rec.checkOutLongitude != null && (
                                <a
                                  href={mapsUrl(rec.checkOutLatitude, rec.checkOutLongitude)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] font-sans font-medium text-brand-600 hover:underline"
                                >
                                  Map ↗
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">GPS Unavailable</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{getStatusBadge(rec.status)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{rec.workMode}</td>
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
    </div>
  );
}
