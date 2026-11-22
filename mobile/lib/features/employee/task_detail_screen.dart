import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/task.dart';
import '../../providers/data_providers.dart';
import '../../widgets/ui_components.dart';

class TaskDetailScreen extends ConsumerStatefulWidget {
  final String taskId;

  const TaskDetailScreen({super.key, required this.taskId});

  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  final _commentController = TextEditingController();
  bool _isActionBusy = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _updateStatus(String action, [Map<String, dynamic>? extra]) async {
    setState(() => _isActionBusy = true);
    try {
      await ApiClient().post('/tasks/${widget.taskId}/workflow/$action', data: extra ?? {});
      ref.invalidate(taskDetailProvider(widget.taskId));
      ref.invalidate(tasksProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Task updated: $action')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.roseText),
      );
    } finally {
      if (mounted) setState(() => _isActionBusy = false);
    }
  }

  Future<void> _postComment() async {
    final body = _commentController.text.trim();
    if (body.isEmpty) return;

    try {
      await ApiClient().post('/tasks/${widget.taskId}/comments', data: {'body': body});
      _commentController.clear();
      ref.invalidate(taskDetailProvider(widget.taskId));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to post comment: $e'), backgroundColor: AppColors.roseText),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final taskAsync = ref.watch(taskDetailProvider(widget.taskId));

    return Scaffold(
      backgroundColor: AppColors.scaffoldBg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('Task Details'),
      ),
      body: taskAsync.when(
        data: (detail) {
          final task = detail.task;
          final statusStyle = Formatters.getTaskStatusStyle(task.status);
          final priorityStyle = Formatters.getPriorityStyle(task.priority);

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top status card
                AppCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            task.code,
                            style: const TextStyle(
                              fontSize: 13,
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
                      const SizedBox(height: 10),
                      Text(
                        task.title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.slate900,
                        ),
                      ),
                      if (task.description != null && task.description!.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          task.description!,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.slate600,
                            height: 1.4,
                          ),
                        ),
                      ],
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(child: AppProgressBar(progress: task.progress, height: 8)),
                          const SizedBox(width: 10),
                          Text(
                            '${task.progress}%',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.slate700,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Workflow action buttons
                _buildWorkflowActions(task),
                const SizedBox(height: 14),

                // Details & Metadata
                AppCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Assignment & Schedule',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.slate900,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildMetaRow('Assignee', task.assignee?.fullName ?? 'Unassigned'),
                      _buildMetaRow('Created By', task.createdBy?.fullName ?? 'System'),
                      _buildMetaRow('Start Date', Formatters.formatDate(task.startDate)),
                      _buildMetaRow('Due Date', Formatters.formatDate(task.dueDate)),
                      if (task.estimatedHours != null)
                        _buildMetaRow('Estimated Hours', '${task.estimatedHours} hrs'),
                      _buildMetaRow('Actual Hours', '${task.actualHours} hrs'),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Comments Section
                const Text(
                  'Activity & Comments',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.slate900,
                  ),
                ),
                const SizedBox(height: 10),
                AppCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _commentController,
                              decoration: const InputDecoration(
                                hintText: 'Write a comment or update...',
                                isDense: true,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          AppButton(
                            text: 'Send',
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            onPressed: _postComment,
                          ),
                        ],
                      ),
                      if (detail.comments.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        const Divider(height: 1, color: AppColors.slate200),
                        ListView.separated(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          padding: const EdgeInsets.only(top: 12),
                          itemCount: detail.comments.length,
                          separatorBuilder: (_, __) =>
                              const Divider(height: 16, color: AppColors.slate100),
                          itemBuilder: (context, index) {
                            final c = detail.comments[index];
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      c.author.fullName,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.slate800,
                                      ),
                                    ),
                                    const Spacer(),
                                    Text(
                                      Formatters.relativeTime(c.createdAt),
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: AppColors.slate400,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  c.body,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: AppColors.slate700,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ],
                    ],
                  ),
                ),
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
    );
  }

  Widget _buildWorkflowActions(Task task) {
    if (_isActionBusy) {
      return const Center(child: CircularProgressIndicator());
    }

    final status = task.status;
    return AppCard(
      padding: const EdgeInsets.all(12),
      backgroundColor: AppColors.slate50,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          if (status == 'ASSIGNED')
            AppButton(
              text: 'Accept Task',
              icon: Icons.check,
              onPressed: () => _updateStatus('accept'),
            ),
          if (status == 'ACCEPTED')
            AppButton(
              text: 'Start Working',
              icon: Icons.play_arrow,
              onPressed: () => _updateStatus('start'),
            ),
          if (status == 'IN_PROGRESS' || status == 'CHANGES_REQUIRED') ...[
            AppButton(
              text: 'Submit for Review',
              icon: Icons.rate_review_outlined,
              onPressed: () => _updateStatus('submit-review'),
            ),
            AppButton(
              text: 'Mark Blocked',
              variant: AppButtonVariant.secondary,
              icon: Icons.block,
              onPressed: () => _showBlockedDialog(),
            ),
          ],
          if (status == 'BLOCKED')
            AppButton(
              text: 'Unblock Task',
              icon: Icons.lock_open,
              onPressed: () => _updateStatus('unblock'),
            ),
          if (status == 'SUBMITTED_FOR_REVIEW')
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.purpleBg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.purpleBorder),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.hourglass_empty, size: 16, color: AppColors.purpleText),
                  SizedBox(width: 6),
                  Text(
                    'Submitted for review. Awaiting manager approval.',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.purpleText,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  void _showBlockedDialog() {
    final reasonController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Mark Task as Blocked'),
        content: TextField(
          controller: reasonController,
          decoration: const InputDecoration(hintText: 'Enter blocker reason...'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _updateStatus('block', {'blockedReason': reasonController.text.trim()});
            },
            child: const Text('Confirm Block'),
          ),
        ],
      ),
    );
  }

  Widget _buildMetaRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.slate500)),
          Text(
            value,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.slate800,
            ),
          ),
        ],
      ),
    );
  }
}

