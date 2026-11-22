import '../../core/api_client.dart';
import '../../core/storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/config.dart';
import '../../core/theme.dart';
import '../../models/auth_user.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/ui_components.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  String? _selectedDemoEmail;
  bool _showServerConfig = false;
  final _serverUrlController = TextEditingController(text: AppConfig.activeApiBase);

  @override
  void initState() {
    super.initState();
    _loadSavedApiUrl();
  }

  Future<void> _loadSavedApiUrl() async {
    final savedUrl = await StorageService.getString(StorageService.keyApiUrl);
    final url = (savedUrl == null || savedUrl.trim().isEmpty)
        ? AppConfig.productionApiUrl
        : savedUrl.trim();
    ApiClient().updateBaseUrl(url);
    if (mounted) {
      setState(() {
        _serverUrlController.text = url;
      });
    }
  }

  Future<void> _saveApiUrl(String url) async {
    final normalizedUrl = url.trim().replaceAll(RegExp(r'/$'), '');
    if (!normalizedUrl.startsWith('https://') && !normalizedUrl.startsWith('http://')) {
      throw Exception('Please enter a valid HTTP or HTTPS URL.');
    }
    await StorageService.setString(StorageService.keyApiUrl, normalizedUrl);
    ApiClient().updateBaseUrl(normalizedUrl);
    if (mounted) {
      setState(() {
        _serverUrlController.text = normalizedUrl;
      });
    }
  }





  final List<DemoAccount> _demoAccounts = [
    DemoAccount(label: 'Super Admin', email: 'admin@acme.test', role: 'SUPER_ADMIN'),
    DemoAccount(label: 'HR Admin', email: 'hr@acme.test', role: 'HR_ADMIN'),
    DemoAccount(label: 'Manager', email: 'manager@acme.test', role: 'MANAGER'),
    DemoAccount(label: 'Team Lead', email: 'lead@acme.test', role: 'TEAM_LEAD'),
    DemoAccount(label: 'Employee', email: 'ananya@acme.test', role: 'EMPLOYEE'),
  ];

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _serverUrlController.dispose();
    super.dispose();
  }

  void _selectDemoAccount(DemoAccount account) {
    setState(() {
      _selectedDemoEmail = account.email;
      _emailController.text = account.email;
      _passwordController.text = 'Password@123';
    });
  }

  
Future<void> _handleLogin() async {
  final email = _emailController.text.trim();
  final password = _passwordController.text;

  if (email.isEmpty || password.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Please enter both email and password'),
      ),
    );
    return;
  }

  try {
    // Save and apply the API URL before login
    await _saveApiUrl(_serverUrlController.text);

    // Perform login
    final success = await ref
        .read(authProvider.notifier)
        .login(email, password);

    if (success && mounted) {
      context.go('/');
    }
  } catch (e) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Login configuration error: $e'),
        ),
      );
    }
  }
}


  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);

    return Scaffold(
      backgroundColor: AppColors.scaffoldBg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Logo & Heading
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.brand600,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x332563EB),
                            blurRadius: 12,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: const Icon(Icons.check_circle_outline, color: Colors.white, size: 36),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'TaskFlow',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                      color: AppColors.slate900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Sign in to your account',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, color: AppColors.slate500),
                  ),
                  const SizedBox(height: 24),

                  // Demo Accounts Selector
                  AppCard(
                    padding: const EdgeInsets.all(14),
                    backgroundColor: AppColors.slate50,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.flash_on, size: 16, color: Color(0xFFF59E0B)),
                            const SizedBox(width: 6),
                            const Text(
                              'Demo Accounts',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: AppColors.slate700,
                              ),
                            ),
                            const Spacer(),
                            const Text(
                              'Tap to autofill',
                              style: TextStyle(fontSize: 11, color: AppColors.slate400),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: _demoAccounts.map((account) {
                            final isSelected = _selectedDemoEmail == account.email;
                            return InkWell(
                              onTap: () => _selectDemoAccount(account),
                              borderRadius: BorderRadius.circular(6),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: isSelected ? AppColors.brand600 : Colors.white,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: isSelected ? AppColors.brand600 : AppColors.slate300,
                                  ),
                                ),
                                child: Text(
                                  account.label,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                                    color: isSelected ? Colors.white : AppColors.slate700,
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Main Login Form Card
                  AppCard(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (auth.errorMessage != null) ...[
                          ErrorBanner(message: auth.errorMessage!),
                          const SizedBox(height: 16),
                        ],

                        // Email Field
                        const Text(
                          'Email Address',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.slate700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            hintText: 'you@company.com',
                            prefixIcon: Icon(Icons.email_outlined, size: 20, color: AppColors.slate400),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Password Field
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Password',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.slate700,
                              ),
                            ),
                            InkWell(
                              onTap: () => context.push('/forgot-password'),
                              child: const Text(
                                'Forgot password?',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.brand600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _passwordController,
                          obscureText: _obscurePassword,
                          decoration: InputDecoration(
                            hintText: '••••••••',
                            prefixIcon: const Icon(Icons.lock_outline, size: 20, color: AppColors.slate400),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                                size: 20,
                                color: AppColors.slate400,
                              ),
                              onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),

                        // Sign In Button
                        AppButton(
                          text: 'Sign in to account',
                          isFullWidth: true,
                          isLoading: auth.isLoading,
                          onPressed: _handleLogin,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Server URL Configurator (collapsible for switching environments)
                  Center(
                    child: TextButton.icon(
                      onPressed: () => setState(() => _showServerConfig = !_showServerConfig),
                      icon: Icon(
                        _showServerConfig ? Icons.keyboard_arrow_up : Icons.settings_outlined,
                        size: 16,
                        color: AppColors.slate500,
                      ),
                      label: Text(
                        _showServerConfig ? 'Hide Server Configuration' : 'Server Configuration',
                        style: const TextStyle(fontSize: 12, color: AppColors.slate500),
                      ),
                    ),
                  ),

                  if (_showServerConfig) ...[
                    const SizedBox(height: 8),
                    AppCard(
                      padding: const EdgeInsets.all(12),
                      backgroundColor: AppColors.slate50,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'API Base URL',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.slate700,
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextField(
                            controller: _serverUrlController,
                            style: const TextStyle(fontSize: 12),
                            decoration: const InputDecoration(
                              isDense: true,
                              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              TextButton(
                               onPressed: () async {
  try {
    await _saveApiUrl(AppConfig.productionApiUrl);
  } catch (e) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }
},
                                child: const Text('Production', style: TextStyle(fontSize: 11)),
                              ),
                              const SizedBox(width: 8),
                              TextButton(
                               onPressed: () async {
  try {
    await _saveApiUrl(AppConfig.localApiUrl);
  } catch (e) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }
},
                                child: const Text('Emulator (10.0.2.2)', style: TextStyle(fontSize: 11)),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

