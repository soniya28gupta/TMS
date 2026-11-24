import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Login from './pages/Login';

const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const EmployeeDashboard = lazy(() => import('./pages/employee/Dashboard'));
const MyTasks = lazy(() => import('./pages/employee/MyTasks'));
const TaskDetail = lazy(() => import('./pages/shared/TaskDetail'));
const SodPage = lazy(() => import('./pages/employee/Sod'));
const EodPage = lazy(() => import('./pages/employee/Eod'));
const AttendancePage = lazy(() => import('./pages/employee/Attendance'));
const LeavePage = lazy(() => import('./pages/employee/Leave'));
const ProfilePage = lazy(() => import('./pages/employee/Profile'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const Employees = lazy(() => import('./pages/admin/Employees'));
const EmployeeDetail = lazy(() => import('./pages/admin/EmployeeDetail'));
const AdminTasks = lazy(() => import('./pages/admin/Tasks'));
const ReviewQueue = lazy(() => import('./pages/admin/ReviewQueue'));
const SodEodMonitor = lazy(() => import('./pages/admin/SodEodMonitor'));
const AdminAttendance = lazy(() => import('./pages/admin/Attendance'));
const AdminLeave = lazy(() => import('./pages/admin/Leave'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const OrgChart = lazy(() => import('./pages/admin/OrgChart'));
const Activity = lazy(() => import('./pages/admin/Activity'));
const AssignSod = lazy(() => import('./pages/admin/AssignSod'));
const Projects = lazy(() => import('./pages/shared/Projects'));
const ProjectDetail = lazy(() => import('./pages/shared/ProjectDetail'));
const AccessGrants = lazy(() => import('./pages/admin/AccessGrants'));
const OrgHierarchy = lazy(() => import('./pages/admin/OrgHierarchy'));

function RequirePermission({
  permissions,
  children,
}: {
  permissions: string[];
  children: JSX.Element;
}) {
  const { canAny } = useAuth();
  if (!canAny(...permissions)) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm font-semibold text-slate-800">You do not have access to this page</p>
        <p className="mt-1 text-sm text-slate-500">
          Ask an administrator if you need this permission added to your role.
        </p>
      </div>
    );
  }
  return children;
}

const pageFallback = (
  <div className="flex min-h-[240px] items-center justify-center">
    <Spinner label="Loading…" />
  </div>
);

function withPageSuspense(element: JSX.Element) {
  return <Suspense fallback={pageFallback}>{element}</Suspense>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner label="Starting up…" />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={pageFallback}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={user?.role?.portal === 'ADMIN' ? '/admin' : '/'} replace />} />
      <Route path="/forgot-password" element={<Navigate to="/" replace />} />
      <Route path="/reset-password" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={withPageSuspense(<EmployeeDashboard />)} />
        <Route path="tasks" element={withPageSuspense(<MyTasks />)} />
        <Route path="tasks/:id" element={withPageSuspense(<TaskDetail />)} />
        <Route path="projects" element={withPageSuspense(<Projects />)} />
        <Route path="projects/:id" element={withPageSuspense(<ProjectDetail />)} />
        <Route path="sod" element={withPageSuspense(<SodPage />)} />
        <Route path="eod" element={withPageSuspense(<EodPage />)} />
        <Route path="attendance" element={withPageSuspense(<AttendancePage />)} />
        <Route path="leave" element={withPageSuspense(<LeavePage />)} />
        <Route path="profile" element={withPageSuspense(<ProfilePage />)} />

        <Route
          path="admin"
          element={
            <RequirePermission permissions={['employee.read.team', 'employee.read.department', 'employee.read.all']}>
              {withPageSuspense(<AdminDashboard />)}
            </RequirePermission>
          }
        />
        <Route path="admin/access-grants" element={withPageSuspense(<AccessGrants />)} />
        <Route path="admin/hierarchy" element={withPageSuspense(<OrgHierarchy />)} />
        <Route
          path="admin/employees"
          element={
            <RequirePermission permissions={['employee.read.team', 'employee.read.department', 'employee.read.all']}>
              {withPageSuspense(<Employees />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/employees/:id"
          element={
            <RequirePermission permissions={['employee.read.team', 'employee.read.department', 'employee.read.all']}>
              {withPageSuspense(<EmployeeDetail />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/tasks"
          element={
            <RequirePermission permissions={['task.read.team', 'task.read.department', 'task.read.all']}>
              {withPageSuspense(<AdminTasks />)}
            </RequirePermission>
          }
        />
        <Route path="admin/tasks/:id" element={withPageSuspense(<TaskDetail />)} />
        <Route
          path="admin/review"
          element={
            <RequirePermission permissions={['task.review']}>
              {withPageSuspense(<ReviewQueue />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/org-chart"
          element={
            <RequirePermission permissions={['employee.hierarchy.read']}>
              {withPageSuspense(<OrgChart />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/activity"
          element={
            <RequirePermission permissions={['session.read.team', 'session.read.reports', 'session.read.department', 'session.read.all']}>
              {withPageSuspense(<Activity />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/assign-sod"
          element={
            <RequirePermission permissions={['sod.assign']}>
              {withPageSuspense(<AssignSod />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/sod-eod"
          element={
            <RequirePermission permissions={['sod.read.team', 'sod.read.department', 'sod.read.all']}>
              {withPageSuspense(<SodEodMonitor />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/attendance"
          element={
            <RequirePermission permissions={['attendance.read.team', 'attendance.read.department', 'attendance.read.all']}>
              {withPageSuspense(<AdminAttendance />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/leave"
          element={
            <RequirePermission permissions={['leave.approve', 'leave.read.department', 'leave.read.all']}>
              {withPageSuspense(<AdminLeave />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/reports"
          element={
            <RequirePermission permissions={['report.read.team', 'report.read.department', 'report.read.all']}>
              {withPageSuspense(<Reports />)}
            </RequirePermission>
          }
        />
        <Route
          path="admin/settings"
          element={
            <RequirePermission permissions={['settings.read', 'role.manage', 'org.manage', 'holiday.manage', 'task.recurring.manage']}>
              {withPageSuspense(<Settings />)}
            </RequirePermission>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}