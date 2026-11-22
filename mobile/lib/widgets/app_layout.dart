import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/data_providers.dart';
import 'notification_sheet.dart';
import 'ui_components.dart';

class AppLayout extends ConsumerWidget {
  final Widget child;
  final String title;

  const AppLayout({
    super.key,
    required this.child,
    required this.title,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final user = auth.user;
    final notifications = ref.watch(notificationsProvider);
    final unreadCount = notifications.where((n) => !n.isRead).length;

    return Scaffold(
      backgroundColor: AppColors.scaffoldBg,
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppColors.brand600,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.check_circle_outline, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'TaskFlow',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                    color: AppColors.slate900,
                  ),
                ),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: AppColors.slate500,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          // Portal Switcher (If user has Admin role)
          if (auth.isAdminRole)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: InkWell(
                onTap: () {
                  final toAdmin = !auth.isPortalAdmin;
                  ref.read(authProvider.notifier).togglePortal(toAdmin);
                  if (toAdmin) {
                    context.go('/admin');
                  } else {
                    context.go('/');
                  }
                },
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: auth.isPortalAdmin ? AppColors.indigoBg : AppColors.brand50,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: auth.isPortalAdmin ? AppColors.indigoBorder : AppColors.brand200,
                      width: 1,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        auth.isPortalAdmin ? Icons.shield_outlined : Icons.person_outline,
                        size: 13,
                        color: auth.isPortalAdmin ? AppColors.indigoText : AppColors.brand700,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        auth.isPortalAdmin ? 'Admin' : 'Employee',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: auth.isPortalAdmin ? AppColors.indigoText : AppColors.brand700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // Notifications bell with badge
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_none_outlined, size: 22, color: AppColors.slate700),
                onPressed: () {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => const NotificationSheet(),
                  );
                },
              ),
              if (unreadCount > 0)
                Positioned(
                  top: 10,
                  right: 10,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(
                      color: Color(0xFFEF4444),
                      shape: BoxShape.circle,
                    ),
                    constraints: const BoxConstraints(minWidth: 14, minHeight: 14),
                    child: Text(
                      unreadCount > 9 ? '9+' : '$unreadCount',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
            ],
          ),

          // User avatar
          Padding(
            padding: const EdgeInsets.only(right: 12, left: 4),
            child: GestureDetector(
              onTap: () => context.push('/profile'),
              child: AppAvatar(
                name: user?.fullName ?? 'User',
                url: user?.avatarUrl,
                size: 32,
              ),
            ),
          ),
        ],
      ),
      drawer: _buildDrawer(context, ref, auth),
      body: SafeArea(child: child),
    );
  }

  Widget _buildDrawer(BuildContext context, WidgetRef ref, AuthState auth) {
    final user = auth.user;
    final currentRoute = GoRouterState.of(context).matchedLocation;

    return Drawer(
      backgroundColor: Colors.white,
      child: Column(
        children: [
          // Drawer Header
          Container(
            padding: const EdgeInsets.fromLTRB(16, 44, 16, 16),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(bottom: BorderSide(color: AppColors.slate200, width: 1)),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.brand600,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.check_circle_outline, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'TaskFlow',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppColors.slate900,
                          letterSpacing: -0.5,
                        ),
                      ),
                      Text(
                        'Task Management System',
                        style: TextStyle(fontSize: 11, color: AppColors.slate500),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20, color: AppColors.slate500),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),

          // Navigation Links
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
              children: [
                // Section: MY WORK
                _buildSectionHeader('MY WORK'),
                _buildNavItem(
                  context: context,
                  label: 'Dashboard',
                  icon: Icons.dashboard_outlined,
                  route: '/',
                  isActive: currentRoute == '/',
                ),
                _buildNavItem(
                  context: context,
                  label: 'My Tasks',
                  icon: Icons.task_alt_outlined,
                  route: '/tasks',
                  isActive: currentRoute.startsWith('/tasks') && !currentRoute.startsWith('/admin/tasks'),
                ),
                _buildNavItem(
                  context: context,
                  label: 'Projects',
                  icon: Icons.folder_outlined,
                  route: '/projects',
                  isActive: currentRoute.startsWith('/projects'),
                ),
                if (auth.can('sod.submit'))
                  _buildNavItem(
                    context: context,
                    label: 'SOD (Morning)',
                    icon: Icons.wb_sunny_outlined,
                    route: '/sod',
                    isActive: currentRoute == '/sod',
                  ),
                if (auth.can('eod.submit'))
                  _buildNavItem(
                    context: context,
                    label: 'EOD (Evening)',
                    icon: Icons.nights_stay_outlined,
                    route: '/eod',
                    isActive: currentRoute == '/eod',
                  ),
                if (auth.can('attendance.mark'))
                  _buildNavItem(
                    context: context,
                    label: 'Attendance',
                    icon: Icons.access_time_outlined,
                    route: '/attendance',
                    isActive: currentRoute == '/attendance',
                  ),
                if (auth.can('leave.apply'))
                  _buildNavItem(
                    context: context,
                    label: 'Leave',
                    icon: Icons.calendar_today_outlined,
                    route: '/leave',
                    isActive: currentRoute == '/leave',
                  ),
                _buildNavItem(
                  context: context,
                  label: 'Profile',
                  icon: Icons.person_outline,
                  route: '/profile',
                  isActive: currentRoute == '/profile',
                ),

                // Section: MANAGE (Admin)
                if (auth.isAdminRole) ...[
                  const SizedBox(height: 16),
                  _buildSectionHeader('MANAGE'),
                  _buildNavItem(
                    context: context,
                    label: 'Overview',
                    icon: Icons.analytics_outlined,
                    route: '/admin',
                    isActive: currentRoute == '/admin',
                  ),
                  if (auth.canAny(['employee.read.team', 'employee.read.reports', 'employee.read.department', 'employee.read.all']))
                    _buildNavItem(
                      context: context,
                      label: 'Employees',
                      icon: Icons.people_outline,
                      route: '/admin/employees',
                      isActive: currentRoute == '/admin/employees',
                    ),
                  _buildNavItem(
                    context: context,
                    label: 'Org Hierarchy',
                    icon: Icons.account_tree_outlined,
                    route: '/admin/hierarchy',
                    isActive: currentRoute == '/admin/hierarchy',
                  ),
                  _buildNavItem(
                    context: context,
                    label: 'Access Grants',
                    icon: Icons.vpn_key_outlined,
                    route: '/admin/access-grants',
                    isActive: currentRoute == '/admin/access-grants',
                  ),
                  if (auth.canAny(['task.read.team', 'task.read.department', 'task.read.all']))
                    _buildNavItem(
                      context: context,
                      label: 'All Tasks',
                      icon: Icons.assignment_outlined,
                      route: '/admin/tasks',
                      isActive: currentRoute == '/admin/tasks',
                    ),
                  if (auth.can('task.review'))
                    _buildNavItem(
                      context: context,
                      label: 'Review Queue',
                      icon: Icons.rate_review_outlined,
                      route: '/admin/review',
                      isActive: currentRoute == '/admin/review',
                    ),
                  if (auth.can('sod.assign'))
                    _buildNavItem(
                      context: context,
                      label: 'Assign Duties',
                      icon: Icons.assignment_ind_outlined,
                      route: '/admin/assign-sod',
                      isActive: currentRoute == '/admin/assign-sod',
                    ),
                  if (auth.canAny(['sod.read.team', 'sod.read.reports', 'sod.read.department', 'sod.read.all']))
                    _buildNavItem(
                      context: context,
                      label: 'SOD / EOD Audit',
                      icon: Icons.history_toggle_off_outlined,
                      route: '/admin/sod-eod',
                      isActive: currentRoute == '/admin/sod-eod',
                    ),
                  if (auth.canAny(['session.read.team', 'session.read.reports', 'session.read.department', 'session.read.all']))
                    _buildNavItem(
                      context: context,
                      label: 'Activity Monitoring',
                      icon: Icons.visibility_outlined,
                      route: '/admin/activity',
                      isActive: currentRoute == '/admin/activity',
                    ),
                  if (auth.canAny(['attendance.read.team', 'attendance.read.department', 'attendance.read.all']))
                    _buildNavItem(
                      context: context,
                      label: 'Admin Attendance',
                      icon: Icons.schedule_outlined,
                      route: '/admin/attendance',
                      isActive: currentRoute == '/admin/attendance',
                    ),
                  if (auth.canAny(['leave.approve', 'leave.read.all', 'leave.read.department']))
                    _buildNavItem(
                      context: context,
                      label: 'Admin Leave',
                      icon: Icons.event_available_outlined,
                      route: '/admin/leave',
                      isActive: currentRoute == '/admin/leave',
                    ),
                  if (auth.canAny(['report.read.team', 'report.read.department', 'report.read.all']))
                    _buildNavItem(
                      context: context,
                      label: 'Reports',
                      icon: Icons.bar_chart_outlined,
                      route: '/admin/reports',
                      isActive: currentRoute == '/admin/reports',
                    ),
                  if (auth.canAny(['settings.read', 'role.manage', 'org.manage']))
                    _buildNavItem(
                      context: context,
                      label: 'Settings',
                      icon: Icons.settings_outlined,
                      route: '/admin/settings',
                      isActive: currentRoute == '/admin/settings',
                    ),
                ],
              ],
            ),
          ),

          // User Card Footer
          Container(
            padding: const EdgeInsets.all(12),
            decoration: const BoxDecoration(
              color: AppColors.slate50,
              border: Border(top: BorderSide(color: AppColors.slate200, width: 1)),
            ),
            child: Row(
              children: [
                AppAvatar(name: user?.fullName ?? 'User', size: 36),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        user?.fullName ?? 'User',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.slate900,
                        ),
                      ),
                      Text(
                        user?.role.name ?? 'Employee',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.logout, size: 20, color: AppColors.roseText),
                  tooltip: 'Sign Out',
                  onPressed: () async {
                    Navigator.pop(context);
                    await ref.read(authProvider.notifier).logout();
                    if (context.mounted) context.go('/login');
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppColors.slate400,
          letterSpacing: 0.8,
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required BuildContext context,
    required String label,
    required IconData icon,
    required String route,
    required bool isActive,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: isActive ? AppColors.brand50 : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () {
            Navigator.pop(context);
            context.go(route);
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Icon(
                  icon,
                  size: 18,
                  color: isActive ? AppColors.brand600 : AppColors.slate600,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                      color: isActive ? AppColors.brand700 : AppColors.slate700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

