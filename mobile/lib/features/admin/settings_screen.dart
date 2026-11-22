import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

final systemSettingsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/org/settings');
  return (res['data'] ?? res) as Map<String, dynamic>;
});

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _locationTracking = true;
  bool _isSaving = false;

  Future<void> _saveSettings() async {
    setState(() => _isSaving = true);
    try {
      await ApiClient().patch('/org/settings', data: {
        'locationTrackingEnabled': _locationTracking,
      });
      ref.invalidate(systemSettingsProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('System settings saved successfully!')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.roseText),
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final settingsAsync = ref.watch(systemSettingsProvider);

    return AppLayout(
      title: 'System Settings',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(systemSettingsProvider),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Organization & Policy Controls',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 4),
              const Text(
                'Configure shift timings, attendance rules, GPS tracking, and SOD/EOD schedules.',
                style: TextStyle(fontSize: 12, color: AppColors.slate500),
              ),
              const SizedBox(height: 16),

              settingsAsync.when(
                data: (settings) {
                  return Column(
                    children: [
                      // Shift & Timings Card
                      AppCard(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Work Shift Rules', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 12),
                            _buildSettingRow('Shift Hours', '${settings['workStartTime'] ?? "09:30"} - ${settings['workEndTime'] ?? "18:30"}'),
                            _buildSettingRow('Late Grace Period', '${settings['lateGraceMinutes'] ?? 15} minutes'),
                            _buildSettingRow('SOD Reminder Time', '${settings['sodReminderTime'] ?? "10:00"}'),
                            _buildSettingRow('EOD Reminder Time', '${settings['eodReminderTime'] ?? "18:00"}'),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Location & Geofence Card
                      AppCard(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('GPS & Privacy Policy', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 12),
                            SwitchListTile(
                              title: const Text('Mandatory GPS Attendance Verification', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                              subtitle: const Text('Records GPS coordinates during punch in and punch out', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                              value: _locationTracking,
                              contentPadding: EdgeInsets.zero,
                              onChanged: (val) => setState(() => _locationTracking = val),
                            ),
                            const Divider(height: 16),
                            _buildSettingRow('Precision Level', '${settings['locationPrecision'] ?? "APPROXIMATE"}'),
                            _buildSettingRow('Retention Period', '${settings['locationRetentionDays'] ?? 90} days'),
                            _buildSettingRow('Office Radius Geofence', '${settings['officeRadiusMeters'] ?? 100} meters'),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),

                      AppButton(
                        text: 'Save Changes',
                        isFullWidth: true,
                        isLoading: _isSaving,
                        onPressed: _saveSettings,
                      ),
                    ],
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

  Widget _buildSettingRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.slate500)),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate900)),
        ],
      ),
    );
  }
}

