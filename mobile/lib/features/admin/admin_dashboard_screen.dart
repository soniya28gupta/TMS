import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final adminAsync = ref.watch(adminDashboardProvider);

    return AppLayout(
      title: 'Admin Overview',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(adminDashboardProvider),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: adminAsync.when(
            data: (data) => _buildContent(context, data),
            loading: () => const Center(
              child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator()),
            ),
            error: (err, _) => ErrorBanner(message: err.toString()),
          ),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, Map<String, dynamic> data) {
    final employees = data['employees'] as Map<String, dynamic>? ?? {};
    final attendance = data['attendance'] as Map<String, dynamic>? ?? {};
    final tasks = data['tasks'] as Map<String, dynamic>? ?? {};
    final queues = data['queues'] as Map<String, dynamic>? ?? {};
    final sod = data['sod'] as Map<String, dynamic>? ?? {};
    final eod = data['eod'] as Map<String, dynamic>? ?? {};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Action Queues Alert Banners if any items require attention
        if ((queues['taskReview'] ?? 0) > 0 || (queues['leaveApproval'] ?? 0) > 0) ...[
          Row(
            children: [
              if ((queues['taskReview'] ?? 0) > 0)
                Expanded(
                  child: AppCard(
                    onTap: () => context.push('/admin/review'),
                    backgroundColor: AppColors.purpleBg,
                    border: const BorderSide(color: AppColors.purpleBorder),
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${queues['taskReview']} Tasks in Review',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.purpleText,
                          ),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Requires approval',
                          style: TextStyle(fontSize: 11, color: AppColors.slate600),
                        ),
                      ],
                    ),
                  ),
                ),
              if ((queues['taskReview'] ?? 0) > 0 && (queues['leaveApproval'] ?? 0) > 0)
                const SizedBox(width: 10),
              if ((queues['leaveApproval'] ?? 0) > 0)
                Expanded(
                  child: AppCard(
                    onTap: () => context.push('/admin/leave'),
                    backgroundColor: AppColors.amberBg,
                    border: const BorderSide(color: AppColors.amberBorder),
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${queues['leaveApproval']} Leave Requests',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.amberText,
                          ),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Pending decision',
                          style: TextStyle(fontSize: 11, color: AppColors.slate600),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
        ],

        // Company Metrics (Headcount)
        const Text(
          'Headcount & Organization',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
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
              title: 'Total Employees',
              value: '${employees['total'] ?? 0}',
              icon: Icons.people_outline,
              color: AppColors.brand600,
              bgColor: AppColors.brand50,
              onTap: () => context.push('/admin/employees'),
            ),
            _buildStatCard(
              title: 'Active Today',
              value: '${employees['active'] ?? 0}',
              icon: Icons.check_circle_outline,
              color: AppColors.emeraldText,
              bgColor: AppColors.emeraldBg,
              onTap: () => context.push('/admin/attendance'),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Attendance Distribution
        const Text(
          "Today's Attendance Status",
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
        ),
        const SizedBox(height: 10),
        AppCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildAttendancePill('Present', '${attendance['present'] ?? 0}', AppColors.emeraldText, AppColors.emeraldBg),
                  _buildAttendancePill('WFH', '${attendance['wfh'] ?? 0}', AppColors.skyText, AppColors.skyBg),
                  _buildAttendancePill('Late', '${attendance['late'] ?? 0}', AppColors.amberText, AppColors.amberBg),
                  _buildAttendancePill('Absent', '${attendance['absent'] ?? 0}', AppColors.roseText, AppColors.roseBg),
                ],
              ),
              const Divider(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Not Marked Yet: ${attendance['notMarked'] ?? 0}',
                    style: const TextStyle(fontSize: 12, color: AppColors.slate500, fontWeight: FontWeight.w500),
                  ),
                  TextButton(
                    onPressed: () => context.push('/admin/attendance'),
                    child: const Text('View Register', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // SOD & EOD Compliance
        const Text(
          'Daily Duty Compliance',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: AppCard(
                onTap: () => context.push('/admin/sod-eod'),
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Morning SOD', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    Text('${sod['submitted'] ?? 0} Submitted', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.emeraldText)),
                    Text('${sod['pending'] ?? 0} Pending', style: const TextStyle(fontSize: 11, color: AppColors.slate500)),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: AppCard(
                onTap: () => context.push('/admin/sod-eod'),
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Evening EOD', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    Text('${eod['submitted'] ?? 0} Submitted', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.brand700)),
                    Text('${eod['pending'] ?? 0} Pending', style: const TextStyle(fontSize: 11, color: AppColors.slate500)),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Task Pipeline Overview
        const Text(
          'Company Task Pipeline',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
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
              color: AppColors.brand600,
              bgColor: AppColors.brand50,
              onTap: () => context.push('/admin/tasks'),
            ),
            _buildStatCard(
              title: 'In Progress',
              value: '${tasks['inProgress'] ?? 0}',
              icon: Icons.sync,
              color: const Color(0xFFD97706),
              bgColor: AppColors.amberBg,
              onTap: () => context.push('/admin/tasks'),
            ),
            _buildStatCard(
              title: 'In Review Queue',
              value: '${tasks['inReview'] ?? 0}',
              icon: Icons.rate_review_outlined,
              color: const Color(0xFF7E22CE),
              bgColor: AppColors.purpleBg,
              onTap: () => context.push('/admin/review'),
            ),
            _buildStatCard(
              title: 'Completed',
              value: '${tasks['completed'] ?? 0}',
              icon: Icons.check_circle_outline,
              color: AppColors.emeraldText,
              bgColor: AppColors.emeraldBg,
              onTap: () => context.push('/admin/tasks'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildAttendancePill(String label, String value, Color fg, Color bg) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
          child: Text(
            value,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: fg),
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.slate600, fontWeight: FontWeight.w600)),
      ],
    );
  }

  Widget _buildStatCard({
    required String title,
    required String value,
    required IconData icon,
    required Color color,
    required Color bgColor,
    VoidCallback? onTap,
  }) {
    return AppCard(
      onTap: onTap,
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
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate500),
              ),
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(6)),
                child: Icon(icon, size: 14, color: color),
              ),
            ],
          ),
          Text(
            value,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.slate900),
          ),
        ],
      ),
    );
  }
}

