import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class AdminAttendanceScreen extends ConsumerWidget {
  const AdminAttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(attendanceHistoryProvider);

    return AppLayout(
      title: 'Admin Attendance',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(attendanceHistoryProvider),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Company Attendance Register',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 4),
              const Text(
                'Company-wide check-in logs, worked duration, and GPS verification status.',
                style: TextStyle(fontSize: 12, color: AppColors.slate500),
              ),
              const SizedBox(height: 16),
              historyAsync.when(
                data: (records) {
                  if (records.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.access_time_outlined,
                      title: 'No attendance records',
                      message: 'Daily check-in and check-out logs will be listed here.',
                    );
                  }

                  return ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: records.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final r = records[index];
                      final statusStyle = Formatters.getAttendanceStyle(r.status);
                      final hasGps = r.hasCheckInGps || r.hasCheckOutGps;

                      return AppCard(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                AppAvatar(name: r.user?.fullName ?? 'Employee', size: 32),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        r.user?.fullName ?? 'Employee',
                                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                      ),
                                      Text(
                                        Formatters.formatDate(r.date),
                                        style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                                      ),
                                    ],
                                  ),
                                ),
                                AppBadge(
                                  label: statusStyle.label,
                                  bgColor: statusStyle.bgColor,
                                  textColor: statusStyle.textColor,
                                ),
                              ],
                            ),
                            const Divider(height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'In: ${Formatters.formatTime(r.checkInAt)}  •  Out: ${Formatters.formatTime(r.checkOutAt)}',
                                  style: const TextStyle(fontSize: 12, color: AppColors.slate700),
                                ),
                                Text(
                                  '${((r.workedMinutes) / 60).toStringAsFixed(1)} hrs',
                                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.brand700),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Icon(
                                  hasGps ? Icons.location_on : Icons.location_off,
                                  size: 13,
                                  color: hasGps ? AppColors.emeraldText : AppColors.slate400,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  hasGps ? 'GPS Captured & Verified' : 'GPS Unavailable',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                    color: hasGps ? AppColors.emeraldText : AppColors.slate400,
                                  ),
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
