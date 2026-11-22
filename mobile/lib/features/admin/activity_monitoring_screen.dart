import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

final sessionsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/sessions/active');
  if (res['data'] is List) {
    return List<Map<String, dynamic>>.from(res['data']);
  }
  return [];
});

class ActivityMonitoringScreen extends ConsumerWidget {
  const ActivityMonitoringScreen({super.key});

  Future<void> _endSession(BuildContext context, WidgetRef ref, String id) async {
    try {
      await ApiClient().post('/sessions/$id/end');
      ref.invalidate(sessionsProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Session terminated')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.roseText),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(sessionsProvider);

    return AppLayout(
      title: 'Activity Monitoring',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(sessionsProvider),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Live Employee Sessions & Devices',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 4),
              const Text(
                'Real-time view of active sessions, devices, IP addresses and GPS location status.',
                style: TextStyle(fontSize: 12, color: AppColors.slate500),
              ),
              const SizedBox(height: 16),
              sessionsAsync.when(
                data: (sessions) {
                  if (sessions.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.shield_outlined,
                      title: 'No active sessions',
                      message: 'No employees are actively connected.',
                    );
                  }

                  return ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: sessions.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final s = sessions[index];
                      final user = s['user'] as Map<String, dynamic>? ?? {};
                      final fullName = "${user['firstName'] ?? ''} ${user['lastName'] ?? ''}".trim();
                      final isIdle = s['isIdle'] == true;
                      final hasLocation = s['loginLatitude'] != null && s['loginLongitude'] != null;

                      return AppCard(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                AppAvatar(name: fullName.isNotEmpty ? fullName : 'User', size: 36),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        fullName.isNotEmpty ? fullName : 'Active User',
                                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                      ),
                                      Text(
                                        '${s['device'] ?? 'Desktop'} • ${s['browser'] ?? 'Browser'}',
                                        style: const TextStyle(fontSize: 12, color: AppColors.slate500),
                                      ),
                                    ],
                                  ),
                                ),
                                AppBadge(
                                  label: isIdle ? 'IDLE' : 'ACTIVE',
                                  bgColor: isIdle ? AppColors.amberBg : AppColors.emeraldBg,
                                  textColor: isIdle ? AppColors.amberText : AppColors.emeraldText,
                                ),
                              ],
                            ),
                            const Divider(height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'IP: ${s['ip'] ?? '—'}',
                                  style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                                ),
                                Row(
                                  children: [
                                    Icon(
                                      hasLocation ? Icons.location_on : Icons.location_off,
                                      size: 12,
                                      color: hasLocation ? AppColors.emeraldText : AppColors.slate400,
                                    ),
                                    const SizedBox(width: 2),
                                    Text(
                                      hasLocation
                                          ? 'GPS: ${s['loginLatitude']}, ${s['loginLongitude']}'
                                          : 'GPS Unavailable',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w500,
                                        color: hasLocation ? AppColors.emeraldText : AppColors.slate400,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton(
                                onPressed: () => _endSession(context, ref, s['id']),
                                style: TextButton.styleFrom(
                                  foregroundColor: AppColors.roseText,
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                ),
                                child: const Text('End Session', style: TextStyle(fontSize: 12)),
                              ),
                            ),
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
