import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/employee.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class OrgHierarchyScreen extends ConsumerWidget {
  const OrgHierarchyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hierarchyAsync = ref.watch(orgHierarchyProvider);

    return AppLayout(
      title: 'Org Hierarchy',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(orgHierarchyProvider),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Reporting Hierarchy & Structure',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 4),
              const Text(
                'Organizational reporting lines from executive leadership down to individual contributors.',
                style: TextStyle(fontSize: 12, color: AppColors.slate500),
              ),
              const SizedBox(height: 16),
              hierarchyAsync.when(
                data: (root) {
                  if (root == null) {
                    return const EmptyStateWidget(
                      icon: Icons.account_tree_outlined,
                      title: 'No hierarchy data',
                      message: 'Reporting relationships have not been configured yet.',
                    );
                  }
                  return _buildNodeCard(root);
                },
                loading: () => const Center(
                  child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator()),
                ),
                error: (err, _) => ErrorBanner(message: err.toString()),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNodeCard(OrgNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppCard(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              AppAvatar(name: node.name, size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      node.name,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                    ),
                    Text(
                      node.designation ?? node.roleName,
                      style: const TextStyle(fontSize: 11, color: AppColors.slate600),
                    ),
                  ],
                ),
              ),
              if (node.department != null)
                AppBadge(
                  label: node.department!,
                  bgColor: AppColors.brand50,
                  textColor: AppColors.brand700,
                ),
            ],
          ),
        ),
        if (node.children.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 20, top: 8, bottom: 8),
            child: Column(
              children: node.children.map((child) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _buildNodeCard(child),
              )).toList(),
            ),
          ),
      ],
    );
  }
}

