import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/app_layout.dart';
import '../../widgets/ui_components.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _currentPasswordCtrl = TextEditingController();
  final _newPasswordCtrl = TextEditingController();
  final _confirmPasswordCtrl = TextEditingController();
  bool _isPasswordChanging = false;
  String? _passwordError;
  String? _passwordSuccess;

  @override
  void dispose() {
    _currentPasswordCtrl.dispose();
    _newPasswordCtrl.dispose();
    _confirmPasswordCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleChangePassword() async {
    final current = _currentPasswordCtrl.text;
    final newPass = _newPasswordCtrl.text;
    final confirm = _confirmPasswordCtrl.text;

    if (current.isEmpty || newPass.isEmpty || confirm.isEmpty) {
      setState(() => _passwordError = 'All password fields are required');
      return;
    }
    if (newPass.length < 8) {
      setState(() => _passwordError = 'New password must be at least 8 characters');
      return;
    }
    if (newPass != confirm) {
      setState(() => _passwordError = 'Passwords do not match');
      return;
    }

    setState(() {
      _isPasswordChanging = true;
      _passwordError = null;
      _passwordSuccess = null;
    });

    try {
      await ApiClient().post('/auth/change-password', data: {
        'currentPassword': current,
        'newPassword': newPass,
      });
      setState(() {
        _isPasswordChanging = false;
        _passwordSuccess = 'Password changed successfully!';
      });
      _currentPasswordCtrl.clear();
      _newPasswordCtrl.clear();
      _confirmPasswordCtrl.clear();
    } catch (e) {
      setState(() {
        _isPasswordChanging = false;
        _passwordError = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final user = auth.user;

    return AppLayout(
      title: 'Profile & Settings',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // User Header Card
            AppCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  AppAvatar(name: user?.fullName ?? 'User', size: 64),
                  const SizedBox(height: 12),
                  Text(
                    user?.fullName ?? 'User',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.slate900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    user?.designation ?? user?.role.name ?? 'Employee',
                    style: const TextStyle(fontSize: 13, color: AppColors.slate600),
                  ),
                  const SizedBox(height: 8),
                  AppBadge(
                    label: user?.role.name ?? 'Employee',
                    bgColor: AppColors.brand50,
                    textColor: AppColors.brand700,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Employee Details Card
            AppCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Employment Details',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                  ),
                  const SizedBox(height: 12),
                  _buildProfileRow('Employee ID', user?.employeeCode ?? '—'),
                  _buildProfileRow('Email', user?.email ?? '—'),
                  _buildProfileRow('Phone', user?.phone ?? '—'),
                  _buildProfileRow('Department', user?.department?.name ?? '—'),
                  _buildProfileRow('Reporting Manager', user?.manager != null ? '${user?.manager?.firstName ?? ''} ${user?.manager?.lastName ?? ''}'.trim() : 'None'),
                  _buildProfileRow('Shift Hours', '${user?.shiftStart ?? "09:30"} - ${user?.shiftEnd ?? "18:30"}'),
                  _buildProfileRow('Work Mode', user?.workMode ?? 'ONSITE'),
                  _buildProfileRow('Joining Date', Formatters.formatDate(user?.dateOfJoining)),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Change Password Card
            AppCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Change Password',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                  ),
                  const SizedBox(height: 12),
                  if (_passwordError != null) ...[
                    ErrorBanner(message: _passwordError!),
                    const SizedBox(height: 12),
                  ],
                  if (_passwordSuccess != null) ...[
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.emeraldBg,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _passwordSuccess!,
                        style: const TextStyle(fontSize: 12, color: AppColors.emeraldText, fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextField(
                    controller: _currentPasswordCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Current Password'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _newPasswordCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'New Password (min 8 chars)'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _confirmPasswordCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Confirm New Password'),
                  ),
                  const SizedBox(height: 16),
                  AppButton(
                    text: 'Update Password',
                    isLoading: _isPasswordChanging,
                    onPressed: _handleChangePassword,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Logout Button
            AppButton(
              text: 'Sign Out',
              variant: AppButtonVariant.secondary,
              icon: Icons.logout,
              onPressed: () async {
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.slate500)),
          Text(
            value,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate900),
          ),
        ],
      ),
    );
  }
}
