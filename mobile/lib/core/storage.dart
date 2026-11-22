import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  static const _secureStorage = FlutterSecureStorage();
  
  static const String keyAccessToken = 'tms.accessToken';
  static const String keyRefreshToken = 'tms.refreshToken';
  static const String keyCachedUser = 'tms.cachedUser';
  static const String keyCachedPermissions = 'tms.cachedPermissions';
  static const String keyDemoUser = 'tms.demoUser';
  static const String keyApiUrl = 'tms.customApiUrl';

  static Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _secureStorage.write(key: keyAccessToken, value: accessToken);
    await _secureStorage.write(key: keyRefreshToken, value: refreshToken);
  }

  static Future<String?> getAccessToken() async {
    return await _secureStorage.read(key: keyAccessToken);
  }

  static Future<String?> getRefreshToken() async {
    return await _secureStorage.read(key: keyRefreshToken);
  }

  static Future<void> clearAuth() async {
    await _secureStorage.delete(key: keyAccessToken);
    await _secureStorage.delete(key: keyRefreshToken);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(keyCachedUser);
    await prefs.remove(keyCachedPermissions);
    await prefs.remove(keyDemoUser);
  }

  static Future<void> setString(String key, String value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, value);
  }

  static Future<String?> getString(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(key);
  }
}

