import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class AdminLeaveScreen extends ConsumerWidget {
  const AdminLeaveScreen({super.key});

  Future<void> _handleDecision(BuildContext context, WidgetRef ref, String id, String status) async {
    try {
      await ApiClient().post('/leave/$id/decision', data: {'status': status});
      ref.invalidate(leaveRequestsProvider);
      ref.invalidate(adminDashboardProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Leave request $status')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.roseText),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requestsAsync = ref.watch(leaveRequestsProvider);

    return AppLayout(
      title: 'Leave Approvals',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(leaveRequestsProvider),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Leave Requests Queue',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 4),
              const Text(
                'Review and decide on leave applications submitted by company employees.',
                style: TextStyle(fontSize: 12, color: AppColors.slate500),
              ),
              const SizedBox(height: 16),
              requestsAsync.when(
                data: (requests) {
                  if (requests.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.event_available_outlined,
                      title: 'No pending leave applications',
                      message: 'All leave requests have been processed.',
                    );
                  }

                  return ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: requests.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final req = requests[index];
                      final isPending = req.status == 'PENDING';

                      return AppCard(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                AppAvatar(name: req.user?.fullName ?? 'Employee', size: 32),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        req.user?.fullName ?? 'Employee',
                                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                      ),
                                      Text(
                                        '${req.leaveType.name} (${req.days} days)',
                                        style: const TextStyle(fontSize: 11, color: AppColors.brand600, fontWeight: FontWeight.w600),
                                      ),
                                    ],
                                  ),
                                ),
                                AppBadge(
                                  label: req.status,
                                  bgColor: isPending ? AppColors.amberBg : AppColors.emeraldBg,
                                  textColor: isPending ? AppColors.amberText : AppColors.emeraldText,
                                ),
                              ],
                            ),
                            const Divider(height: 16),
                            Text(
                              '${Formatters.formatDate(req.startDate)} to ${Formatters.formatDate(req.endDate)}',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate800),
                            ),
                            if (req.reason.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(req.reason, style: const TextStyle(fontSize: 12, color: AppColors.slate600)),
                            ],
                            if (isPending) ...[
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: AppButton(
                                      text: 'Approve',
                                      icon: Icons.check,
                                      onPressed: () => _handleDecision(context, ref, req.id, 'APPROVED'),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: AppButton(
                                      text: 'Reject',
                                      variant: AppButtonVariant.danger,
                                      icon: Icons.close,
                                      onPressed: () => _handleDecision(context, ref, req.id, 'REJECTED'),
                                    ),
                                  ),
                                ],
                              ),
                            ],
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
