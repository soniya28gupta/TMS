import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, tokens } from '../lib/api';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/format';
import type { Notification } from '../lib/types';
import { Icon, type IconName } from './icons';
import { Avatar, Badge, Button, cx, EmptyState, ErrorNote, Field, InfoNote, Input, Modal } from './ui';

type NavItem = { to: string; label: string; icon: IconName; show: boolean; end?: boolean };

export function Layout() {
  const { user, logout, can, canAny, isAdminPortal, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const inFlightNotifRef = useRef<Promise<void> | null>(null);

  // Change Password Modal State
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwords.currentPassword) {
      setPasswordError('Please enter your current password');
      return;
    }
    if (passwords.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long');
      return;
    }
    if (passwords.newPassword !== passwords.confirm) {
      setPasswordError('New password and confirmation do not match');
      return;
    }
    try {
      setPasswordSubmitting(true);
      setPasswordError(null);
      await api.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswordSuccess(true);
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      await refreshUser();
      setTimeout(() => {
        setPasswordSuccess(false);
        setPasswordModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const loadNotifications = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) return;
    if (inFlightNotifRef.current) {
      return inFlightNotifRef.current;
    }

    const requestPromise = (async () => {
      try {
        const res = await api.get<{ data: Notification[]; unread: number }>('/notifications?pageSize=12');
        setNotifications(res.data);
        setUnread(res.unread);
      } catch {
        /* the bell is not worth an error banner */
      } finally {
        inFlightNotifRef.current = null;
      }
    })();

    inFlightNotifRef.current = requestPromise;
    return requestPromise;
  }, []);

  useEffect(() => {
    if (!user?.id || (!tokens.access && !tokens.refresh)) return;
    void loadNotifications();
    const timer = setInterval(() => {
      void loadNotifications();
    }, 60_000);
    return () => clearInterval(timer);
  }, [user?.id, loadNotifications]);

  useEffect(() => {
    setSidebarOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  const myWork: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: 'dashboard', show: true, end: true },
    { to: '/tasks', label: 'My tasks', icon: 'tasks', show: true },
    { to: '/projects', label: 'Projects', icon: 'clipboard', show: true },
    { to: '/sod', label: 'SOD', icon: 'sunrise', show: can('sod.submit') },
    { to: '/eod', label: 'EOD', icon: 'sunset', show: can('eod.submit') },
    { to: '/attendance', label: 'Attendance', icon: 'clock', show: can('attendance.mark') },
    { to: '/leave', label: 'Leave', icon: 'calendar', show: can('leave.apply') },
    { to: '/profile', label: 'Profile', icon: 'user', show: true },
  ];

  const manage: NavItem[] = [
    { to: '/admin', label: 'Overview', icon: 'dashboard', show: isAdminPortal, end: true },
    {
      to: '/admin/employees',
      label: 'Employees',
      icon: 'users',
      show: canAny('employee.read.team', 'employee.read.reports', 'employee.read.department', 'employee.read.all'),
    },
    {
      to: '/admin/hierarchy',
      label: 'Org Hierarchy',
      icon: 'users',
      show: isAdminPortal,
    },
    {
      to: '/admin/access-grants',
      label: 'Access Grants',
      icon: 'settings',
      show: isAdminPortal,
    },
    {
      to: '/admin/tasks',
      label: 'All tasks',
      icon: 'clipboard',
      show: canAny('task.read.team', 'task.read.department', 'task.read.all'),
    },
    { to: '/admin/review', label: 'Review queue', icon: 'check', show: can('task.review') },
    {
      to: '/admin/assign-sod',
      label: 'Assign duties',
      icon: 'sunrise',
      show: can('sod.assign'),
    },
    {
      to: '/admin/sod-eod',
      label: 'SOD / EOD',
      icon: 'history',
      show: canAny('sod.read.team', 'sod.read.reports', 'sod.read.department', 'sod.read.all'),
    },
    {
      to: '/admin/activity',
      label: 'Activity monitoring',
      icon: 'shield',
      show: canAny('session.read.team', 'session.read.reports', 'session.read.department', 'session.read.all'),
    },
    {
      to: '/admin/attendance',
      label: 'Attendance',
      icon: 'clock',
      show: canAny('attendance.read.team', 'attendance.read.department', 'attendance.read.all'),
    },
    {
      to: '/admin/leave',
      label: 'Leave',
      icon: 'calendar',
      show: canAny('leave.approve', 'leave.read.all', 'leave.read.department'),
    },
    {
      to: '/admin/reports',
      label: 'Reports',
      icon: 'chart',
      show: canAny('report.read.team', 'report.read.department', 'report.read.all'),
    },
    {
      to: '/admin/settings',
      label: 'Settings',
      icon: 'settings',
      show: canAny('settings.read', 'role.manage', 'org.manage', 'holiday.manage', 'task.recurring.manage'),
    },
  ];

  const showManage = useMemo(() => manage.some((item) => item.show), [manage]);

  const markRead = async (notification: Notification) => {
    if (!notification.isRead) {
      await api.post(`/notifications/${notification.id}/read`);
      setUnread((count) => Math.max(0, count - 1));
      setNotifications((list) =>
        list.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
      );
    }
    if (notification.link) navigate(notification.link);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-full bg-slate-50/50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white transition-all duration-200 lg:static lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-64',
          sidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white shadow-sm">
              T
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-900">TaskFlow</p>
                <p className="text-[11px] text-slate-500">Task Management</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:block"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon.menu />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <NavGroup title="My work" items={myWork} collapsed={collapsed} />
          {showManage && <NavGroup title="Manage" items={manage} collapsed={collapsed} />}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <Avatar name={user.fullName} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{user.fullName}</p>
                <p className="truncate text-xs text-slate-500">{user.role.name}</p>
              </div>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPasswordModalOpen(true)}
                title="Change password"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </button>
              <button
                onClick={() => void logout()}
                title="Sign out"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
              >
                <Icon.logout />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((open) => !open)}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Toggle navigation"
            >
              <Icon.menu />
            </button>
          </div>

          <div className="hidden text-sm text-slate-500 sm:block">
            {new Intl.DateTimeFormat('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(new Date())}
          </div>

          <div className="relative ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPasswordModalOpen(true)}
              className="hidden sm:inline-flex text-xs"
            >
              Change Password
            </Button>

            <button
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative rounded-md p-2 text-slate-500 transition hover:bg-slate-100"
              aria-label="Notifications"
            >
              <Icon.bell />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-12 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:w-96">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">Notifications</p>
                  {unread > 0 && (
                    <button
                      className="text-xs font-medium text-brand-600 hover:underline"
                      onClick={async () => {
                        await api.post('/notifications/read-all');
                        setUnread(0);
                        setNotifications((list) => list.map((n) => ({ ...n, isRead: true })));
                      }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <EmptyState title="Nothing yet" description="Alerts about tasks, SOD/EOD and leave land here." />
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => void markRead(notification)}
                        className={cx(
                          'flex w-full gap-2.5 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50',
                          !notification.isRead && 'bg-brand-50/40',
                        )}
                      >
                        <span
                          className={cx(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            notification.severity === 'CRITICAL'
                              ? 'bg-rose-500'
                              : notification.severity === 'WARNING'
                                ? 'bg-amber-500'
                                : 'bg-brand-500',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {notification.title}
                          </span>
                          {notification.body && (
                            <span className="mt-0.5 block line-clamp-2 text-xs text-slate-500">
                              {notification.body}
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {relativeTime(notification.createdAt)}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <Badge tone="bg-slate-100 text-slate-600 ring-slate-200" className="hidden sm:inline-flex">
              {user.employeeCode}
            </Badge>
          </div>
        </header>

        {user.mustChangePassword && location.pathname !== '/profile' && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 lg:px-6">
            You are still using a temporary password.{' '}
            <button onClick={() => setPasswordModalOpen(true)} className="font-semibold underline">
              Change it now
            </button>
            .
          </div>
        )}

        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
          <Outlet />
        </main>

        {/* Change Password Modal for all logged in employees */}
        <Modal
          open={passwordModalOpen}
          onClose={() => setPasswordModalOpen(false)}
          title="Change Your Login Password"
          description="Update your password to keep your account secure."
          footer={
            <>
              <Button variant="ghost" onClick={() => setPasswordModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={passwordSubmitting} onClick={handlePasswordSubmit}>
                Update Password
              </Button>
            </>
          }
        >
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {passwordError && <ErrorNote message={passwordError} />}
            {passwordSuccess && (
              <InfoNote tone="brand">
                Password updated successfully! Other sessions have been signed out.
              </InfoNote>
            )}

            <Field label="Current Password" required>
              <Input
                type="password"
                required
                placeholder="Enter current password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              />
            </Field>

            <Field label="New Password" required hint="Must be at least 8 characters with letters & numbers.">
              <Input
                type="password"
                required
                placeholder="Enter new password (min 8 chars)"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              />
            </Field>

            <Field label="Confirm New Password" required>
              <Input
                type="password"
                required
                placeholder="Re-enter new password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
              />
            </Field>
          </form>
        </Modal>
      </div>
    </div>
  );
}

function NavGroup({ title, items, collapsed }: { title: string; items: NavItem[]; collapsed?: boolean }) {
  const visible = items.filter((item) => item.show);
  if (!visible.length) return null;

  return (
    <div>
      {!collapsed && (
        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </p>
      )}
      <ul className="space-y-0.5">
        {visible.map((item) => {
          const IconComponent = Icon[item.icon];
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                    collapsed && 'justify-center px-2',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )
                }
              >
                <IconComponent />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export { Button };