import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

final accessGrantsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/access-grants');
  if (res['data'] is List) {
    return List<Map<String, dynamic>>.from(res['data']);
  }
  return [];
});

class AccessGrantsScreen extends ConsumerWidget {
  const AccessGrantsScreen({super.key});

  Future<void> _revokeGrant(BuildContext context, WidgetRef ref, String id) async {
    try {
      await ApiClient().delete('/access-grants/$id');
      ref.invalidate(accessGrantsProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Access grant revoked')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.roseText),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final grantsAsync = ref.watch(accessGrantsProvider);

    return AppLayout(
      title: 'Access Grants',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(accessGrantsProvider),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Delegated Access Permissions',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 4),
              const Text(
                'Temporary supervisory access delegations granted between team members.',
                style: TextStyle(fontSize: 12, color: AppColors.slate500),
              ),
              const SizedBox(height: 16),

              grantsAsync.when(
                data: (grants) {
                  if (grants.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.vpn_key_outlined,
                      title: 'No active access grants',
                      message: 'Temporary user access delegations will appear here.',
                    );
                  }

                  return ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: grants.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final g = grants[index];
                      final grantee = g['grantee'] as Map<String, dynamic>? ?? {};
                      final target = g['targetUser'] as Map<String, dynamic>? ?? {};

                      return AppCard(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.vpn_key, size: 18, color: AppColors.brand600),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    '${grantee['firstName'] ?? ''} ${grantee['lastName'] ?? ''} → ${target['firstName'] ?? ''} ${target['lastName'] ?? ''}',
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 18, color: AppColors.roseText),
                                  onPressed: () => _revokeGrant(context, ref, g['id']),
                                ),
                              ],
                            ),
                            if (g['reason'] != null) ...[
                              const SizedBox(height: 4),
                              Text('Reason: ${g['reason']}', style: const TextStyle(fontSize: 12, color: AppColors.slate600)),
                            ],
                            const SizedBox(height: 4),
                            Text('Expires: ${Formatters.formatDate(g['expiresAt'])}', style: const TextStyle(fontSize: 11, color: AppColors.slate400)),
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

