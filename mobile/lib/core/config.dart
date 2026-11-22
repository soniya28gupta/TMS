class AppConfig {
  // Production URL and Dev fallback
static const String productionApiUrl =
    'https://task-management-system-phi-neon.vercel.app/api';

  static const String localApiUrl = 'http://10.0.2.2:4000/api'; // Android emulator localhost
  
  // Active API base URL (defaults to production, can switch dynamically)
  static String activeApiBase = productionApiUrl;

  static const String appName = 'TaskFlow';
  static const String appVersion = '1.0.0';
}

