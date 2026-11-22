import 'package:flutter/foundation.dart';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api_client.dart';
import '../core/storage.dart';
import '../models/auth_user.dart';

class AuthState {
  final User? user;
  final List<String> permissions;
  final bool isLoading;
  final String? errorMessage;
  final bool isAuthenticated;
  final bool isPortalAdmin; // Toggle between Employee Portal and Admin Portal

  AuthState({
    this.user,
    this.permissions = const [],
    this.isLoading = false,
    this.errorMessage,
    this.isAuthenticated = false,
    this.isPortalAdmin = false,
  });

  AuthState copyWith({
    User? user,
    List<String>? permissions,
    bool? isLoading,
    String? errorMessage,
    bool? isAuthenticated,
    bool? isPortalAdmin,
  }) {
    return AuthState(
      user: user ?? this.user,
      permissions: permissions ?? this.permissions,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isPortalAdmin: isPortalAdmin ?? this.isPortalAdmin,
    );
  }

  bool can(String permission) {
    if (user?.role.key == 'SUPER_ADMIN') return true;
    return permissions.contains(permission);
  }

  bool canAny(List<String> perms) {
    if (user?.role.key == 'SUPER_ADMIN') return true;
    return perms.any((p) => permissions.contains(p));
  }

  bool get isAdminRole {
    return user?.role.portal == 'ADMIN' ||
        user?.role.key == 'SUPER_ADMIN' ||
        user?.role.key == 'HR_ADMIN' ||
        user?.role.key == 'MANAGER' ||
        user?.role.key == 'TEAM_LEAD';
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient _api = ApiClient();

  AuthNotifier() : super(AuthState(isLoading: true)) {
    checkInitialAuth();
  }

  Future<void> checkInitialAuth() async {
    state = state.copyWith(isLoading: true);
    final token = await StorageService.getAccessToken();
    if (token == null || token.isEmpty) {
      state = state.copyWith(isLoading: false, isAuthenticated: false);
      return;
    }

    try {
      final res = await _api.get('/auth/me');
      final user = User.fromJson(res['user']);
      final permissions = res['permissions'] != null
          ? List<String>.from(res['permissions'].map((e) => e.toString()))
          : <String>[];

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(StorageService.keyCachedUser, jsonEncode(user.toJson()));
      await prefs.setString(StorageService.keyCachedPermissions, jsonEncode(permissions));

      final isPortalAdmin = user.role.portal == 'ADMIN';

      state = state.copyWith(
        user: user,
        permissions: permissions,
        isAuthenticated: true,
        isLoading: false,
        isPortalAdmin: isPortalAdmin,
      );
    } catch (_) {
      // Try restoring from cache
      final prefs = await SharedPreferences.getInstance();
      final cachedUserStr = prefs.getString(StorageService.keyCachedUser);
      final cachedPermsStr = prefs.getString(StorageService.keyCachedPermissions);

      if (cachedUserStr != null && cachedPermsStr != null) {
        try {
          final user = User.fromJson(jsonDecode(cachedUserStr));
          final permissions = List<String>.from(jsonDecode(cachedPermsStr));
          state = state.copyWith(
            user: user,
            permissions: permissions,
            isAuthenticated: true,
            isLoading: false,
            isPortalAdmin: user.role.portal == 'ADMIN',
          );
          return;
        } catch (_) {}
      }

      await StorageService.clearAuth();
      state = state.copyWith(isLoading: false, isAuthenticated: false);
    }
  }

  Future<bool> login(String email, String password) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final res = await _api.post('/auth/login', data: {
        'email': email.trim().toLowerCase(),
        'password': password,
      });

     
final accessToken = res['accessToken']?.toString() ?? '';
final refreshToken = res['refreshToken']?.toString() ?? '';

// Debug: Never print the actual token
debugPrint('LOGIN RESPONSE KEYS: ${res.keys.toList()}');
debugPrint('ACCESS TOKEN RECEIVED: ${accessToken.isNotEmpty}');
debugPrint('ACCESS TOKEN LENGTH: ${accessToken.length}');

if (accessToken.isEmpty) {
  throw Exception('Access token missing in login response');
}

await StorageService.saveTokens(
  accessToken: accessToken,
  refreshToken: refreshToken,
);

final savedToken = await StorageService.getAccessToken();

debugPrint('TOKEN SAVED SUCCESSFULLY: ${savedToken != null && savedToken.isNotEmpty}');


      final user = User.fromJson(res['user']);
      final permissions = res['permissions'] != null
          ? List<String>.from(res['permissions'].map((e) => e.toString()))
          : <String>[];

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(StorageService.keyCachedUser, jsonEncode(user.toJson()));
      await prefs.setString(StorageService.keyCachedPermissions, jsonEncode(permissions));

      final isPortalAdmin = user.role.portal == 'ADMIN';

      state = state.copyWith(
        user: user,
        permissions: permissions,
        isAuthenticated: true,
        isLoading: false,
        isPortalAdmin: isPortalAdmin,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e is ApiError ? e.message : 'Invalid credentials. Please try again.',
      );
      return false;
    }
  }

  void togglePortal(bool toAdmin) {
    if (toAdmin && !state.isAdminRole) return;
    state = state.copyWith(isPortalAdmin: toAdmin);
  }

  Future<void> logout() async {
    try {
      await _api.post('/auth/logout');
    } catch (_) {}
    await StorageService.clearAuth();
    state = AuthState(isLoading: false, isAuthenticated: false);
  }

  Future<void> refreshProfile() async {
    try {
      final res = await _api.get('/auth/me');
      final user = User.fromJson(res['user']);
      final permissions = res['permissions'] != null
          ? List<String>.from(res['permissions'].map((e) => e.toString()))
          : <String>[];
      state = state.copyWith(user: user, permissions: permissions);
    } catch (_) {}
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});

