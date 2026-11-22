import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/attendance.dart';
import '../../models/leave.dart';
import '../../providers/auth_provider.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final user = auth.user;
    final dashboardAsync = ref.watch(employeeDashboardProvider);
    final todayAttendanceAsync = ref.watch(todayAttendanceProvider);

    return AppLayout(
      title: 'Employee Portal',
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(employeeDashboardProvider);
          ref.invalidate(todayAttendanceProvider);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Welcome greeting card
              AppCard(
                padding: const EdgeInsets.all(16),
                backgroundColor: AppColors.brand600,
                border: BorderSide.none,
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Good day, ${user?.firstName ?? 'there'}!',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              letterSpacing: -0.3,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            user?.designation ?? user?.role.name ?? 'Employee',
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.brand100,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            Formatters.formatDate(DateTime.now().toIso8601String()),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.brand200,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const AppAvatar(
                      name: '',
                      size: 48,
                      url: null,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Attendance & Duty Summary row
              todayAttendanceAsync.when(
                data: (att) => _buildAttendanceQuickCard(context, ref, att),
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const SizedBox.shrink(),
              ),
              const SizedBox(height: 16),

              // Dashboard stats from API
              dashboardAsync.when(
                data: (data) => _buildDashboardContent(context, data),
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: CircularProgressIndicator(),
                  ),
                ),
                error: (err, _) => ErrorBanner(message: err.toString()),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAttendanceQuickCard(
    BuildContext context,
    WidgetRef ref,
    TodayAttendanceResponse att,
  ) {
    final record = att.data;
    final isCheckedIn = record?.checkInAt != null && record?.checkOutAt == null;
    final isCompleted = record?.checkInAt != null && record?.checkOutAt != null;

    String statusText = 'Not checked in';
    Color statusColor = AppColors.slate500;
    if (isCheckedIn) {
      statusText = 'Checked In at ${Formatters.formatTime(record?.checkInAt)}';
      statusColor = AppColors.emeraldText;
    } else if (isCompleted) {
      statusText = 'Completed (${((record?.workedMinutes ?? 0) / 60).toStringAsFixed(1)} hrs)';
      statusColor = AppColors.brand600;
    }

    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: isCheckedIn ? AppColors.emeraldBg : AppColors.brand50,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.access_time_filled,
              color: isCheckedIn ? AppColors.emeraldText : AppColors.brand600,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Today's Attendance",
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.slate500,
                  ),
                ),
                Text(
                  statusText,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: statusColor,
                  ),
                ),
              ],
            ),
          ),
          AppButton(
            text: isCheckedIn ? 'Check Out' : 'Attendance',
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            onPressed: () => context.push('/attendance'),
          ),
        ],
      ),
    );
  }

  Widget _buildDashboardContent(BuildContext context, Map<String, dynamic> data) {
    final tasks = data['tasks'] as Map<String, dynamic>? ?? {};
    final sod = data['sod'] as Map<String, dynamic>? ?? {};
    final eod = data['eod'] as Map<String, dynamic>? ?? {};
    final upcoming = (data['upcomingTasks'] as List?) ?? [];
    final leaveBalances = (data['leaveBalances'] as List?) ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Task Metrics 2x2 Grid
        const Text(
          'Task Overview',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: AppColors.slate900,
          ),
        ),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.6,
          children: [
            _buildStatCard(
              title: 'Total Tasks',
              value: '${tasks['total'] ?? 0}',
              icon: Icons.assignment_outlined,
              iconColor: AppColors.brand600,
              bgColor: AppColors.brand50,
            ),
            _buildStatCard(
              title: 'In Progress',
              value: '${tasks['inProgress'] ?? 0}',
              icon: Icons.sync,
              iconColor: const Color(0xFFD97706),
              bgColor: AppColors.amberBg,
            ),
            _buildStatCard(
              title: 'In Review',
              value: '${tasks['inReview'] ?? 0}',
              icon: Icons.rate_review_outlined,
              iconColor: const Color(0xFF7E22CE),
              bgColor: AppColors.purpleBg,
            ),
            _buildStatCard(
              title: 'Completed',
              value: '${tasks['completed'] ?? 0}',
              icon: Icons.check_circle_outline,
              iconColor: AppColors.emeraldText,
              bgColor: AppColors.emeraldBg,
            ),
          ],
        ),
        const SizedBox(height: 16),

        // SOD & EOD Status Cards
        Row(
          children: [
            Expanded(
              child: AppCard(
                onTap: () => context.push('/sod'),
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'SOD (Morning)',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                        Icon(Icons.wb_sunny_outlined, size: 16, color: Colors.orange.shade700),
                      ],
                    ),
                    const SizedBox(height: 6),
                    AppBadge(
                      label: sod['status'] ?? 'PENDING',
                      bgColor: sod['status'] == 'SUBMITTED' ? AppColors.emeraldBg : AppColors.amberBg,
                      textColor: sod['status'] == 'SUBMITTED' ? AppColors.emeraldText : AppColors.amberText,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: AppCard(
                onTap: () => context.push('/eod'),
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'EOD (Evening)',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                        Icon(Icons.nights_stay_outlined, size: 16, color: Colors.indigo.shade700),
                      ],
                    ),
                    const SizedBox(height: 6),
                    AppBadge(
                      label: eod['status'] ?? 'PENDING',
                      bgColor: eod['status'] == 'SUBMITTED' || eod['status'] == 'REVIEWED'
                          ? AppColors.emeraldBg
                          : AppColors.amberBg,
                      textColor: eod['status'] == 'SUBMITTED' || eod['status'] == 'REVIEWED'
                          ? AppColors.emeraldText
                          : AppColors.amberText,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Leave Balances section
        if (leaveBalances.isNotEmpty) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Leave Balances',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              TextButton(
                onPressed: () => context.push('/leave'),
                child: const Text('View All', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: leaveBalances.map((b) {
                final balance = LeaveBalance.fromJson(b);
                return Container(
                  margin: const EdgeInsets.only(right: 10),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        balance.leaveType.name,
                        style: const TextStyle(fontSize: 11, color: AppColors.slate500, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${balance.available.toStringAsFixed(0)} days',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.slate900),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Upcoming Tasks section
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Upcoming Tasks',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
            ),
            TextButton(
              onPressed: () => context.push('/tasks'),
              child: const Text('View All', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
        if (upcoming.isEmpty)
          const EmptyStateWidget(
            icon: Icons.check_circle_outline,
            title: 'No pending tasks',
            message: 'You have completed all your upcoming tasks!',
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: upcoming.length > 5 ? 5 : upcoming.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final taskJson = upcoming[index] as Map<String, dynamic>;
              final taskId = taskJson['id']?.toString() ?? '';
              final priorityStyle = Formatters.getPriorityStyle(taskJson['priority']?.toString() ?? '');
              final statusStyle = Formatters.getTaskStatusStyle(taskJson['status']?.toString() ?? '');

              return AppCard(
                onTap: () => context.push('/tasks/$taskId'),
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          taskJson['code'] ?? '',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: AppColors.brand600,
                          ),
                        ),
                        const Spacer(),
                        AppBadge(
                          label: priorityStyle.label,
                          bgColor: priorityStyle.bgColor,
                          textColor: priorityStyle.textColor,
                        ),
                        const SizedBox(width: 6),
                        AppBadge(
                          label: statusStyle.label,
                          bgColor: statusStyle.bgColor,
                          textColor: statusStyle.textColor,
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      taskJson['title'] ?? '',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    AppProgressBar(progress: (taskJson['progress'] as num?)?.toInt() ?? 0),
                  ],
                ),
              );
            },
          ),
      ],
    );
  }

  Widget _buildStatCard({
    required String title,
    required String value,
    required IconData icon,
    required Color iconColor,
    required Color bgColor,
  }) {
    return AppCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.slate500,
                ),
              ),
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(6)),
                child: Icon(icon, size: 14, color: iconColor),
              ),
            ],
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.slate900,
            ),
          ),
        ],
      ),
    );
  }
}
