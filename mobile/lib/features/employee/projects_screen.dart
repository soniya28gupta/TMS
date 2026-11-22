import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/project.dart';
import '../../providers/auth_provider.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class ProjectsScreen extends ConsumerStatefulWidget {
  const ProjectsScreen({super.key});

  @override
  ConsumerState<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends ConsumerState<ProjectsScreen> {
  String _selectedStatus = 'ALL';
  String _searchQuery = '';
  final _searchController = TextEditingController();

  final List<String> _statusFilters = [
    'ALL',
    'IN_PROGRESS',
    'PLANNING',
    'UNDER_REVIEW',
    'COMPLETED',
    'ON_HOLD',
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showCreateProjectModal() {
    final nameCtrl = TextEditingController();
    final codeCtrl = TextEditingController();
    final descCtrl = TextEditingController();
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
                    'Create New Project',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Project Name *', hintText: 'e.g. Website Redesign'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: codeCtrl,
                decoration: const InputDecoration(labelText: 'Project Code *', hintText: 'e.g. PRJ-2026-01'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: descCtrl,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Description', hintText: 'Brief summary of the project...'),
              ),
              const SizedBox(height: 16),
              AppButton(
                text: 'Create Project',
                isLoading: isSubmitting,
                onPressed: () async {
                  if (nameCtrl.text.trim().isEmpty || codeCtrl.text.trim().isEmpty) return;
                  setModalState(() => isSubmitting = true);
                  try {
                    await ApiClient().post('/projects', data: {
                      'name': nameCtrl.text.trim(),
                      'code': codeCtrl.text.trim(),
                      'description': descCtrl.text.trim(),
                    });
                    if (mounted) {
                      Navigator.pop(ctx);
                      ref.invalidate(projectsProvider);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Project created successfully!')),
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
    final projectsAsync = ref.watch(projectsProvider);
    final auth = ref.watch(authProvider);

    return AppLayout(
      title: 'Projects',
      child: Column(
        children: [
          // Filter & Search bar
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
                        decoration: InputDecoration(
                          hintText: 'Search projects...',
                          prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.slate400),
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        ),
                      ),
                    ),
                    if (auth.isAdminRole || auth.can('project.create')) ...[
                      const SizedBox(width: 8),
                      IconButton.filled(
                        icon: const Icon(Icons.add, size: 20),
                        style: IconButton.styleFrom(
                          backgroundColor: AppColors.brand600,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: _showCreateProjectModal,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _statusFilters.map((st) {
                      final isSelected = _selectedStatus == st;
                      final label = st == 'ALL' ? 'All' : st.replaceAll('_', ' ');
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(label),
                          selected: isSelected,
                          onSelected: (_) => setState(() => _selectedStatus = st),
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

          // Project List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(projectsProvider),
              child: projectsAsync.when(
                data: (projects) {
                  final filtered = projects.where((p) {
                    final matchStatus = _selectedStatus == 'ALL' || p.status == _selectedStatus;
                    final matchSearch = _searchQuery.isEmpty ||
                        p.name.toLowerCase().contains(_searchQuery) ||
                        p.code.toLowerCase().contains(_searchQuery);
                    return matchStatus && matchSearch;
                  }).toList();

                  if (filtered.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.folder_open,
                      title: 'No projects found',
                      message: 'Try adjusting your filters or search query.',
                    );
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final project = filtered[index];
                      return _buildProjectCard(context, project);
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

  Widget _buildProjectCard(BuildContext context, Project project) {
    final statusStyle = Formatters.getProjectStatusStyle(project.status);

    return AppCard(
      onTap: () => context.push('/projects/${project.id}'),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                project.code,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand600,
                ),
              ),
              const Spacer(),
              AppBadge(
                label: statusStyle.label,
                bgColor: statusStyle.bgColor,
                textColor: statusStyle.textColor,
                borderColor: statusStyle.borderColor,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            project.name,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.slate900,
            ),
          ),
          if (project.description != null && project.description!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              project.description!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: AppColors.slate500),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: AppProgressBar(progress: project.progress)),
              const SizedBox(width: 8),
              Text(
                '${project.progress}%',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.slate700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              if (project.manager != null) ...[
                AppAvatar(name: project.manager!.fullName, size: 22),
                const SizedBox(width: 6),
                Text(
                  project.manager!.fullName,
                  style: const TextStyle(fontSize: 11, color: AppColors.slate600),
                ),
              ],
              const Spacer(),
              if (project.dueDate != null) ...[
                const Icon(Icons.event_outlined, size: 13, color: AppColors.slate400),
                const SizedBox(width: 4),
                Text(
                  Formatters.formatDate(project.dueDate),
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

