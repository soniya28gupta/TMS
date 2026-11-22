import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class SodEodMonitorScreen extends ConsumerWidget {
  const SodEodMonitorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeesAsync = ref.watch(employeesProvider);

    return AppLayout(
      title: 'SOD / EOD Audit',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(employeesProvider),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Daily Duty & Compliance Audit',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 4),
              const Text(
                'Monitor morning work plans and evening reports submitted by employees.',
                style: TextStyle(fontSize: 12, color: AppColors.slate500),
              ),
              const SizedBox(height: 16),
              employeesAsync.when(
                data: (employees) {
                  if (employees.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.history_toggle_off_outlined,
                      title: 'No employee compliance records',
                      message: 'Records will show as employees submit their SOD and EOD reports.',
                    );
                  }

                  return ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: employees.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final emp = employees[index];
                      final sodSubmitted = emp.sodStatus == 'SUBMITTED';
                      final eodSubmitted = emp.eodStatus == 'SUBMITTED' || emp.eodStatus == 'REVIEWED';

                      return AppCard(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                AppAvatar(name: emp.fullName, size: 32),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        emp.fullName,
                                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                      ),
                                      Text(emp.employeeCode, style: const TextStyle(fontSize: 11, color: AppColors.slate500)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const Divider(height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    const Text('SOD: ', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                    AppBadge(
                                      label: emp.sodStatus,
                                      bgColor: sodSubmitted ? AppColors.emeraldBg : AppColors.amberBg,
                                      textColor: sodSubmitted ? AppColors.emeraldText : AppColors.amberText,
                                    ),
                                  ],
                                ),
                                Row(
                                  children: [
                                    const Text('EOD: ', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                    AppBadge(
                                      label: emp.eodStatus,
                                      bgColor: eodSubmitted ? AppColors.emeraldBg : AppColors.amberBg,
                                      textColor: eodSubmitted ? AppColors.emeraldText : AppColors.amberText,
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => ErrorBanner(message: err.toString()),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
