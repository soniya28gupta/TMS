import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/leave.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class LeaveScreen extends ConsumerStatefulWidget {
  const LeaveScreen({super.key});

  @override
  ConsumerState<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends ConsumerState<LeaveScreen> {
  void _showApplyLeaveModal(List<LeaveBalance> balances) {
    if (balances.isEmpty) return;

    String selectedTypeId = balances.first.leaveType.id;
    final startDateCtrl = TextEditingController(text: Formatters.todayISO());
    final endDateCtrl = TextEditingController(text: Formatters.todayISO());
    final reasonCtrl = TextEditingController();
    bool isHalfDay = false;
    bool isSubmitting = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Apply for Leave',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                  ),
                  IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => Navigator.pop(ctx)),
                ],
              ),
              const SizedBox(height: 12),
              // Leave Type Dropdown
              DropdownButtonFormField<String>(
                value: selectedTypeId,
                decoration: const InputDecoration(labelText: 'Leave Type *'),
                items: balances.map((b) {
                  return DropdownMenuItem<String>(
                    value: b.leaveType.id,
                    child: Text('${b.leaveType.name} (${b.available} days left)'),
                  );
                }).toList(),
                onChanged: (val) {
                  if (val != null) setModalState(() => selectedTypeId = val);
                },
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: startDateCtrl,
                      decoration: const InputDecoration(labelText: 'Start Date (YYYY-MM-DD)'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: endDateCtrl,
                      decoration: const InputDecoration(labelText: 'End Date (YYYY-MM-DD)'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              CheckboxListTile(
                title: const Text('Half Day Leave', style: TextStyle(fontSize: 13)),
                value: isHalfDay,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                onChanged: (val) => setModalState(() => isHalfDay = val == true),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: reasonCtrl,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Reason for Leave *'),
              ),
              const SizedBox(height: 16),
              AppButton(
                text: 'Submit Application',
                isLoading: isSubmitting,
                onPressed: () async {
                  if (reasonCtrl.text.trim().isEmpty) return;
                  setModalState(() => isSubmitting = true);
                  try {
                    await ApiClient().post('/leave', data: {
                      'leaveTypeId': selectedTypeId,
                      'startDate': startDateCtrl.text.trim(),
                      'endDate': endDateCtrl.text.trim(),
                      'isHalfDay': isHalfDay,
                      'reason': reasonCtrl.text.trim(),
                    });
                    if (mounted) {
                      Navigator.pop(ctx);
                      ref.invalidate(leaveBalancesProvider);
                      ref.invalidate(leaveRequestsProvider);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Leave application submitted!')),
                      );
                    }
                  } catch (e) {
                    setModalState(() => isSubmitting = false);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.roseText),
                    );
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _cancelLeave(String id) async {
    try {
      await ApiClient().post('/leave/$id/cancel');
      ref.invalidate(leaveBalancesProvider);
      ref.invalidate(leaveRequestsProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Leave request cancelled')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to cancel: $e'), backgroundColor: AppColors.roseText),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final balancesAsync = ref.watch(leaveBalancesProvider);
    final requestsAsync = ref.watch(leaveRequestsProvider);

    return AppLayout(
      title: 'Leave Management',
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(leaveBalancesProvider);
          ref.invalidate(leaveRequestsProvider);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Balances Section
              balancesAsync.when(
                data: (balances) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Leave Entitlements',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                          ),
                          AppButton(
                            text: '+ Apply Leave',
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            onPressed: () => _showApplyLeaveModal(balances),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: 10,
                          mainAxisSpacing: 10,
                          childAspectRatio: 1.5,
                        ),
                        itemCount: balances.length,
                        itemBuilder: (context, index) {
                          final b = balances[index];
                          return AppCard(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  b.leaveType.name,
                                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate500),
                                ),
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.baseline,
                                  textBaseline: TextBaseline.alphabetic,
                                  children: [
                                    Text(
                                      '${b.available.toStringAsFixed(0)}',
                                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.slate900),
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      '/ ${b.entitled.toStringAsFixed(0)} days',
                                      style: const TextStyle(fontSize: 11, color: AppColors.slate400),
                                    ),
                                  ],
                                ),
                                Text(
                                  'Used: ${b.used} • Pending: ${b.pending}',
                                  style: const TextStyle(fontSize: 10, color: AppColors.slate500),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ],
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => ErrorBanner(message: err.toString()),
              ),
              const SizedBox(height: 24),

              // Requests History Section
              const Text(
                'Leave Requests History',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 10),

              requestsAsync.when(
                data: (requests) {
                  if (requests.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.calendar_today_outlined,
                      title: 'No leave applications',
                      message: 'Submitted leave requests will be tracked here.',
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
                      final isApproved = req.status == 'APPROVED';

                      return AppCard(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  req.leaveType.name,
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  '(${req.days} ${req.days == 1 ? 'day' : 'days'})',
                                  style: const TextStyle(fontSize: 12, color: AppColors.slate500),
                                ),
                                const Spacer(),
                                AppBadge(
                                  label: req.status,
                                  bgColor: isApproved
                                      ? AppColors.emeraldBg
                                      : isPending
                                          ? AppColors.amberBg
                                          : AppColors.roseBg,
                                  textColor: isApproved
                                      ? AppColors.emeraldText
                                      : isPending
                                          ? AppColors.amberText
                                          : AppColors.roseText,
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              '${Formatters.formatDate(req.startDate)} to ${Formatters.formatDate(req.endDate)}',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.brand600),
                            ),
                            if (req.reason.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(req.reason, style: const TextStyle(fontSize: 12, color: AppColors.slate600)),
                            ],
                            if (isPending) ...[
                              const SizedBox(height: 10),
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton(
                                  style: TextButton.styleFrom(foregroundColor: AppColors.roseText),
                                  onPressed: () => _cancelLeave(req.id),
                                  child: const Text('Cancel Request', style: TextStyle(fontSize: 12)),
                                ),
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

