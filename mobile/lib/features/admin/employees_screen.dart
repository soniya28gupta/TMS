import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../providers/data_providers.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class EmployeesScreen extends ConsumerStatefulWidget {
  const EmployeesScreen({super.key});

  @override
  ConsumerState<EmployeesScreen> createState() => _EmployeesScreenState();
}

class _EmployeesScreenState extends ConsumerState<EmployeesScreen> {
  String _searchQuery = '';
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showAddEmployeeModal() {
    final firstCtrl = TextEditingController();
    final lastCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final desigCtrl = TextEditingController();
    final codeCtrl = TextEditingController();
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
                    const Text('Add New Employee', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => Navigator.pop(ctx)),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(controller: firstCtrl, decoration: const InputDecoration(labelText: 'First Name *')),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(controller: lastCtrl, decoration: const InputDecoration(labelText: 'Last Name *')),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Company Email *', hintText: 'user@company.com'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: codeCtrl,
                  decoration: const InputDecoration(labelText: 'Employee Code *', hintText: 'EMP001'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: desigCtrl,
                  decoration: const InputDecoration(labelText: 'Designation', hintText: 'Software Engineer'),
                ),
                const SizedBox(height: 16),
                AppButton(
                  text: 'Create Employee',
                  isLoading: isSubmitting,
                  onPressed: () async {
                    if (firstCtrl.text.trim().isEmpty || lastCtrl.text.trim().isEmpty || emailCtrl.text.trim().isEmpty) return;
                    setModalState(() => isSubmitting = true);
                    try {
                      await ApiClient().post('/employees', data: {
                        'firstName': firstCtrl.text.trim(),
                        'lastName': lastCtrl.text.trim(),
                        'email': emailCtrl.text.trim().toLowerCase(),
                        'employeeCode': codeCtrl.text.trim(),
                        'designation': desigCtrl.text.trim(),
                        'password': 'Password@123',
                      });
                      if (mounted) {
                        Navigator.pop(ctx);
                        ref.invalidate(employeesProvider);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Employee registered successfully!')),
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

  @override
  Widget build(BuildContext context) {
    final employeesAsync = ref.watch(employeesProvider);

    return AppLayout(
      title: 'Employees Directory',
      child: Column(
        children: [
          // Search & Action Header
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
                    decoration: InputDecoration(
                      hintText: 'Search by name, code, email...',
                      prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.slate400),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  icon: const Icon(Icons.person_add_outlined, size: 20),
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.brand600,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: _showAddEmployeeModal,
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.slate200),

          // Employees Directory List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(employeesProvider),
              child: employeesAsync.when(
                data: (employees) {
                  final filtered = employees.where((e) {
                    return _searchQuery.isEmpty ||
                        e.fullName.toLowerCase().contains(_searchQuery) ||
                        e.employeeCode.toLowerCase().contains(_searchQuery) ||
                        e.email.toLowerCase().contains(_searchQuery);
                  }).toList();

                  if (filtered.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.people_outline,
                      title: 'No employees found',
                      message: 'Try adjusting your search criteria.',
                    );
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final emp = filtered[index];
                      return AppCard(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            AppAvatar(name: emp.fullName, size: 40),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        emp.fullName,
                                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        '(${emp.employeeCode})',
                                        style: const TextStyle(fontSize: 11, color: AppColors.slate400),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    emp.positionTitle ?? emp.roleName,
                                    style: const TextStyle(fontSize: 12, color: AppColors.slate600),
                                  ),
                                  if (emp.departmentName != null) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      emp.departmentName!,
                                      style: const TextStyle(fontSize: 11, color: AppColors.brand600, fontWeight: FontWeight.w500),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            AppBadge(
                              label: emp.workMode,
                              bgColor: emp.workMode == 'ONSITE' ? AppColors.brand50 : AppColors.purpleBg,
                              textColor: emp.workMode == 'ONSITE' ? AppColors.brand700 : AppColors.purpleText,
                            ),
                          ],
                        ),
                      );
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
}
