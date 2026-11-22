import { useState } from 'react';
import { PageHeader } from '../../components/Layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  InfoNote,
  Pagination,
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
    scope === 'all' ? 'everyone' : scope === 'reports' ? 'your reporting line' : `your ${scope}`;

  const liveSessions = live.data?.data ?? [];
  const idleCount = liveSessions.filter((s) => s.isIdle).length;
  const activeWorkingCount = liveSessions.length - idleCount;

  const locationRecords = locations.data?.data ?? [];
  const gpsCapturedCount = locationRecords.filter(
    (r) => r.checkInLatitude != null || r.checkOutLatitude != null,
  ).length;
  const offsiteCount = locationRecords.filter((r) => r.checkInWithinGeofence === false).length;

  return (
    <>
      <PageHeader
        title="Employee Activity & Location Monitoring"
        description={`Real-time workforce activity, active/idle status, device telemetry, and geotagged attendance records for ${scopeLabel}.`}
        actions={
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
            {(
              [
                { key: 'live', label: 'Live Activity' },
                { key: 'locations', label: 'Location Records' },
                { key: 'history', label: 'Session History' },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-md px-3.5 py-1.5 text-xs sm:text-sm font-medium transition ${
                  tab === key
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNote message={error} />
        </div>
      )}

      {/* TAB 1: LIVE ACTIVITY & SESSIONS */}
      {tab === 'live' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Signed in now"
              value={live.data?.total ?? 0}
              hint="total active sessions"
            />
            <StatTile
              label="Actively working"
              value={activeWorkingCount}
              hint="interacting recently"
            />
            <StatTile
              label="Idle sessions"
              value={idleCount}
              hint="no recent system activity"
            />
            <StatTile
              label="On mobile"
              value={liveSessions.filter((s) => s.device === 'Mobile').length}
              hint="smartphones & tablets"
            />
          </div>

          <Card className="mt-4" title="Active Employee Sessions" bodyClassName="p-0">
            {live.loading && !live.data ? (
              <Spinner />
            ) : !liveSessions.length ? (
              <EmptyState title="Nobody is signed in right now" />
            ) : (
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
                {liveSessions.map((session) => {
                  const coords = formatCoordinates(session.loginLatitude, session.loginLongitude);
                  return (
                    <tr key={session.id}>
                      <td className="td">
                        <span className="flex items-center gap-2">
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
                      <td className="td whitespace-nowrap">{formatDateTime(session.loginAt)}</td>
                      <td className="td whitespace-nowrap">
                        <span className="font-medium text-slate-700">{relativeTime(session.lastSeenAt)}</span>
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
                          >
                            Sign out
                          </Button>
                        )}
                        {session.isCurrent && <Badge>This device</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </>
      )}

      {/* TAB 2: EMPLOYEE LOCATION RECORDS & MAP VIEW */}
      {tab === 'locations' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Total Punch Records"
              value={locations.data?.meta.total ?? locationRecords.length}
              hint="attendance check-in/out records"
            />
            <StatTile
              label="GPS Captured"
              value={gpsCapturedCount}
              hint="verified with geo-coordinates"
            />
            <StatTile
              label="GPS Unavailable"
              value={locationRecords.length - gpsCapturedCount}
              hint="punches without location fix"
            />
            <StatTile
              label="Off-site Punches"
              value={offsiteCount}
              hint="outside configured geofence"
            />
          </div>

          <Card className="mt-4" title="Employee Geolocation Punch Records" bodyClassName="p-0">
            {locations.loading && !locations.data ? (
              <Spinner />
            ) : !locationRecords.length ? (
              <EmptyState title="No attendance location records found" />
            ) : (
              <>
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
                  {locationRecords.map((record) => {
                    const inCoords = formatCoordinates(record.checkInLatitude, record.checkInLongitude);
                    const outCoords = formatCoordinates(record.checkOutLatitude, record.checkOutLongitude);

                    return (
                      <tr key={record.id}>
                        <td className="td">
                          <div className="flex items-center gap-2">
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

      {/* TAB 3: SESSION HISTORY */}
      {tab === 'history' && (
        <Card title="Historical Sign-In Audit Trail" bodyClassName="p-0">
          {history.loading && !history.data ? (
            <Spinner />
          ) : !history.data?.data.length ? (
            <EmptyState title="No sessions recorded yet" />
          ) : (
            <>
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
                {history.data.data.map((session) => {
                  const coords = formatCoordinates(session.loginLatitude, session.loginLongitude);
                  return (
                    <tr key={session.id}>
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
              <Pagination
                page={history.data.meta.page}
                totalPages={history.data.meta.totalPages}
                total={history.data.meta.total}
                onChange={setPage}
              />
            </>
          )}
        </Card>
      )}

      <div className="mt-4">
        <InfoNote tone="slate">
          Employee location is captured at check-in, check-out, and sign-in only with explicit employee consent.
          Coordinates are automatically protected by role-based access policies and can be viewed directly on Google Maps.
        </InfoNote>
      </div>
    </>
  );
}
