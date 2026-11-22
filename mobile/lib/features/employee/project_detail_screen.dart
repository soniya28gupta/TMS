import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/project.dart';
import '../../providers/data_providers.dart';
import '../../widgets/ui_components.dart';

class ProjectDetailScreen extends ConsumerStatefulWidget {
  final String projectId;

  const ProjectDetailScreen({super.key, required this.projectId});

  @override
  ConsumerState<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends ConsumerState<ProjectDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _showAddUpdateModal(Project project) {
    final completedCtrl = TextEditingController();
    final ongoingCtrl = TextEditingController();
    final blockersCtrl = TextEditingController();
    final nextStepsCtrl = TextEditingController();
    int newProgress = project.progress;
    String updateType = 'DAILY';
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
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Post Progress Update',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    ChoiceChip(
                      label: const Text('Daily Update'),
                      selected: updateType == 'DAILY',
                      onSelected: (_) => setModalState(() => updateType = 'DAILY'),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text('Weekly Update'),
                      selected: updateType == 'WEEKLY',
                      onSelected: (_) => setModalState(() => updateType = 'WEEKLY'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'Progress: $newProgress%',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                Slider(
                  value: newProgress.toDouble(),
                  min: 0,
                  max: 100,
                  divisions: 20,
                  label: '$newProgress%',
                  activeColor: AppColors.brand600,
                  onChanged: (val) => setModalState(() => newProgress = val.round()),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: completedCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Completed Work *',
                    hintText: 'What was achieved?',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: ongoingCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Ongoing Work',
                    hintText: 'What is currently in progress?',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: blockersCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Blockers / Issues',
                    hintText: 'Any impediments?',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: nextStepsCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Next Steps',
                    hintText: 'Planned items for next cycle...',
                  ),
                ),
                const SizedBox(height: 16),
                AppButton(
                  text: 'Submit Update',
                  isLoading: isSubmitting,
                  onPressed: () async {
                    if (completedCtrl.text.trim().isEmpty) return;
                    setModalState(() => isSubmitting = true);
                    try {
                      await ApiClient().post('/projects/${widget.projectId}/updates', data: {
                        'updateType': updateType,
                        'newProgress': newProgress,
                        'completedWork': completedCtrl.text.trim(),
                        'ongoingWork': ongoingCtrl.text.trim(),
                        'blockers': blockersCtrl.text.trim(),
                        'nextSteps': nextStepsCtrl.text.trim(),
                      });
                      if (mounted) {
                        Navigator.pop(ctx);
                        ref.invalidate(projectDetailProvider(widget.projectId));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Progress update posted!')),
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
      ),
    );
  }

  void _showFinalSubmissionModal() {
    final summaryCtrl = TextEditingController();
    final deliverablesCtrl = TextEditingController();
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
                    'Submit Project for Approval',
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
                controller: summaryCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Executive Summary *',
                  hintText: 'Summary of project completion...',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: deliverablesCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Key Deliverables *',
                  hintText: 'List deliverables achieved...',
                ),
              ),
              const SizedBox(height: 16),
              AppButton(
                text: 'Submit for Management Review',
                isLoading: isSubmitting,
                onPressed: () async {
                  if (summaryCtrl.text.trim().isEmpty || deliverablesCtrl.text.trim().isEmpty) return;
                  setModalState(() => isSubmitting = true);
                  try {
                    await ApiClient().post('/projects/${widget.projectId}/submissions', data: {
                      'finalSummary': summaryCtrl.text.trim(),
                      'completedDeliverables': deliverablesCtrl.text.trim(),
                      'finalProgress': 100,
                    });
                    if (mounted) {
                      Navigator.pop(ctx);
                      ref.invalidate(projectDetailProvider(widget.projectId));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Project submitted for review!')),
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
    final projectAsync = ref.watch(projectDetailProvider(widget.projectId));

    return Scaffold(
      backgroundColor: AppColors.scaffoldBg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('Project Details'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          labelColor: AppColors.brand600,
          unselectedLabelColor: AppColors.slate500,
          indicatorColor: AppColors.brand600,
          tabs: const [
            Tab(text: 'Overview'),
            Tab(text: 'Updates'),
            Tab(text: 'History'),
            Tab(text: 'Files'),
            Tab(text: 'Submission & Review'),
          ],
        ),
      ),
      body: projectAsync.when(
        data: (project) {
          return TabBarView(
            controller: _tabController,
            children: [
              // 1. Overview Tab
              _buildOverviewTab(project),
              // 2. Updates Tab
              _buildUpdatesTab(project),
              // 3. History Tab
              _buildHistoryTab(project),
              // 4. Files Tab
              _buildFilesTab(project),
              // 5. Submission & Review Tab
              _buildSubmissionTab(project),
            ],
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

  Widget _buildOverviewTab(Project project) {
    final statusStyle = Formatters.getProjectStatusStyle(project.status);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      project.code,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.brand600),
                    ),
                    const Spacer(),
                    AppBadge(
                      label: statusStyle.label,
                      bgColor: statusStyle.bgColor,
                      textColor: statusStyle.textColor,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  project.name,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.slate900),
                ),
                if (project.description != null && project.description!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    project.description!,
                    style: const TextStyle(fontSize: 13, color: AppColors.slate600, height: 1.4),
                  ),
                ],
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(child: AppProgressBar(progress: project.progress, height: 8)),
                    const SizedBox(width: 10),
                    Text(
                      '${project.progress}%',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate700),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Team Members
          AppCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Team Members',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                ),
                const SizedBox(height: 10),
                if (project.members.isEmpty)
                  const Text('No members assigned yet.', style: TextStyle(fontSize: 12, color: AppColors.slate500))
                else
                  ...project.members.map((m) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            AppAvatar(name: m.user.fullName, size: 28),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                m.user.fullName,
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                              ),
                            ),
                            AppBadge(
                              label: m.role,
                              bgColor: m.role == 'LEAD' ? AppColors.indigoBg : AppColors.slate100,
                              textColor: m.role == 'LEAD' ? AppColors.indigoText : AppColors.slate600,
                            ),
                          ],
                        ),
                      )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUpdatesTab(Project project) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Progress Updates',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              AppButton(
                text: '+ Add Update',
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                onPressed: () => _showAddUpdateModal(project),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (project.progressUpdates.isEmpty)
            const EmptyStateWidget(
              icon: Icons.update,
              title: 'No progress updates',
              message: 'Be the first to log progress on this project!',
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: project.progressUpdates.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final u = project.progressUpdates[index];
                return AppCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          AppBadge(
                            label: u.updateType,
                            bgColor: AppColors.brand50,
                            textColor: AppColors.brand700,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '${u.previousProgress}% → ${u.newProgress}%',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.emeraldText),
                          ),
                          const Spacer(),
                          Text(
                            Formatters.relativeTime(u.createdAt),
                            style: const TextStyle(fontSize: 11, color: AppColors.slate400),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Completed: ${u.completedWork}',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate800),
                      ),
                      if (u.ongoingWork.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text('Ongoing: ${u.ongoingWork}', style: const TextStyle(fontSize: 12, color: AppColors.slate600)),
                      ],
                      if (u.blockers != null && u.blockers!.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text('Blockers: ${u.blockers}', style: const TextStyle(fontSize: 12, color: AppColors.roseText)),
                      ],
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _buildHistoryTab(Project project) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: EmptyStateWidget(
          icon: Icons.history,
          title: 'Project History',
          message: 'All automated milestones and progress updates are logged here.',
        ),
      ),
    );
  }

  Widget _buildFilesTab(Project project) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Project Files & Deliverables',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
          ),
          const SizedBox(height: 12),
          if (project.attachments.isEmpty)
            const EmptyStateWidget(
              icon: Icons.folder_zip_outlined,
              title: 'No files attached',
              message: 'Attachments submitted with progress updates appear here.',
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: project.attachments.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final file = project.attachments[index];
                return AppCard(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      const Icon(Icons.insert_drive_file_outlined, color: AppColors.brand600, size: 24),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(file.originalName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                            Text(Formatters.formatBytes(file.fileSize), style: const TextStyle(fontSize: 11, color: AppColors.slate400)),
                          ],
                        ),
                      ),
                      const Icon(Icons.download_outlined, color: AppColors.slate500, size: 20),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _buildSubmissionTab(Project project) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Submission & Review',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              if (project.submissions.isEmpty || project.submissions.last.status == 'CHANGES_REQUESTED')
                AppButton(
                  text: 'Submit Project',
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  onPressed: _showFinalSubmissionModal,
                ),
            ],
          ),
          const SizedBox(height: 14),
          if (project.submissions.isEmpty)
            const EmptyStateWidget(
              icon: Icons.assignment_turned_in_outlined,
              title: 'Not Submitted Yet',
              message: 'When project deliverables are ready, submit the final summary for management review.',
            )
          else
            ...project.submissions.map((sub) {
              final isApproved = sub.status == 'APPROVED';
              final isPending = sub.status == 'PENDING';

              return AppCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        AppBadge(
                          label: sub.status,
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
                        const Spacer(),
                        Text(
                          Formatters.formatDate(sub.submittedAt),
                          style: const TextStyle(fontSize: 11, color: AppColors.slate400),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    const Text('Executive Summary', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate600)),
                    const SizedBox(height: 4),
                    Text(sub.finalSummary, style: const TextStyle(fontSize: 13, color: AppColors.slate800)),
                    const SizedBox(height: 10),
                    const Text('Key Deliverables', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate600)),
                    const SizedBox(height: 4),
                    Text(sub.completedDeliverables, style: const TextStyle(fontSize: 13, color: AppColors.slate800)),
                    if (sub.managementComments != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.slate50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.slate200),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Management Comments', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate700)),
                            const SizedBox(height: 2),
                            Text(sub.managementComments!, style: const TextStyle(fontSize: 12, color: AppColors.slate800)),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}
