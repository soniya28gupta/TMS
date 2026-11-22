
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'config.dart';
import 'storage.dart';

class ApiError implements Exception {
  final int status;
  final String code;
  final String message;
  final dynamic details;

  ApiError({
    required this.status,
    required this.code,
    required this.message,
    this.details,
  });

  @override
  String toString() => message;
}

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();

  factory ApiClient() => _instance;

  late Dio _dio;
  bool _isRefreshing = false;

  ApiClient._internal() {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.activeApiBase,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await StorageService.getAccessToken();

          debugPrint('========== API REQUEST ==========');
          debugPrint('URL: ${options.uri}');
          debugPrint('METHOD: ${options.method}');
          debugPrint(
            'TOKEN EXISTS: ${token != null && token.isNotEmpty}',
          );
          debugPrint('TOKEN LENGTH: ${token?.length ?? 0}');

          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          debugPrint(
            'AUTH HEADER ATTACHED: ${options.headers.containsKey('Authorization')}',
          );

          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          if (error.response?.statusCode == 401 && !_isRefreshing) {
            _isRefreshing = true;

            final refreshed = await _refreshToken();

            _isRefreshing = false;

            if (refreshed) {
              final token = await StorageService.getAccessToken();

              error.requestOptions.headers['Authorization'] =
                  'Bearer $token';

              final cloneReq = await _dio.fetch(error.requestOptions);

              return handler.resolve(cloneReq);
            } else {
              await StorageService.clearAuth();
            }
          }

          return handler.next(error);
        },
      ),
    );
  }

  void updateBaseUrl(String url) {
    AppConfig.activeApiBase =
        url.replaceAll(RegExp(r'/$'), '');

    _dio.options.baseUrl = AppConfig.activeApiBase;
  }

  Future<bool> _refreshToken() async {
    try {
      final refreshToken = await StorageService.getRefreshToken();

      if (refreshToken == null || refreshToken.isEmpty) {
        return false;
      }

      final res = await Dio().post(
        '${AppConfig.activeApiBase}/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(
          headers: {'Content-Type': 'application/json'},
        ),
      );

      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = res.data;

        await StorageService.saveTokens(
          accessToken: data['accessToken'],
          refreshToken: data['refreshToken'],
        );

        return true;
      }

      return false;
    } catch (e) {
      debugPrint('TOKEN REFRESH FAILED: $e');
      return false;
    }
  }

  ApiError _handleError(dynamic error) {
    if (error is DioException) {
      final res = error.response;

      if (res != null) {
        final data = res.data;

        String message = res.statusMessage ?? 'Request failed';
        String code = 'API_ERROR';
        dynamic details;

        if (data is Map<String, dynamic>) {
          if (data['error'] is Map) {
            message = data['error']['message'] ?? message;
            code = data['error']['code'] ?? code;
            details = data['error']['details'];
          } else if (data['message'] != null) {
            message = data['message'].toString();
          }
        }

        debugPrint('API ERROR STATUS: ${res.statusCode}');
        debugPrint('API ERROR MESSAGE: $message');

        return ApiError(
          status: res.statusCode ?? 500,
          code: code,
          message: message,
          details: details,
        );
      }

      return ApiError(
        status: 0,
        code: 'NETWORK_ERROR',
        message:
            'Cannot reach the server. Please check your network connection.',
      );
    }

    return ApiError(
      status: 500,
      code: 'UNKNOWN',
      message: error.toString(),
    );
  }

  Future<dynamic> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final res = await _dio.get(
        path,
        queryParameters: queryParameters,
      );

      return res.data;
    } catch (e) {
      throw _handleError(e);
    }
  }

  Future<dynamic> post(String path, {dynamic data}) async {
    try {
      final res = await _dio.post(path, data: data);
      return res.data;
    } catch (e) {
      throw _handleError(e);
    }
  }

  Future<dynamic> patch(String path, {dynamic data}) async {
    try {
      final res = await _dio.patch(path, data: data);
      return res.data;
    } catch (e) {
      throw _handleError(e);
    }
  }

  Future<dynamic> delete(String path, {dynamic data}) async {
    try {
      final res = await _dio.delete(path, data: data);
      return res.data;
    } catch (e) {
      throw _handleError(e);
    }
  }

  Future<dynamic> upload(String path, FormData formData) async {
    try {
      final res = await _dio.post(
        path,
        data: formData,
        options: Options(contentType: 'multipart/form-data'),
      );

      return res.data;
    } catch (e) {
      throw _handleError(e);
    }
  }
}
