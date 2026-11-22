import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  final List<Map<String, dynamic>> _reportCategories = [
    {
      'title': 'Daily Attendance Register',
      'desc': 'Detailed punch times, worked hours, and GPS location records.',
      'icon': Icons.access_time_filled,
      'code': 'ATTENDANCE',
    },
    {
      'title': 'Task Completion & Velocity Audit',
      'desc': 'Status transitions, hours spent, overdue trends, and review cycles.',
      'icon': Icons.task_alt,
      'code': 'TASKS',
    },
    {
      'title': 'SOD & EOD Compliance Report',
      'desc': 'Daily duty submission timestamps, missing reports, and goals achieved.',
      'icon': Icons.history_toggle_off,
      'code': 'DUTIES',
    },
    {
      'title': 'Leave Entitlement & Balances',
      'desc': 'Available leaves, consumed quotas, and pending approval records.',
      'icon': Icons.calendar_today,
      'code': 'LEAVE',
    },
    {
      'title': 'Employee Master Directory',
      'desc': 'Headcount, positions, reporting managers, shifts, and departments.',
      'icon': Icons.badge_outlined,
      'code': 'EMPLOYEES',
    },
  ];

  void _runReport(String title) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Generating $title... Report downloaded.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AppLayout(
      title: 'Reports & Analytics',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Company Intelligence & Export',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
            ),
            const SizedBox(height: 4),
            const Text(
              'Generate consolidated audit reports across attendance, tasks, duties, and leaves.',
              style: TextStyle(fontSize: 12, color: AppColors.slate500),
            ),
            const SizedBox(height: 16),

            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _reportCategories.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final rep = _reportCategories[index];
                return AppCard(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.brand50,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(rep['icon'] as IconData, size: 24, color: AppColors.brand600),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              rep['title'] as String,
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              rep['desc'] as String,
                              style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.download_outlined, color: AppColors.brand600),
                        tooltip: 'Export Report',
                        onPressed: () => _runReport(rep['title'] as String),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
