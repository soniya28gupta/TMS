import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/sod_eod.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class SodScreen extends ConsumerStatefulWidget {
  const SodScreen({super.key});

  @override
  ConsumerState<SodScreen> createState() => _SodScreenState();
}

class _SodScreenState extends ConsumerState<SodScreen> {
  final _noteController = TextEditingController();
  final List<Map<String, dynamic>> _selfItems = [];
  bool _isSubmitting = false;

  void _addSelfPlanItem() {
    final titleCtrl = TextEditingController();
    final hoursCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Self-Planned Duty'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleCtrl,
              decoration: const InputDecoration(labelText: 'Duty / Task Title *'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: hoursCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Planned Hours (e.g. 2.5)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              if (titleCtrl.text.trim().isEmpty) return;
              setState(() {
                _selfItems.add({
                  'titleSnapshot': titleCtrl.text.trim(),
                  'plannedHours': double.tryParse(hoursCtrl.text.trim()) ?? 1.0,
                  'source': 'SELF',
                  'status': 'PENDING',
                });
              });
              Navigator.pop(ctx);
            },
            child: const Text('Add Item'),
          ),
        ],
      ),
    );
  }

  Future<void> _submitSod(Sod? existingSod) async {
    setState(() => _isSubmitting = true);
    try {
      await ApiClient().post('/sod/submit', data: {
        'plannedNote': _noteController.text.trim(),
        'items': _selfItems,
      });
      ref.invalidate(todaySodProvider);
      ref.invalidate(employeeDashboardProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('SOD submitted successfully!')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.roseText),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sodAsync = ref.watch(todaySodProvider);

    return AppLayout(
      title: 'Start of Day (SOD)',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(todaySodProvider),
        child: sodAsync.when(
          data: (sod) {
            final isSubmitted = sod?.status == 'SUBMITTED';

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  AppCard(
                    padding: const EdgeInsets.all(16),
                    backgroundColor: AppColors.brand50,
                    border: const BorderSide(color: AppColors.brand200),
                    child: Row(
                      children: [
                        const Icon(Icons.wb_sunny_outlined, size: 28, color: Color(0xFFD97706)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Morning Work Plan',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.slate900,
                                ),
                              ),
                              Text(
                                isSubmitted
                                    ? 'Submitted at ${Formatters.formatTime(sod?.submittedAt)}'
                                    : 'Review tasks and plan your goals for today',
                                style: const TextStyle(fontSize: 12, color: AppColors.slate600),
                              ),
                            ],
                          ),
                        ),
                        AppBadge(
                          label: sod?.status ?? 'PENDING',
                          bgColor: isSubmitted ? AppColors.emeraldBg : AppColors.amberBg,
                          textColor: isSubmitted ? AppColors.emeraldText : AppColors.amberText,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Tasks linked to SOD
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Assigned & Linked Tasks',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.slate900,
                        ),
                      ),
                      if (!isSubmitted)
                        TextButton.icon(
                          onPressed: _addSelfPlanItem,
                          icon: const Icon(Icons.add, size: 16),
                          label: const Text('Add Plan', style: TextStyle(fontSize: 12)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  if (sod?.items.isEmpty ?? true && _selfItems.isEmpty)
                    const EmptyStateWidget(
                      icon: Icons.checklist_outlined,
                      title: 'No tasks scheduled',
                      message: 'Add custom self-plan items or accept pending tasks.',
                    )
                  else ...[
                    // Existing items from server
                    if (sod != null)
                      ...sod.items.map((item) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: AppCard(
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                children: [
                                  Icon(
                                    item.source == 'ASSIGNED'
                                        ? Icons.assignment_ind_outlined
                                        : Icons.task_alt,
                                    size: 18,
                                    color: AppColors.brand600,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          item.titleSnapshot,
                                          style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        if (item.plannedHours != null)
                                          Text(
                                            'Planned: ${item.plannedHours} hrs',
                                            style: const TextStyle(
                                              fontSize: 11,
                                              color: AppColors.slate500,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  AppBadge(
                                    label: item.status,
                                    bgColor: AppColors.slate100,
                                    textColor: AppColors.slate700,
                                  ),
                                ],
                              ),
                            ),
                          )),

                    // Locally added self items
                    ..._selfItems.map((item) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: AppCard(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                const Icon(Icons.person_outline, size: 18, color: AppColors.brand600),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item['titleSnapshot'],
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      Text(
                                        'Planned: ${item['plannedHours']} hrs (Self)',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.slate500,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 18, color: AppColors.roseText),
                                  onPressed: () {
                                    setState(() => _selfItems.remove(item));
                                  },
                                ),
                              ],
                            ),
                          ),
                        )),
                  ],
                  const SizedBox(height: 16),

                  // Planned notes & submit
                  if (!isSubmitted) ...[
                    const Text(
                      'Daily Goals & Notes',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _noteController,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        hintText: 'What do you aim to achieve by the end of today?',
                      ),
                    ),
                    const SizedBox(height: 20),
                    AppButton(
                      text: 'Submit Start of Day (SOD)',
                      isFullWidth: true,
                      isLoading: _isSubmitting,
                      onPressed: () => _submitSod(sod),
                    ),
                  ],
                ],
              ),
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: ErrorBanner(message: err.toString()),
            ),
          ),
        ),
      ),
    );
  }
}

