import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/task.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});

  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> {
  String _selectedStatus = 'ALL';
  String _searchQuery = '';
  final _searchController = TextEditingController();

  final List<Map<String, String>> _statusTabs = [
    {'key': 'ALL', 'label': 'All Tasks'},
    {'key': 'IN_PROGRESS', 'label': 'In Progress'},
    {'key': 'SUBMITTED_FOR_REVIEW', 'label': 'In Review'},
    {'key': 'COMPLETED', 'label': 'Completed'},
    {'key': 'BLOCKED', 'label': 'Blocked'},
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final queryParams = <String, dynamic>{};
    if (_selectedStatus != 'ALL') {
      queryParams['status'] = _selectedStatus;
    }
    if (_searchQuery.isNotEmpty) {
      queryParams['search'] = _searchQuery;
    }

    final tasksAsync = ref.watch(tasksProvider(queryParams));

    return AppLayout(
      title: 'My Tasks',
      child: Column(
        children: [
          // Filter and Search Header
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              children: [
                // Search Input
                TextField(
                  controller: _searchController,
                  onChanged: (val) => setState(() => _searchQuery = val.trim()),
                  decoration: InputDecoration(
                    hintText: 'Search tasks by title or code...',
                    prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.slate400),
                    suffixIcon: _searchQuery.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _searchQuery = '');
                            },
                          )
                        : null,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
                const SizedBox(height: 10),
                // Horizontal Status Pills
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _statusTabs.map((tab) {
                      final isSelected = _selectedStatus == tab['key'];
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(tab['label']!),
                          selected: isSelected,
                          onSelected: (_) => setState(() => _selectedStatus = tab['key']!),
                          labelStyle: TextStyle(
                            fontSize: 12,
                            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                            color: isSelected ? Colors.white : AppColors.slate700,
                          ),
                          selectedColor: AppColors.brand600,
                          backgroundColor: AppColors.slate100,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20),
                            side: BorderSide(
                              color: isSelected ? AppColors.brand600 : AppColors.slate200,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.slate200),

          // Tasks List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(tasksProvider);
              },
              child: tasksAsync.when(
                data: (tasks) {
                  if (tasks.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.task_alt,
                      title: 'No tasks found',
                      message: 'Try adjusting your search or filters.',
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: tasks.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final task = tasks[index];
                      return _buildTaskCard(context, task);
                    },
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
          ),
        ],
      ),
    );
  }

  Widget _buildTaskCard(BuildContext context, Task task) {
    final statusStyle = Formatters.getTaskStatusStyle(task.status);
    final priorityStyle = Formatters.getPriorityStyle(task.priority);

    return AppCard(
      onTap: () => context.push('/tasks/${task.id}'),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top Row: Code, Priority, Status
          Row(
            children: [
              Text(
                task.code,
                style: const TextStyle(
                  fontSize: 12,
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
          const SizedBox(height: 8),

          // Title
          Text(
            task.title,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.slate900,
            ),
          ),
          if (task.description != null && task.description!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              task.description!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: AppColors.slate500),
            ),
          ],
          const SizedBox(height: 10),

          // Progress Bar
          Row(
            children: [
              Expanded(child: AppProgressBar(progress: task.progress)),
              const SizedBox(width: 8),
              Text(
                '${task.progress}%',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.slate600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Footer: Due Date, Counts
          Row(
            children: [
              if (task.dueDate != null) ...[
                Icon(
                  Icons.calendar_today_outlined,
                  size: 13,
                  color: task.isOverdue ? AppColors.roseText : AppColors.slate400,
                ),
                const SizedBox(width: 4),
                Text(
                  Formatters.formatDate(task.dueDate),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: task.isOverdue ? AppColors.roseText : AppColors.slate500,
                  ),
                ),
              ],
              const Spacer(),
              if (task.counts.subtasks > 0) ...[
                const Icon(Icons.check_box_outlined, size: 13, color: AppColors.slate400),
                const SizedBox(width: 3),
                Text(
                  '${task.counts.subtasks}',
                  style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                ),
                const SizedBox(width: 10),
              ],
              if (task.counts.comments > 0) ...[
                const Icon(Icons.chat_bubble_outline, size: 13, color: AppColors.slate400),
                const SizedBox(width: 3),
                Text(
                  '${task.counts.comments}',
                  style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                ),
                const SizedBox(width: 10),
              ],
              if (task.counts.attachments > 0) ...[
                const Icon(Icons.attach_file, size: 13, color: AppColors.slate400),
                const SizedBox(width: 3),
                Text(
                  '${task.counts.attachments}',
                  style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

