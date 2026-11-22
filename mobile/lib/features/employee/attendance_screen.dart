import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  bool _isActionBusy = false;
  String? _gpsStatusMessage;

  Future<Position?> _determinePosition() async {
    bool serviceEnabled;
    LocationPermission permission;

    try {
      serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() => _gpsStatusMessage = 'Location services are disabled.');
        return null;
      }

      permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          setState(() => _gpsStatusMessage = 'Location permissions are denied.');
          return null;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() => _gpsStatusMessage = 'Location permissions permanently denied.');
        return null;
      }

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );
      setState(() => _gpsStatusMessage = 'GPS Captured (${pos.latitude.toStringAsFixed(4)}, ${pos.longitude.toStringAsFixed(4)})');
      return pos;
    } catch (e) {
      setState(() => _gpsStatusMessage = 'GPS capture error: $e');
      return null;
    }
  }

  Future<void> _handleCheckIn() async {
    setState(() => _isActionBusy = true);
    final pos = await _determinePosition();

    final payload = <String, dynamic>{
      'workMode': 'ONSITE',
    };
    if (pos != null) {
      payload['latitude'] = pos.latitude;
      payload['longitude'] = pos.longitude;
      payload['accuracy'] = pos.accuracy;
    }

    try {
      await ApiClient().post('/attendance/check-in', data: payload);
      ref.invalidate(todayAttendanceProvider);
      ref.invalidate(attendanceHistoryProvider);
      ref.invalidate(employeeDashboardProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(pos != null ? 'Checked in with GPS coordinates!' : 'Checked in (GPS unavailable).'),
          backgroundColor: AppColors.emeraldText,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Check-in failed: $e'), backgroundColor: AppColors.roseText),
      );
    } finally {
      if (mounted) setState(() => _isActionBusy = false);
    }
  }

  Future<void> _handleCheckOut() async {
    setState(() => _isActionBusy = true);
    final pos = await _determinePosition();

    final payload = <String, dynamic>{};
    if (pos != null) {
      payload['latitude'] = pos.latitude;
      payload['longitude'] = pos.longitude;
      payload['accuracy'] = pos.accuracy;
    }

    try {
      await ApiClient().post('/attendance/check-out', data: payload);
      ref.invalidate(todayAttendanceProvider);
      ref.invalidate(attendanceHistoryProvider);
      ref.invalidate(employeeDashboardProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(pos != null ? 'Checked out with GPS coordinates!' : 'Checked out (GPS unavailable).'),
          backgroundColor: AppColors.emeraldText,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Check-out failed: $e'), backgroundColor: AppColors.roseText),
      );
    } finally {
      if (mounted) setState(() => _isActionBusy = false);
    }
  }

  void _showCorrectionModal() {
    final dateCtrl = TextEditingController(text: Formatters.todayISO());
    final inTimeCtrl = TextEditingController(text: '09:30');
    final outTimeCtrl = TextEditingController(text: '18:30');
    final reasonCtrl = TextEditingController();
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
                    'Request Attendance Correction',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                  ),
                  IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => Navigator.pop(ctx)),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: dateCtrl,
                decoration: const InputDecoration(labelText: 'Date (YYYY-MM-DD)'),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: inTimeCtrl,
                      decoration: const InputDecoration(labelText: 'Check-In Time'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: outTimeCtrl,
                      decoration: const InputDecoration(labelText: 'Check-Out Time'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: reasonCtrl,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Reason for correction *'),
              ),
              const SizedBox(height: 16),
              AppButton(
                text: 'Submit Request',
                isLoading: isSubmitting,
                onPressed: () async {
                  if (reasonCtrl.text.trim().isEmpty) return;
                  setModalState(() => isSubmitting = true);
                  try {
                    await ApiClient().post('/attendance/corrections', data: {
                      'date': dateCtrl.text.trim(),
                      'checkInTime': inTimeCtrl.text.trim(),
                      'checkOutTime': outTimeCtrl.text.trim(),
                      'reason': reasonCtrl.text.trim(),
                    });
                    if (mounted) {
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Correction request submitted!')),
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
    final todayAsync = ref.watch(todayAttendanceProvider);
    final historyAsync = ref.watch(attendanceHistoryProvider);

    return AppLayout(
      title: 'Attendance',
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(todayAttendanceProvider);
          ref.invalidate(attendanceHistoryProvider);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Today's summary card
              todayAsync.when(
                data: (today) {
                  final record = today.data;
                  final isCheckedIn = record?.checkInAt != null && record?.checkOutAt == null;
                  final isCompleted = record?.checkInAt != null && record?.checkOutAt != null;

                  return AppCard(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              "Today's Shift",
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: AppColors.slate900,
                              ),
                            ),
                            AppBadge(
                              label: record?.status ?? 'NOT_MARKED',
                              bgColor: isCheckedIn ? AppColors.emeraldBg : AppColors.slate100,
                              textColor: isCheckedIn ? AppColors.emeraldText : AppColors.slate700,
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),

                        // Check-in & Check-out times row
                        Row(
                          children: [
                            Expanded(
                              child: _buildTimeBox(
                                label: 'Check-In',
                                time: Formatters.formatTime(record?.checkInAt),
                                hasGps: record?.hasCheckInGps ?? false,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _buildTimeBox(
                                label: 'Check-Out',
                                time: Formatters.formatTime(record?.checkOutAt),
                                hasGps: record?.hasCheckOutGps ?? false,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),

                        // Worked duration calculation
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Worked Duration',
                              style: TextStyle(fontSize: 12, color: AppColors.slate500, fontWeight: FontWeight.w600),
                            ),
                            Text(
                              '${((record?.workedMinutes ?? 0) / 60).toStringAsFixed(2)} hrs',
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.brand700),
                            ),
                          ],
                        ),
                        if (_gpsStatusMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            _gpsStatusMessage!,
                            style: const TextStyle(fontSize: 11, color: AppColors.slate400),
                          ),
                        ],
                        const SizedBox(height: 16),

                        // Action Buttons: Check In / Check Out / Request Correction
                        Row(
                          children: [
                            if (!isCheckedIn && !isCompleted)
                              Expanded(
                                child: AppButton(
                                  text: 'Check In',
                                  icon: Icons.login,
                                  isLoading: _isActionBusy,
                                  onPressed: _handleCheckIn,
                                ),
                              ),
                            if (isCheckedIn)
                              Expanded(
                                child: AppButton(
                                  text: 'Check Out',
                                  variant: AppButtonVariant.danger,
                                  icon: Icons.logout,
                                  isLoading: _isActionBusy,
                                  onPressed: _handleCheckOut,
                                ),
                              ),
                            if (isCompleted)
                              Expanded(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: AppColors.emeraldBg,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Text(
                                    'Shift Completed for Today',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.emeraldText,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ),
                            const SizedBox(width: 8),
                            IconButton.outlined(
                              icon: const Icon(Icons.edit_calendar_outlined, size: 20),
                              tooltip: 'Request Correction',
                              onPressed: _showCorrectionModal,
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => ErrorBanner(message: err.toString()),
              ),
              const SizedBox(height: 20),

              // Attendance History Section
              const Text(
                'Attendance History',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 10),

              historyAsync.when(
                data: (history) {
                  if (history.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.history,
                      title: 'No attendance records',
                      message: 'Your historical check-ins will appear here.',
                    );
                  }
                  return ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: history.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final item = history[index];
                      final statusStyle = Formatters.getAttendanceStyle(item.status);

                      return AppCard(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  Formatters.formatDate(item.date),
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'In: ${Formatters.formatTime(item.checkInAt)}  •  Out: ${Formatters.formatTime(item.checkOutAt)}',
                                  style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                                ),
                              ],
                            ),
                            const Spacer(),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                AppBadge(
                                  label: statusStyle.label,
                                  bgColor: statusStyle.bgColor,
                                  textColor: statusStyle.textColor,
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Icon(
                                      (item.hasCheckInGps || item.hasCheckOutGps)
                                          ? Icons.location_on
                                          : Icons.location_off,
                                      size: 11,
                                      color: (item.hasCheckInGps || item.hasCheckOutGps)
                                          ? AppColors.emeraldText
                                          : AppColors.slate400,
                                    ),
                                    const SizedBox(width: 2),
                                    Text(
                                      (item.hasCheckInGps || item.hasCheckOutGps)
                                          ? 'GPS Captured'
                                          : 'GPS Unavailable',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w500,
                                        color: (item.hasCheckInGps || item.hasCheckOutGps)
                                            ? AppColors.emeraldText
                                            : AppColors.slate400,
                                      ),
                                    ),
                                  ],
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
                error: (err, _) => ErrorBanner(message: err.toString()),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTimeBox({required String label, required String time, required bool hasGps}) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.slate50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.slate200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(fontSize: 11, color: AppColors.slate500, fontWeight: FontWeight.w600)),
              Icon(
                hasGps ? Icons.location_on : Icons.location_off,
                size: 13,
                color: hasGps ? AppColors.emeraldText : AppColors.slate400,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(time, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.slate900)),
        ],
      ),
    );
  }
}
