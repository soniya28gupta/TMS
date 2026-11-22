import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class ReviewQueueScreen extends ConsumerStatefulWidget {
  const ReviewQueueScreen({super.key});

  @override
  ConsumerState<ReviewQueueScreen> createState() => _ReviewQueueScreenState();
}

class _ReviewQueueScreenState extends ConsumerState<ReviewQueueScreen> {
  Future<void> _handleDecision(String taskId, String action, [String? notes]) async {
    try {
      await ApiClient().post('/tasks/$taskId/workflow/$action', data: {'notes': notes});
      ref.invalidate(reviewQueueProvider);
      ref.invalidate(adminDashboardProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Task $action completed')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.roseText),
      );
    }
  }

  void _showChangesRequestedDialog(String taskId) {
    final notesCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Request Changes'),
        content: TextField(
          controller: notesCtrl,
          maxLines: 3,
          decoration: const InputDecoration(hintText: 'Specify what changes or corrections are needed...'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _handleDecision(taskId, 'request-changes', notesCtrl.text.trim());
            },
            child: const Text('Send Feedback'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final queueAsync = ref.watch(reviewQueueProvider);

    return AppLayout(
      title: 'Review Queue',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(reviewQueueProvider),
        child: queueAsync.when(
          data: (tasks) {
            if (tasks.isEmpty) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: EmptyStateWidget(
                    icon: Icons.rate_review_outlined,
                    title: 'Review Queue is Empty',
                    message: 'No tasks currently submitted for review.',
                  ),
                ),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: tasks.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final task = tasks[index];
                return AppCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            task.code,
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.brand600),
                          ),
                          const Spacer(),
                          const AppBadge(
                            label: 'Submitted for Review',
                            bgColor: AppColors.purpleBg,
                            textColor: AppColors.purpleText,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        task.title,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
                      ),
                      if (task.description != null) ...[
                        const SizedBox(height: 4),
                        Text(task.description!, maxLines: 2, style: const TextStyle(fontSize: 12, color: AppColors.slate600)),
                      ],
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          if (task.assignee != null) ...[
                            AppAvatar(name: task.assignee!.fullName, size: 24),
                            const SizedBox(width: 8),
                            Text(task.assignee!.fullName, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                          ],
                          const Spacer(),
                          Text(
                            'Actual: ${task.actualHours} hrs',
                            style: const TextStyle(fontSize: 12, color: AppColors.slate500),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: AppButton(
                              text: 'Approve & Complete',
                              icon: Icons.check,
                              onPressed: () => _handleDecision(task.id, 'approve'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: AppButton(
                              text: 'Request Changes',
                              variant: AppButtonVariant.secondary,
                              icon: Icons.replay,
                              onPressed: () => _showChangesRequestedDialog(task.id),
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
          error: (err, _) => Center(
            child: Padding(padding: const EdgeInsets.all(24), child: ErrorBanner(message: err.toString())),
          ),
        ),
      ),
    );
  }
}
