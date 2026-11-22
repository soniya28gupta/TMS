import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import EmployeeDashboard from './pages/employee/Dashboard';
import MyTasks from './pages/employee/MyTasks';
import TaskDetail from './pages/shared/TaskDetail';
import SodPage from './pages/employee/Sod';
import EodPage from './pages/employee/Eod';
import AttendancePage from './pages/employee/Attendance';
import LeavePage from './pages/employee/Leave';
import ProfilePage from './pages/employee/Profile';
import AdminDashboard from './pages/admin/Dashboard';
import Employees from './pages/admin/Employees';
import EmployeeDetail from './pages/admin/EmployeeDetail';
import AdminTasks from './pages/admin/Tasks';
import ReviewQueue from './pages/admin/ReviewQueue';
import SodEodMonitor from './pages/admin/SodEodMonitor';
import AdminAttendance from './pages/admin/Attendance';
import AdminLeave from './pages/admin/Leave';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';
import OrgChart from './pages/admin/OrgChart';
import Activity from './pages/admin/Activity';
import AssignSod from './pages/admin/AssignSod';
import Projects from './pages/shared/Projects';
import ProjectDetail from './pages/shared/ProjectDetail';
import AccessGrants from './pages/admin/AccessGrants';
import OrgHierarchy from './pages/admin/OrgHierarchy';

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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={user?.role?.portal === 'ADMIN' ? '/admin' : '/'} replace />} />
      <Route path="/forgot-password" element={<Navigate to="/" replace />} />
      <Route path="/reset-password" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        {/* Employee portal — available to every signed-in user */}
        <Route index element={<EmployeeDashboard />} />
        <Route path="tasks" element={<MyTasks />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="sod" element={<SodPage />} />
        <Route path="eod" element={<EodPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="profile" element={<ProfilePage />} />

        {/* Admin portal — every route is permission-gated */}
        <Route
          path="admin"
          element={
            <RequirePermission permissions={['employee.read.team', 'employee.read.department', 'employee.read.all']}>
              <AdminDashboard />
            </RequirePermission>
          }
        />
        <Route path="admin/access-grants" element={<AccessGrants />} />
        <Route path="admin/hierarchy" element={<OrgHierarchy />} />
        <Route
          path="admin/employees"
          element={
            <RequirePermission permissions={['employee.read.team', 'employee.read.department', 'employee.read.all']}>
              <Employees />
            </RequirePermission>
          }
        />
        <Route
          path="admin/employees/:id"
          element={
            <RequirePermission permissions={['employee.read.team', 'employee.read.department', 'employee.read.all']}>
              <EmployeeDetail />
            </RequirePermission>
          }
        />
        <Route
          path="admin/tasks"
          element={
            <RequirePermission permissions={['task.read.team', 'task.read.department', 'task.read.all']}>
              <AdminTasks />
            </RequirePermission>
          }
        />
        <Route path="admin/tasks/:id" element={<TaskDetail />} />
        <Route
          path="admin/review"
          element={
            <RequirePermission permissions={['task.review']}>
              <ReviewQueue />
            </RequirePermission>
          }
        />
        <Route
          path="admin/org-chart"
          element={
            <RequirePermission permissions={['employee.hierarchy.read']}>
              <OrgChart />
            </RequirePermission>
          }
        />
        <Route
          path="admin/activity"
          element={
            <RequirePermission permissions={['session.read.team', 'session.read.reports', 'session.read.department', 'session.read.all']}>
              <Activity />
            </RequirePermission>
          }
        />
        <Route
          path="admin/assign-sod"
          element={
            <RequirePermission permissions={['sod.assign']}>
              <AssignSod />
            </RequirePermission>
          }
        />
        <Route
          path="admin/sod-eod"
          element={
            <RequirePermission permissions={['sod.read.team', 'sod.read.department', 'sod.read.all']}>
              <SodEodMonitor />
            </RequirePermission>
          }
        />
        <Route
          path="admin/attendance"
          element={
            <RequirePermission permissions={['attendance.read.team', 'attendance.read.department', 'attendance.read.all']}>
              <AdminAttendance />
            </RequirePermission>
          }
        />
        <Route
          path="admin/leave"
          element={
            <RequirePermission permissions={['leave.approve', 'leave.read.department', 'leave.read.all']}>
              <AdminLeave />
            </RequirePermission>
          }
        />
        <Route
          path="admin/reports"
          element={
            <RequirePermission permissions={['report.read.team', 'report.read.department', 'report.read.all']}>
              <Reports />
            </RequirePermission>
          }
        />
        <Route
          path="admin/settings"
          element={
            <RequirePermission permissions={['settings.read', 'role.manage', 'org.manage', 'holiday.manage', 'task.recurring.manage']}>
              <Settings />
            </RequirePermission>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
