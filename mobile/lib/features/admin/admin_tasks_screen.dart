import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class AdminTasksScreen extends ConsumerStatefulWidget {
  const AdminTasksScreen({super.key});

  @override
  ConsumerState<AdminTasksScreen> createState() => _AdminTasksScreenState();
}

class _AdminTasksScreenState extends ConsumerState<AdminTasksScreen> {
  String _selectedStatus = 'ALL';
  String _searchQuery = '';
  final _searchController = TextEditingController();

  void _showCreateTaskModal() {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    String priority = 'MEDIUM';
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
                  const Text('Create Company Task', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => Navigator.pop(ctx)),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: titleCtrl,
                decoration: const InputDecoration(labelText: 'Task Title *', hintText: 'e.g. Prepare Q3 financial report'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: descCtrl,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Description', hintText: 'Detailed requirements...'),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: priority,
                decoration: const InputDecoration(labelText: 'Priority'),
                items: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) {
                  return DropdownMenuItem(value: p, child: Text(p));
                }).toList(),
                onChanged: (val) {
                  if (val != null) setModalState(() => priority = val);
                },
              ),
              const SizedBox(height: 16),
              AppButton(
                text: 'Create Task',
                isLoading: isSubmitting,
                onPressed: () async {
                  if (titleCtrl.text.trim().isEmpty) return;
                  setModalState(() => isSubmitting = true);
                  try {
                    await ApiClient().post('/tasks', data: {
                      'title': titleCtrl.text.trim(),
                      'description': descCtrl.text.trim(),
                      'priority': priority,
                    });
                    if (mounted) {
                      Navigator.pop(ctx);
                      ref.invalidate(tasksProvider);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Task created successfully!')),
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

  @override
  Widget build(BuildContext context) {
    final queryParams = <String, dynamic>{'scope': 'all'};
    if (_selectedStatus != 'ALL') queryParams['status'] = _selectedStatus;
    if (_searchQuery.isNotEmpty) queryParams['search'] = _searchQuery;

    final tasksAsync = ref.watch(tasksProvider(queryParams));

    return AppLayout(
      title: 'Company Tasks',
      child: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
                    decoration: InputDecoration(
                      hintText: 'Search company tasks...',
                      prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.slate400),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  icon: const Icon(Icons.add, size: 20),
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.brand600,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: _showCreateTaskModal,
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.slate200),

          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(tasksProvider),
              child: tasksAsync.when(
                data: (tasks) {
                  if (tasks.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.assignment_outlined,
                      title: 'No company tasks found',
                      message: 'Create a task or change your search filter.',
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: tasks.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final task = tasks[index];
                      final statusStyle = Formatters.getTaskStatusStyle(task.status);
                      final priorityStyle = Formatters.getPriorityStyle(task.priority);

                      return AppCard(
                        onTap: () => context.push('/tasks/${task.id}'),
                        padding: const EdgeInsets.all(14),
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
                            const SizedBox(height: 8),
                            Text(
                              task.title,
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                if (task.assignee != null) ...[
                                  AppAvatar(name: task.assignee!.fullName, size: 20),
                                  const SizedBox(width: 6),
                                  Text(task.assignee!.fullName, style: const TextStyle(fontSize: 11, color: AppColors.slate600)),
                                ] else
                                  const Text('Unassigned', style: TextStyle(fontSize: 11, color: AppColors.slate400)),
                                const Spacer(),
                                Text('${task.progress}%', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
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
          ),
        ],
      ),
    );
  }
}
