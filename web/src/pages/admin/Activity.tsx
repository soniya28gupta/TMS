import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/Layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  InfoNote,
  Input,
  Pagination,
  ProgressBar,
  Spinner,
  StatTile,
  Table,
} from '../../components/ui';
import { api, queryString } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { formatDate, formatDateTime, formatTime, relativeTime, titleCase } from '../../lib/format';
import { formatCoordinates, mapsUrl } from '../../lib/geo';
import type { Attendance, Paginated, UserSession } from '../../lib/types';

type ActiveSession = UserSession & { isIdle: boolean };

export default function Activity() {
  const { can, scopeOf } = useAuth();
  const [tab, setTab] = useState<'live' | 'locations' | 'history'>('live');
  const [page, setPage] = useState(1);
  const [locationPage, setLocationPage] = useState(1);

  // Client-side quick filters for instant responsive responsiveness
  const [searchQuery, setSearchQuery] = useState('');
  const [liveFilter, setLiveFilter] = useState<'all' | 'active' | 'idle'>('all');
  const [locationFilter, setLocationFilter] = useState<'all' | 'onsite' | 'offsite' | 'gps'>('all');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'active' | 'ended'>('all');

  const live = useApi<{ data: ActiveSession[]; total: number }>(
    tab === 'live' ? '/sessions/active' : null,
  );
  const history = useApi<Paginated<UserSession> & { activeCount: number }>(
    tab === 'history' ? `/sessions${queryString({ page, pageSize: 25 })}` : null,
  );
  const locations = useApi<Paginated<Attendance>>(
    tab === 'locations' ? `/attendance${queryString({ page: locationPage, pageSize: 25 })}` : null,
  );

  const { busy, error, run } = useAction();

  const revoke = async (sessionId: string) => {
    await run(() => api.post(`/sessions/${sessionId}/revoke`));
    live.reload();
    history.reload();
  };

  const scope = scopeOf('session.read');
  const scopeLabel =
    scope === 'all' ? 'everyone' : scope === 'reports' ? 'your reporting line' : `your ${scope ?? 'assigned scope'}`;

  // Tab 1 data
  const rawLiveSessions = live.data?.data ?? [];
  const idleCount = rawLiveSessions.filter((s) => s.isIdle).length;
  const activeWorkingCount = rawLiveSessions.length - idleCount;
  const activePercentage = rawLiveSessions.length > 0 ? Math.round((activeWorkingCount / rawLiveSessions.length) * 100) : 0;

  const filteredLiveSessions = useMemo(() => {
    return rawLiveSessions.filter((s) => {
      const name = `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.toLowerCase();
      const code = (s.user?.employeeCode ?? '').toLowerCase();
      const device = `${s.device ?? ''} ${s.browser ?? ''} ${s.os ?? ''}`.toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        name.includes(searchQuery.toLowerCase()) ||
        code.includes(searchQuery.toLowerCase()) ||
        device.includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (liveFilter === 'active') return !s.isIdle;
      if (liveFilter === 'idle') return s.isIdle;
      return true;
    });
  }, [rawLiveSessions, searchQuery, liveFilter]);

  // Tab 2 data
  const rawLocationRecords = locations.data?.data ?? [];
  const gpsCapturedCount = rawLocationRecords.filter(
    (r) => r.checkInLatitude != null || r.checkOutLatitude != null,
  ).length;
  const offsiteCount = rawLocationRecords.filter((r) => r.checkInWithinGeofence === false).length;

  const filteredLocationRecords = useMemo(() => {
    return rawLocationRecords.filter((r) => {
      const name = `${r.user?.firstName ?? ''} ${r.user?.lastName ?? ''}`.toLowerCase();
      const code = (r.user?.employeeCode ?? '').toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        name.includes(searchQuery.toLowerCase()) ||
        code.includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (locationFilter === 'onsite') return r.checkInWithinGeofence === true;
      if (locationFilter === 'offsite') return r.checkInWithinGeofence === false;
      if (locationFilter === 'gps') return r.checkInLatitude != null || r.checkOutLatitude != null;
      return true;
    });
  }, [rawLocationRecords, searchQuery, locationFilter]);

  // Tab 3 data
  const rawHistorySessions = history.data?.data ?? [];
  const filteredHistorySessions = useMemo(() => {
    return rawHistorySessions.filter((s) => {
      const name = `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.toLowerCase();
      const code = (s.user?.employeeCode ?? '').toLowerCase();
      const device = `${s.device ?? ''} ${s.browser ?? ''} ${s.os ?? ''}`.toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        name.includes(searchQuery.toLowerCase()) ||
        code.includes(searchQuery.toLowerCase()) ||
        device.includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (historyFilter === 'active') return s.isActive;
      if (historyFilter === 'ended') return !s.isActive;
      return true;
    });
  }, [rawHistorySessions, searchQuery, historyFilter]);

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 sm:space-y-6">
      {/* RESPONSIVE HEADER & TABS */}
      <PageHeader
        title="Employee Activity & Location Monitoring"
        description={`Real-time workforce activity, active/idle status, device telemetry, and geotagged attendance records for ${scopeLabel}.`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {/* Nav tabs - horizontal scroll on small devices */}
            <div className="flex w-full overflow-x-auto rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm sm:w-auto">
              {(
                [
                  { key: 'live', label: 'Live Activity' },
                  { key: 'locations', label: 'Location Records' },
                  { key: 'history', label: 'Session History' },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    setTab(key);
                    setSearchQuery('');
                  }}
                  className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-xs font-medium transition sm:flex-initial sm:px-3.5 sm:text-sm ${
                    tab === key
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Quick reload button */}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (tab === 'live') live.reload();
                if (tab === 'locations') locations.reload();
                if (tab === 'history') history.reload();
              }}
              title="Refresh telemetry"
              className="flex items-center justify-center gap-1.5 text-xs w-full sm:w-auto"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`h-3.5 w-3.5 ${(live.loading || locations.loading || history.loading) ? 'animate-spin' : ''}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-2">
          <ErrorNote message={error} />
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1: LIVE ACTIVITY & REAL-TIME TELEMETRY                         */}
      {/* =================================================================== */}
      {tab === 'live' && (
        <>
          {/* STATS TILES GRID: 1 col on mobile, 2 on tablet, 4 on desktop */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label="Signed in now"
              value={live.data?.total ?? rawLiveSessions.length}
              hint="total active sessions"
              tone="text-brand-700"
            />
            <StatTile
              label="Actively working"
              value={activeWorkingCount}
              hint="interacting recently"
              tone="text-emerald-600"
            />
            <StatTile
              label="Idle sessions"
              value={idleCount}
              hint="no recent system activity"
              tone={idleCount > 0 ? 'text-amber-600' : 'text-slate-700'}
            />
            <StatTile
              label="On mobile"
              value={rawLiveSessions.filter((s) => s.device === 'Mobile').length}
              hint="smartphones & tablets"
            />
          </div>

          {/* WORKFORCE TELEMETRY METER */}
          {rawLiveSessions.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                    Live Telemetry Pulse
                  </span>
                  <span className="text-xs text-slate-500">
                    ({activePercentage}% actively engaged)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Active: <strong className="text-slate-800">{activeWorkingCount}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Idle: <strong className="text-slate-800">{idleCount}</strong>
                  </span>
                </div>
              </div>
              <div className="mt-2.5">
                <ProgressBar value={activePercentage} className="h-2" />
              </div>
            </div>
          )}

          {/* MAIN SESSIONS CARD */}
          <Card
            title="Active Employee Sessions"
            subtitle="Live status, physical IP, device environment, and check-in GPS location"
            bodyClassName="p-0"
          >
            {/* RESPONSIVE FILTER & SEARCH BAR */}
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="w-full sm:w-72">
                <Input
                  type="search"
                  placeholder="Search employee, device, or code…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs"
                />
              </div>

              {/* Status filter pills */}
              <div className="flex items-center gap-1 self-start overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 sm:self-auto">
                {(
                  [
                    { id: 'all', label: `All (${rawLiveSessions.length})` },
                    { id: 'active', label: `Active (${activeWorkingCount})` },
                    { id: 'idle', label: `Idle (${idleCount})` },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setLiveFilter(id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      liveFilter === id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {live.loading && !live.data ? (
              <Spinner label="Loading live activity telemetry…" />
            ) : !rawLiveSessions.length ? (
              <EmptyState
                title="Nobody is signed in right now"
                description="When employees log in, their active session and telemetry will appear here in real time."
              />
            ) : !filteredLiveSessions.length ? (
              <EmptyState
                title="No matching sessions"
                description="No active sessions match the current search or status filter."
                action={
                  <Button size="sm" variant="secondary" onClick={() => { setSearchQuery(''); setLiveFilter('all'); }}>
                    Reset Filters
                  </Button>
                }
              />
            ) : (
              <>
                {/* 1. MOBILE CARD VIEW (block on screens < 768px, hidden on md+) */}
                <div className="block divide-y divide-slate-100 md:hidden">
                  {filteredLiveSessions.map((session) => {
                    const coords = formatCoordinates(session.loginLatitude, session.loginLongitude);
                    return (
                      <div key={session.id} className="p-3.5 space-y-3 hover:bg-slate-50/50 transition">
                        {/* Header: Employee Info + Live Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              size="md"
                              name={`${session.user?.firstName ?? ''} ${session.user?.lastName ?? ''}`}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {session.user?.firstName} {session.user?.lastName}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {session.user?.employeeCode} · {session.user?.role.name}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {session.isIdle ? (
                              <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
                                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Idle
                              </Badge>
                            ) : (
                              <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">
                                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Active
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Telemetry Details Grid */}
                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 text-xs">
                          <div>
                            <span className="block text-[11px] font-medium text-slate-400">Signed in</span>
                            <span className="font-medium text-slate-700">
                              {formatDateTime(session.loginAt)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] font-medium text-slate-400">Last seen</span>
                            <span className="font-semibold text-brand-700">
                              {relativeTime(session.lastSeenAt)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] font-medium text-slate-400">Device</span>
                            <span className="text-slate-700 truncate block">
                              {session.device} · {session.browser}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] font-medium text-slate-400">IP Address</span>
                            <span className="font-mono text-slate-600 truncate block">
                              {session.ip ?? '—'}
                            </span>
                          </div>
                        </div>

                        {/* Location and Map link */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                          <div className="min-w-0">
                            {coords && session.loginLatitude != null && session.loginLongitude != null ? (
                              <div className="flex items-center gap-1.5">
                                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-emerald-600">
                                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                <span className="font-mono text-slate-700 text-[11px]">{coords}</span>
                                <a
                                  href={mapsUrl(session.loginLatitude, session.loginLongitude)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-medium text-brand-600 hover:underline inline-flex items-center gap-0.5"
                                >
                                  Map ↗
                                </a>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">GPS Unavailable</span>
                            )}
                          </div>

                          <div className="shrink-0">
                            {can('session.revoke') && !session.isCurrent && (
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={busy}
                                onClick={() => void revoke(session.id)}
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs px-2.5 py-1"
                              >
                                Sign out
                              </Button>
                            )}
                            {session.isCurrent && (
                              <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">
                                This device
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 2. DESKTOP TABLE VIEW (hidden on screens < 768px, block on md+) */}
                <div className="hidden md:block overflow-x-auto">
                  <Table
                    head={
                      <tr>
                        <th className="th">Employee</th>
                        <th className="th">Activity Status</th>
                        <th className="th">Signed in</th>
                        <th className="th">Last active</th>
                        <th className="th">Device / Client</th>
                        <th className="th">IP Address</th>
                        <th className="th">Login Location</th>
                        <th className="th text-right">Actions</th>
                      </tr>
                    }
                  >
                    {filteredLiveSessions.map((session) => {
                      const coords = formatCoordinates(session.loginLatitude, session.loginLongitude);
                      return (
                        <tr key={session.id} className="hover:bg-slate-50/50">
                          <td className="td">
                            <span className="flex items-center gap-2.5">
                              <Avatar
                                size="sm"
                                name={`${session.user?.firstName ?? ''} ${session.user?.lastName ?? ''}`}
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-slate-800">
                                  {session.user?.firstName} {session.user?.lastName}
                                </span>
                                <span className="block text-xs text-slate-500">
                                  {session.user?.employeeCode} · {session.user?.role.name}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="td">
                            {session.isIdle ? (
                              <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
                                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Idle
                              </Badge>
                            ) : (
                              <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">
                                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Active
                              </Badge>
                            )}
                          </td>
                          <td className="td whitespace-nowrap text-slate-600">{formatDateTime(session.loginAt)}</td>
                          <td className="td whitespace-nowrap">
                            <span className="font-semibold text-brand-700">{relativeTime(session.lastSeenAt)}</span>
                          </td>
                          <td className="td whitespace-nowrap text-slate-600">
                            {session.device} · {session.browser}
                            <span className="block text-xs text-slate-400">{session.os}</span>
                          </td>
                          <td className="td font-mono text-xs text-slate-500">{session.ip ?? '—'}</td>
                          <td className="td text-xs">
                            {coords && session.loginLatitude != null && session.loginLongitude != null ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-slate-700">{coords}</span>
                                <a
                                  href={mapsUrl(session.loginLatitude, session.loginLongitude)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-medium text-brand-600 hover:underline"
                                >
                                  View on Map ↗
                                </a>
                              </div>
                            ) : (
                              <span className="text-slate-400">GPS Unavailable</span>
                            )}
                          </td>
                          <td className="td text-right">
                            {can('session.revoke') && !session.isCurrent && (
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={busy}
                                onClick={() => void revoke(session.id)}
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              >
                                Sign out
                              </Button>
                            )}
                            {session.isCurrent && (
                              <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">
                                This device
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* =================================================================== */}
      {/* TAB 2: EMPLOYEE LOCATION RECORDS & PUNCHES                          */}
      {/* =================================================================== */}
      {tab === 'locations' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label="Total Punch Records"
              value={locations.data?.meta.total ?? rawLocationRecords.length}
              hint="attendance check-in/out records"
            />
            <StatTile
              label="GPS Captured"
              value={gpsCapturedCount}
              hint="verified with geo-coordinates"
              tone="text-emerald-600"
            />
            <StatTile
              label="GPS Unavailable"
              value={rawLocationRecords.length - gpsCapturedCount}
              hint="punches without location fix"
              tone="text-slate-500"
            />
            <StatTile
              label="Off-site Punches"
              value={offsiteCount}
              hint="outside configured geofence"
              tone={offsiteCount > 0 ? 'text-amber-600' : 'text-slate-600'}
            />
          </div>

          <Card
            title="Employee Geolocation Punch Records"
            subtitle="Geofence verification, office proximity distances, and mapped punch timestamps"
            bodyClassName="p-0"
          >
            {/* RESPONSIVE FILTER BAR */}
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="w-full sm:w-72">
                <Input
                  type="search"
                  placeholder="Filter by employee name or code…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs"
                />
              </div>

              <div className="flex items-center gap-1 self-start overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 sm:self-auto">
                {(
                  [
                    { id: 'all', label: `All (${rawLocationRecords.length})` },
                    { id: 'onsite', label: 'On-site' },
                    { id: 'offsite', label: 'Off-site' },
                    { id: 'gps', label: 'GPS Fixed' },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setLocationFilter(id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      locationFilter === id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {locations.loading && !locations.data ? (
              <Spinner label="Loading attendance location records…" />
            ) : !rawLocationRecords.length ? (
              <EmptyState title="No attendance location records found" />
            ) : !filteredLocationRecords.length ? (
              <EmptyState
                title="No matching location records"
                description="Try clearing your search query or selecting another filter."
                action={
                  <Button size="sm" variant="secondary" onClick={() => { setSearchQuery(''); setLocationFilter('all'); }}>
                    Reset Filters
                  </Button>
                }
              />
            ) : (
              <>
                {/* 1. MOBILE CARD VIEW FOR LOCATIONS */}
                <div className="block divide-y divide-slate-100 md:hidden">
                  {filteredLocationRecords.map((record) => {
                    const inCoords = formatCoordinates(record.checkInLatitude, record.checkInLongitude);
                    const outCoords = formatCoordinates(record.checkOutLatitude, record.checkOutLongitude);

                    return (
                      <div key={record.id} className="p-3.5 space-y-3 hover:bg-slate-50/50 transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              size="md"
                              name={`${record.user?.firstName ?? ''} ${record.user?.lastName ?? ''}`}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {record.user?.firstName} {record.user?.lastName}
                              </p>
                              <p className="text-xs text-slate-500">
                                {record.user?.employeeCode} · {formatDate(record.date)}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {record.checkInWithinGeofence === true ? (
                              <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">
                                On-site
                              </Badge>
                            ) : record.checkInWithinGeofence === false ? (
                              <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
                                Off-site
                              </Badge>
                            ) : (
                              <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">
                                {record.workMode}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Location Punches Card */}
                        <div className="space-y-2 rounded-lg bg-slate-50 p-2.5 text-xs">
                          {/* Check-In */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="block text-[11px] font-medium text-slate-400">Check-in</span>
                              <span className="text-slate-700 font-medium">
                                {record.checkInAt ? formatTime(record.checkInAt) : '—'}
                              </span>
                            </div>
                            <div className="text-right">
                              {inCoords && record.checkInLatitude != null && record.checkInLongitude != null ? (
                                <div className="space-y-0.5">
                                  <span className="font-mono font-medium text-emerald-800 text-[11px]">
                                    {inCoords}
                                  </span>
                                  <div>
                                    <a
                                      href={mapsUrl(record.checkInLatitude, record.checkInLongitude)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] font-medium text-brand-600 hover:underline"
                                    >
                                      View Map ↗
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">GPS Unavailable</span>
                              )}
                            </div>
                          </div>

                          {/* Check-Out */}
                          <div className="flex items-start justify-between gap-2 border-t border-slate-200/60 pt-2">
                            <div>
                              <span className="block text-[11px] font-medium text-slate-400">Check-out</span>
                              <span className="text-slate-700 font-medium">
                                {record.checkOutAt ? formatTime(record.checkOutAt) : 'Not punched yet'}
                              </span>
                            </div>
                            <div className="text-right">
                              {outCoords && record.checkOutLatitude != null && record.checkOutLongitude != null ? (
                                <div className="space-y-0.5">
                                  <span className="font-mono font-medium text-emerald-800 text-[11px]">
                                    {outCoords}
                                  </span>
                                  <div>
                                    <a
                                      href={mapsUrl(record.checkOutLatitude, record.checkOutLongitude)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] font-medium text-brand-600 hover:underline"
                                    >
                                      View Map ↗
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">
                                  {record.checkOutAt ? 'GPS Unavailable' : '—'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Extra stats footer */}
                        <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                          <span>
                            Mode: <strong className="text-slate-700">{record.workMode}</strong>
                            {record.checkInDistanceMeters != null && record.checkInWithinGeofence === false && (
                              <span className="ml-1 text-slate-400">
                                ({Math.round(record.checkInDistanceMeters / 1000)} km away)
                              </span>
                            )}
                          </span>
                          <span className="font-bold text-brand-700">
                            {((Number(record.workedMinutes) || 0) / 60).toFixed(1)} hrs worked
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 2. DESKTOP TABLE VIEW FOR LOCATIONS */}
                <div className="hidden md:block overflow-x-auto">
                  <Table
                    head={
                      <tr>
                        <th className="th">Employee</th>
                        <th className="th">Date</th>
                        <th className="th">Check-In GPS</th>
                        <th className="th">Check-Out GPS</th>
                        <th className="th">Geofence / Office Proximity</th>
                        <th className="th">Mode</th>
                        <th className="th">Worked Time</th>
                      </tr>
                    }
                  >
                    {filteredLocationRecords.map((record) => {
                      const inCoords = formatCoordinates(record.checkInLatitude, record.checkInLongitude);
                      const outCoords = formatCoordinates(record.checkOutLatitude, record.checkOutLongitude);

                      return (
                        <tr key={record.id} className="hover:bg-slate-50/50">
                          <td className="td">
                            <div className="flex items-center gap-2.5">
                              <Avatar
                                size="sm"
                                name={`${record.user?.firstName ?? ''} ${record.user?.lastName ?? ''}`}
                              />
                              <div>
                                <span className="block font-medium text-slate-800">
                                  {record.user?.firstName} {record.user?.lastName}
                                </span>
                                <span className="block text-xs text-slate-500">
                                  {record.user?.employeeCode}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="td whitespace-nowrap font-medium text-slate-700">
                            {formatDate(record.date)}
                          </td>
                          <td className="td text-xs">
                            {inCoords && record.checkInLatitude != null && record.checkInLongitude != null ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 font-mono font-medium text-emerald-800">
                                  <span>{inCoords}</span>
                                  {record.checkInAccuracy ? (
                                    <span className="text-[10px] text-slate-400 font-sans">
                                      ±{Math.round(record.checkInAccuracy)}m
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-500">
                                    {record.checkInAt ? formatTime(record.checkInAt) : ''}
                                  </span>
                                  <a
                                    href={mapsUrl(record.checkInLatitude, record.checkInLongitude)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] font-medium text-brand-600 hover:underline"
                                  >
                                    View on Map ↗
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400">GPS Unavailable</span>
                            )}
                          </td>
                          <td className="td text-xs">
                            {outCoords && record.checkOutLatitude != null && record.checkOutLongitude != null ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 font-mono font-medium text-emerald-800">
                                  <span>{outCoords}</span>
                                  {record.checkOutAccuracy ? (
                                    <span className="text-[10px] text-slate-400 font-sans">
                                      ±{Math.round(record.checkOutAccuracy)}m
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-500">
                                    {record.checkOutAt ? formatTime(record.checkOutAt) : ''}
                                  </span>
                                  <a
                                    href={mapsUrl(record.checkOutLatitude, record.checkOutLongitude)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] font-medium text-brand-600 hover:underline"
                                  >
                                    View on Map ↗
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400">
                                {record.checkOutAt ? 'GPS Unavailable' : '—'}
                              </span>
                            )}
                          </td>
                          <td className="td text-xs">
                            {record.checkInWithinGeofence === true ? (
                              <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">
                                On-site
                              </Badge>
                            ) : record.checkInWithinGeofence === false ? (
                              <div className="flex items-center gap-1">
                                <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
                                  Off-site
                                </Badge>
                                {record.checkInDistanceMeters != null && (
                                  <span className="text-[11px] text-slate-500">
                                    ({Math.round(record.checkInDistanceMeters / 1000)} km away)
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="td text-xs font-medium text-slate-700">{record.workMode}</td>
                          <td className="td text-xs font-bold text-brand-700">
                            {((Number(record.workedMinutes) || 0) / 60).toFixed(1)} hrs
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                </div>

                {locations.data && (
                  <Pagination
                    page={locations.data.meta.page}
                    totalPages={locations.data.meta.totalPages}
                    total={locations.data.meta.total}
                    onChange={setLocationPage}
                  />
                )}
              </>
            )}
          </Card>
        </>
      )}

      {/* =================================================================== */}
      {/* TAB 3: SESSION HISTORY                                              */}
      {/* =================================================================== */}
      {tab === 'history' && (
        <Card
          title="Historical Sign-In Audit Trail"
          subtitle="Timestamped login and logout events, ended reasons, client fingerprints, and location"
          bodyClassName="p-0"
        >
          {/* RESPONSIVE FILTER BAR */}
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="w-full sm:w-72">
              <Input
                type="search"
                placeholder="Search history by employee or device…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs"
              />
            </div>

            <div className="flex items-center gap-1 self-start overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 sm:self-auto">
              {(
                [
                  { id: 'all', label: `All (${rawHistorySessions.length})` },
                  { id: 'active', label: 'Active Now' },
                  { id: 'ended', label: 'Ended' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setHistoryFilter(id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    historyFilter === id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {history.loading && !history.data ? (
            <Spinner label="Loading session audit history…" />
          ) : !rawHistorySessions.length ? (
            <EmptyState title="No sessions recorded yet" />
          ) : !filteredHistorySessions.length ? (
            <EmptyState
              title="No matching history entries"
              description="Adjust your search or status filter to see other historical sessions."
              action={
                <Button size="sm" variant="secondary" onClick={() => { setSearchQuery(''); setHistoryFilter('all'); }}>
                  Reset Filters
                </Button>
              }
            />
          ) : (
            <>
              {/* 1. MOBILE CARD VIEW FOR HISTORY */}
              <div className="block divide-y divide-slate-100 md:hidden">
                {filteredHistorySessions.map((session) => {
                  const coords = formatCoordinates(session.loginLatitude, session.loginLongitude);
                  return (
                    <div key={session.id} className="p-3.5 space-y-3 hover:bg-slate-50/50 transition">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {session.user?.firstName} {session.user?.lastName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {session.user?.employeeCode}
                          </p>
                        </div>

                        <Badge
                          tone={
                            session.isActive
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                              : 'bg-slate-100 text-slate-600 ring-slate-200'
                          }
                        >
                          {session.isActive ? 'Active' : 'Ended'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 text-xs">
                        <div>
                          <span className="block text-[11px] font-medium text-slate-400">Signed in</span>
                          <span className="font-medium text-slate-700">
                            {formatDateTime(session.loginAt)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] font-medium text-slate-400">Signed out</span>
                          <span className="text-slate-700">
                            {session.logoutAt ? formatDateTime(session.logoutAt) : '—'}
                          </span>
                          {session.endedReason && (
                            <span className="block text-[10px] text-slate-400">
                              {titleCase(session.endedReason)}
                            </span>
                          )}
                        </div>
                        <div className="col-span-2">
                          <span className="block text-[11px] font-medium text-slate-400">Device</span>
                          <span className="text-slate-700 truncate block">
                            {session.device} · {session.browser} · {session.os}
                          </span>
                        </div>
                      </div>

                      {/* Location link if available */}
                      {coords && session.loginLatitude != null && session.loginLongitude != null && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="font-mono text-[11px] text-slate-700">{coords}</span>
                          <a
                            href={mapsUrl(session.loginLatitude, session.loginLongitude)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-brand-600 hover:underline"
                          >
                            Map ↗
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 2. DESKTOP TABLE VIEW FOR HISTORY */}
              <div className="hidden md:block overflow-x-auto">
                <Table
                  head={
                    <tr>
                      <th className="th">Employee</th>
                      <th className="th">Signed in</th>
                      <th className="th">Signed out</th>
                      <th className="th">Device / Browser</th>
                      <th className="th">Login Location</th>
                      <th className="th">Session Status</th>
                    </tr>
                  }
                >
                  {filteredHistorySessions.map((session) => {
                    const coords = formatCoordinates(session.loginLatitude, session.loginLongitude);
                    return (
                      <tr key={session.id} className="hover:bg-slate-50/50">
                        <td className="td">
                          <span className="font-medium text-slate-800">
                            {session.user?.firstName} {session.user?.lastName}
                          </span>
                          <span className="block text-xs text-slate-500">{session.user?.employeeCode}</span>
                        </td>
                        <td className="td whitespace-nowrap">{formatDateTime(session.loginAt)}</td>
                        <td className="td whitespace-nowrap">
                          {session.logoutAt ? formatDateTime(session.logoutAt) : '—'}
                          {session.endedReason && (
                            <span className="block text-xs text-slate-400">
                              {titleCase(session.endedReason)}
                            </span>
                          )}
                        </td>
                        <td className="td whitespace-nowrap text-slate-600">
                          {session.device} · {session.browser}
                          <span className="block text-xs text-slate-400">{session.os}</span>
                        </td>
                        <td className="td text-xs">
                          {coords && session.loginLatitude != null && session.loginLongitude != null ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-slate-700">{coords}</span>
                              <a
                                href={mapsUrl(session.loginLatitude, session.loginLongitude)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-brand-600 hover:underline"
                              >
                                View on Map ↗
                              </a>
                            </div>
                          ) : (
                            <span className="text-slate-400">GPS Unavailable</span>
                          )}
                        </td>
                        <td className="td">
                          <Badge
                            tone={
                              session.isActive
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                : 'bg-slate-100 text-slate-600 ring-slate-200'
                            }
                          >
                            {session.isActive ? 'Active' : 'Ended'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              </div>

              {history.data && (
                <Pagination
                  page={history.data.meta.page}
                  totalPages={history.data.meta.totalPages}
                  total={history.data.meta.total}
                  onChange={setPage}
                />
              )}
            </>
          )}
        </Card>
      )}

      {/* PRIVACY & COMPLIANCE NOTE */}
      <div className="mt-2">
        <InfoNote tone="slate">
          Employee geolocation is captured at check-in, check-out, and sign-in only with explicit employee consent.
          Coordinates are automatically protected by role-based access policies and can be viewed directly on Google Maps.
        </InfoNote>
      </div>
    </div>
  );
}
