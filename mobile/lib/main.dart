import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/theme.dart';
import 'features/admin/access_grants_screen.dart';
import 'features/admin/activity_monitoring_screen.dart';
import 'features/admin/admin_attendance_screen.dart';
import 'features/admin/admin_dashboard_screen.dart';
import 'features/admin/admin_leave_screen.dart';
import 'features/admin/admin_tasks_screen.dart';
import 'features/admin/assign_sod_screen.dart';
import 'features/admin/employees_screen.dart';
import 'features/admin/org_hierarchy_screen.dart';
import 'features/admin/reports_screen.dart';
import 'features/admin/review_queue_screen.dart';
import 'features/admin/settings_screen.dart';
import 'features/admin/sod_eod_monitor_screen.dart';
import 'features/auth/forgot_password_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/employee/attendance_screen.dart';
import 'features/employee/dashboard_screen.dart';
import 'features/employee/eod_screen.dart';
import 'features/employee/leave_screen.dart';
import 'features/employee/profile_screen.dart';
import 'features/employee/project_detail_screen.dart';
import 'features/employee/projects_screen.dart';
import 'features/employee/sod_screen.dart';
import 'features/employee/task_detail_screen.dart';
import 'features/employee/tasks_screen.dart';
import 'providers/auth_provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: TaskFlowApp()));
}

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      if (auth.isLoading) return null;

      final isLoggingIn = state.matchedLocation == '/login' ||
          state.matchedLocation == '/forgot-password';

      if (!auth.isAuthenticated) {
        return isLoggingIn ? null : '/login';
      }

      if (isLoggingIn) {
        return '/';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/',
        builder: (context, state) => const DashboardScreen(),
      ),
      GoRoute(
        path: '/tasks',
        builder: (context, state) => const TasksScreen(),
      ),
      GoRoute(
        path: '/tasks/:id',
        builder: (context, state) =>
            TaskDetailScreen(taskId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/projects',
        builder: (context, state) => const ProjectsScreen(),
      ),
      GoRoute(
        path: '/projects/:id',
        builder: (context, state) =>
            ProjectDetailScreen(projectId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/sod',
        builder: (context, state) => const SodScreen(),
      ),
      GoRoute(
        path: '/eod',
        builder: (context, state) => const EodScreen(),
      ),
      GoRoute(
        path: '/attendance',
        builder: (context, state) => const AttendanceScreen(),
      ),
      GoRoute(
        path: '/leave',
        builder: (context, state) => const LeaveScreen(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),
      // Admin Routes
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AdminDashboardScreen(),
      ),
      GoRoute(
        path: '/admin/employees',
        builder: (context, state) => const EmployeesScreen(),
      ),
      GoRoute(
        path: '/admin/hierarchy',
        builder: (context, state) => const OrgHierarchyScreen(),
      ),
      GoRoute(
        path: '/admin/access-grants',
        builder: (context, state) => const AccessGrantsScreen(),
      ),
      GoRoute(
        path: '/admin/tasks',
        builder: (context, state) => const AdminTasksScreen(),
      ),
      GoRoute(
        path: '/admin/review',
        builder: (context, state) => const ReviewQueueScreen(),
      ),
      GoRoute(
        path: '/admin/assign-sod',
        builder: (context, state) => const AssignSodScreen(),
      ),
      GoRoute(
        path: '/admin/sod-eod',
        builder: (context, state) => const SodEodMonitorScreen(),
      ),
      GoRoute(
        path: '/admin/activity',
        builder: (context, state) => const ActivityMonitoringScreen(),
      ),
      GoRoute(
        path: '/admin/attendance',
        builder: (context, state) => const AdminAttendanceScreen(),
      ),
      GoRoute(
        path: '/admin/leave',
        builder: (context, state) => const AdminLeaveScreen(),
      ),
      GoRoute(
        path: '/admin/reports',
        builder: (context, state) => const ReportsScreen(),
      ),
      GoRoute(
        path: '/admin/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
    ],
  );
});

class TaskFlowApp extends ConsumerWidget {
  const TaskFlowApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'TaskFlow',
      theme: AppTheme.lightTheme,
      debugShowCheckedModeBanner: false,
      routerConfig: router,
    );
  }
}
