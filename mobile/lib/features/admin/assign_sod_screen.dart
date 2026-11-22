import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class AssignSodScreen extends ConsumerStatefulWidget {
  const AssignSodScreen({super.key});

  @override
  ConsumerState<AssignSodScreen> createState() => _AssignSodScreenState();
}

class _AssignSodScreenState extends ConsumerState<AssignSodScreen> {
  final _titleCtrl = TextEditingController();
  final _instructionsCtrl = TextEditingController();
  final _hoursCtrl = TextEditingController(text: '2.0');
  String? _selectedEmployeeId;
  bool _isSubmitting = false;

  Future<void> _handleAssign() async {
    if (_titleCtrl.text.trim().isEmpty || _selectedEmployeeId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select an employee and enter a duty title')),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      await ApiClient().post('/sod/assign', data: {
        'userId': _selectedEmployeeId,
        'title': _titleCtrl.text.trim(),
        'instructions': _instructionsCtrl.text.trim(),
        'plannedHours': double.tryParse(_hoursCtrl.text.trim()) ?? 2.0,
        'date': Formatters.todayISO(),
      });
      _titleCtrl.clear();
      _instructionsCtrl.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Duty pre-assigned to employee SOD plan!')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to assign: $e'), backgroundColor: AppColors.roseText),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final employeesAsync = ref.watch(employeesProvider);

    return AppLayout(
      title: 'Assign SOD Duties',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Pre-Assign Morning Duties',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
            ),
            const SizedBox(height: 4),
            const Text(
              'Assigned items appear directly on the employee’s SOD plan for them to acknowledge and execute.',
              style: TextStyle(fontSize: 12, color: AppColors.slate500),
            ),
            const SizedBox(height: 16),

            AppCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  employeesAsync.when(
                    data: (employees) => DropdownButtonFormField<String>(
                      value: _selectedEmployeeId,
                      decoration: const InputDecoration(labelText: 'Select Employee *'),
                      items: employees.map((e) {
                        return DropdownMenuItem(value: e.id, child: Text('${e.fullName} (${e.employeeCode})'));
                      }).toList(),
                      onChanged: (val) => setState(() => _selectedEmployeeId = val),
                    ),
                    loading: () => const LinearProgressIndicator(),
                    error: (_, __) => const Text('Failed to load employees'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _titleCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Duty / Task Title *',
                      hintText: 'e.g. Audit server logs and prepare vulnerability report',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _hoursCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Estimated Hours', hintText: '2.0'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _instructionsCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Instructions / Acceptance Criteria',
                      hintText: 'Specific deliverables or links to follow...',
                    ),
                  ),
                  const SizedBox(height: 18),
                  AppButton(
                    text: 'Assign Duty to Employee',
                    isLoading: _isSubmitting,
                    onPressed: _handleAssign,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
