import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class EodScreen extends ConsumerStatefulWidget {
  const EodScreen({super.key});

  @override
  ConsumerState<EodScreen> createState() => _EodScreenState();
}

class _EodScreenState extends ConsumerState<EodScreen> {
  final _summaryController = TextEditingController();
  final _hoursController = TextEditingController(text: '8.0');
  final _blockersController = TextEditingController();
  final _nextDayController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _summaryController.dispose();
    _hoursController.dispose();
    _blockersController.dispose();
    _nextDayController.dispose();
    super.dispose();
  }

  Future<void> _submitEod() async {
    final summary = _summaryController.text.trim();
    if (summary.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a work summary')),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      await ApiClient().post('/eod/submit', data: {
        'workSummary': summary,
        'totalHours': double.tryParse(_hoursController.text.trim()) ?? 8.0,
        'blockers': _blockersController.text.trim(),
        'nextDayPlan': _nextDayController.text.trim(),
      });
      ref.invalidate(todayEodProvider);
      ref.invalidate(employeeDashboardProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('EOD report submitted successfully!')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.roseText),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final eodAsync = ref.watch(todayEodProvider);

    return AppLayout(
      title: 'End of Day (EOD)',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(todayEodProvider),
        child: eodAsync.when(
          data: (eod) {
            final isSubmitted = eod?.status == 'SUBMITTED' || eod?.status == 'REVIEWED';

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  AppCard(
                    padding: const EdgeInsets.all(16),
                    backgroundColor: const Color(0xFFEEF2FF),
                    border: const BorderSide(color: Color(0xFFC7D2FE)),
                    child: Row(
                      children: [
                        const Icon(Icons.nights_stay_outlined, size: 28, color: Color(0xFF4338CA)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Daily Work Report',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.slate900,
                                ),
                              ),
                              Text(
                                isSubmitted
                                    ? 'Submitted at ${Formatters.formatTime(eod?.submittedAt)}'
                                    : 'Summarize work completed today before signing off',
                                style: const TextStyle(fontSize: 12, color: AppColors.slate600),
                              ),
                            ],
                          ),
                        ),
                        AppBadge(
                          label: eod?.status ?? 'PENDING',
                          bgColor: isSubmitted ? AppColors.emeraldBg : AppColors.amberBg,
                          textColor: isSubmitted ? AppColors.emeraldText : AppColors.amberText,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  if (isSubmitted && eod != null) ...[
                    // Review notes if present
                    if (eod.reviewNotes != null && eod.reviewNotes!.isNotEmpty) ...[
                      AppCard(
                        padding: const EdgeInsets.all(14),
                        backgroundColor: AppColors.brand50,
                        border: const BorderSide(color: AppColors.brand200),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Manager Review Notes',
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.brand700)),
                            const SizedBox(height: 4),
                            Text(eod.reviewNotes!, style: const TextStyle(fontSize: 13, color: AppColors.slate800)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                    ],

                    AppCard(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildDetailRow('Total Hours Logged', '${eod.totalHours ?? 0} hrs'),
                          const Divider(height: 16),
                          const Text('Work Summary', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate600)),
                          const SizedBox(height: 4),
                          Text(eod.workSummary ?? 'No summary provided', style: const TextStyle(fontSize: 13, color: AppColors.slate800)),
                          if (eod.blockers != null && eod.blockers!.isNotEmpty) ...[
                            const Divider(height: 16),
                            const Text('Blockers & Challenges', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.roseText)),
                            const SizedBox(height: 4),
                            Text(eod.blockers!, style: const TextStyle(fontSize: 13, color: AppColors.slate800)),
                          ],
                          if (eod.nextDayPlan != null && eod.nextDayPlan!.isNotEmpty) ...[
                            const Divider(height: 16),
                            const Text('Plan for Tomorrow', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate600)),
                            const SizedBox(height: 4),
                            Text(eod.nextDayPlan!, style: const TextStyle(fontSize: 13, color: AppColors.slate800)),
                          ],
                        ],
                      ),
                    ),
                  ] else ...[
                    // EOD Submission Form
                    AppCard(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextField(
                            controller: _hoursController,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Total Hours Worked *',
                              hintText: 'e.g. 8.0',
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _summaryController,
                            maxLines: 4,
                            decoration: const InputDecoration(
                              labelText: 'Summary of Work Completed *',
                              hintText: 'Describe key achievements, tasks progressed, PRs submitted...',
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _blockersController,
                            maxLines: 2,
                            decoration: const InputDecoration(
                              labelText: 'Blockers / Impediments (Optional)',
                              hintText: 'Any dependencies or roadblocks faced?',
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _nextDayController,
                            maxLines: 2,
                            decoration: const InputDecoration(
                              labelText: 'Plan for Next Day',
                              hintText: 'What do you plan to tackle next?',
                            ),
                          ),
                          const SizedBox(height: 20),
                          AppButton(
                            text: 'Submit End of Day (EOD)',
                            isLoading: _isSubmitting,
                            onPressed: _submitEod,
                          ),
                        ],
                      ),
                    ),
                  ],
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
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.slate500)),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900)),
      ],
    );
  }
}
