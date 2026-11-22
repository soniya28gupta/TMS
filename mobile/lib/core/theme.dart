import 'package:flutter/material.dart';

class AppColors {
  // Brand Blue Palette (from Tailwind brand config)
  static const Color brand50 = Color(0xFFEFF6FF);
  static const Color brand100 = Color(0xFFDBEAFE);
  static const Color brand200 = Color(0xFFBFDBFE);
  static const Color brand300 = Color(0xFF93C5FD);
  static const Color brand400 = Color(0xFF60A5FA);
  static const Color brand500 = Color(0xFF3B82F6);
  static const Color brand600 = Color(0xFF2563EB); // Primary Brand
  static const Color brand700 = Color(0xFF1D4ED8);
  static const Color brand800 = Color(0xFF1E40AF);
  static const Color brand900 = Color(0xFF1E3A8A);

  // Neutral Slate Palette (from Tailwind slate)
  static const Color slate50 = Color(0xFFF8FAFC);
  static const Color slate100 = Color(0xFFF1F5F9);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate300 = Color(0xFFCBD5E1);
  static const Color slate400 = Color(0xFF94A3B8);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate800 = Color(0xFF1E293B);
  static const Color slate900 = Color(0xFF0F172A);

  // Status Badges & Accents
  static const Color emeraldBg = Color(0xFFECFDF5);
  static const Color emeraldText = Color(0xFF047857);
  static const Color emeraldBorder = Color(0xFFA7F3D0);

  static const Color amberBg = Color(0xFFFFFBEB);
  static const Color amberText = Color(0xFFB45309);
  static const Color amberBorder = Color(0xFFFDE68A);

  static const Color roseBg = Color(0xFFFFF1F2);
  static const Color roseText = Color(0xFFBE123C);
  static const Color roseBorder = Color(0xFFFECDD3);

  static const Color purpleBg = Color(0xFFFAF5FF);
  static const Color purpleText = Color(0xFF7E22CE);
  static const Color purpleBorder = Color(0xFFE9D5FF);

  static const Color skyBg = Color(0xFFF0F9FF);
  static const Color skyText = Color(0xFF0369A1);
  static const Color skyBorder = Color(0xFFBAE6FD);

  static const Color indigoBg = Color(0xFFEEF2FF);
  static const Color indigoText = Color(0xFF4338CA);
  static const Color indigoBorder = Color(0xFFC7D2FE);

  // Card & Backgrounds
  static const Color scaffoldBg = Color(0xFFF8FAFC);
  static const Color cardBg = Colors.white;
  static const Color border = Color(0xFFE2E8F0);
}

class AppTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.brand600,
        primary: AppColors.brand600,
        surface: AppColors.cardBg,
      ),
      scaffoldBackgroundColor: AppColors.scaffoldBg,
      fontFamily: 'Inter',
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: AppColors.slate900,
        elevation: 0,
        scrolledUnderElevation: 1,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          color: AppColors.slate900,
          fontSize: 16,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
        ),
        iconTheme: IconThemeData(color: AppColors.slate700),
      ),
      cardTheme: CardThemeData(
        color: AppColors.cardBg,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.border, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.slate300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.slate300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.brand600, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.roseText),
        ),
        labelStyle: const TextStyle(fontSize: 13, color: AppColors.slate600),
        hintStyle: const TextStyle(fontSize: 13, color: AppColors.slate400),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.brand600,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.1,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.slate700,
          backgroundColor: Colors.white,
          side: const BorderSide(color: AppColors.slate300),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.slate200,
        thickness: 1,
        space: 1,
      ),
    );
  }
}
