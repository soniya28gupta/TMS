import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'theme.dart';

class Formatters {
  static String formatDate(String? value) {
    if (value == null || value.isEmpty) return '—';
    try {
      final date = DateTime.parse(value).toLocal();
      return DateFormat('dd MMM yyyy').format(date);
    } catch (_) {
      return '—';
    }
  }

  static String formatDateTime(String? value) {
    if (value == null || value.isEmpty) return '—';
    try {
      final date = DateTime.parse(value).toLocal();
      return DateFormat('dd MMM yyyy, HH:mm').format(date);
    } catch (_) {
      return '—';
    }
  }

  static String formatTime(String? value) {
    if (value == null || value.isEmpty) return '—';
    try {
      if (value.length <= 5 && value.contains(':')) return value; // e.g. "09:30"
      final date = DateTime.parse(value).toLocal();
      return DateFormat('HH:mm').format(date);
    } catch (_) {
      return value;
    }
  }

  static String relativeTime(String? value) {
    if (value == null || value.isEmpty) return '—';
    try {
      final date = DateTime.parse(value).toLocal();
      final diff = DateTime.now().difference(date);
      if (diff.inMinutes < 1) return 'just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 30) return '${diff.inDays}d ago';
      return DateFormat('dd MMM yyyy').format(date);
    } catch (_) {
      return '—';
    }
  }

  static String todayISO() {
    final now = DateTime.now();
    return "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";
  }

  static String formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  static String initials(String first, String last) {
    final f = first.isNotEmpty ? first[0] : '';
    final l = last.isNotEmpty ? last[0] : '';
    return '$f$l'.toUpperCase();
  }

  // --- Status styling helpers ---

  static StatusStyle getTaskStatusStyle(String status) {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return const StatusStyle(
          label: 'Completed',
          bgColor: AppColors.emeraldBg,
          textColor: AppColors.emeraldText,
          borderColor: AppColors.emeraldBorder,
        );
      case 'IN_PROGRESS':
        return const StatusStyle(
          label: 'In progress',
          bgColor: AppColors.amberBg,
          textColor: AppColors.amberText,
          borderColor: AppColors.amberBorder,
        );
      case 'SUBMITTED_FOR_REVIEW':
        return const StatusStyle(
          label: 'In review',
          bgColor: AppColors.purpleBg,
          textColor: AppColors.purpleText,
          borderColor: AppColors.purpleBorder,
        );
      case 'CHANGES_REQUIRED':
        return const StatusStyle(
          label: 'Changes required',
          bgColor: Color(0xFFFFF7ED),
          textColor: Color(0xFFC2410C),
          borderColor: Color(0xFFFED7AA),
        );
      case 'BLOCKED':
        return const StatusStyle(
          label: 'Blocked',
          bgColor: AppColors.roseBg,
          textColor: AppColors.roseText,
          borderColor: AppColors.roseBorder,
        );
      case 'OVERDUE':
        return const StatusStyle(
          label: 'Overdue',
          bgColor: Color(0xFFFEE2E2),
          textColor: Color(0xFF991B1B),
          borderColor: Color(0xFFFCA5A5),
        );
      case 'ACCEPTED':
        return const StatusStyle(
          label: 'Accepted',
          bgColor: AppColors.indigoBg,
          textColor: AppColors.indigoText,
          borderColor: AppColors.indigoBorder,
        );
      case 'ASSIGNED':
        return const StatusStyle(
          label: 'Assigned',
          bgColor: AppColors.brand50,
          textColor: AppColors.brand700,
          borderColor: AppColors.brand200,
        );
      case 'CANCELLED':
        return const StatusStyle(
          label: 'Cancelled',
          bgColor: AppColors.slate100,
          textColor: AppColors.slate500,
          borderColor: AppColors.slate200,
        );
      default:
        return StatusStyle(
          label: status,
          bgColor: AppColors.slate100,
          textColor: AppColors.slate700,
          borderColor: AppColors.slate200,
        );
    }
  }

  static StatusStyle getPriorityStyle(String priority) {
    switch (priority.toUpperCase()) {
      case 'CRITICAL':
        return const StatusStyle(
          label: 'Critical',
          bgColor: Color(0xFFFEF2F2),
          textColor: Color(0xFFB91C1C),
          borderColor: Color(0xFFFECACA),
        );
      case 'HIGH':
        return const StatusStyle(
          label: 'High',
          bgColor: AppColors.amberBg,
          textColor: AppColors.amberText,
          borderColor: AppColors.amberBorder,
        );
      case 'MEDIUM':
        return const StatusStyle(
          label: 'Medium',
          bgColor: AppColors.skyBg,
          textColor: AppColors.skyText,
          borderColor: AppColors.skyBorder,
        );
      case 'LOW':
      default:
        return const StatusStyle(
          label: 'Low',
          bgColor: AppColors.slate100,
          textColor: AppColors.slate600,
          borderColor: AppColors.slate200,
        );
    }
  }

  static StatusStyle getProjectStatusStyle(String status) {
    switch (status.toUpperCase()) {
      case 'ACTIVE':
      case 'COMPLETED':
        return const StatusStyle(
          label: 'Active',
          bgColor: AppColors.emeraldBg,
          textColor: AppColors.emeraldText,
          borderColor: AppColors.emeraldBorder,
        );
      case 'IN_PROGRESS':
        return const StatusStyle(
          label: 'In Progress',
          bgColor: AppColors.indigoBg,
          textColor: AppColors.indigoText,
          borderColor: AppColors.indigoBorder,
        );
      case 'PLANNING':
        return const StatusStyle(
          label: 'Planning',
          bgColor: AppColors.brand50,
          textColor: AppColors.brand700,
          borderColor: AppColors.brand200,
        );
      case 'ON_HOLD':
        return const StatusStyle(
          label: 'On Hold',
          bgColor: AppColors.amberBg,
          textColor: AppColors.amberText,
          borderColor: AppColors.amberBorder,
        );
      case 'UNDER_REVIEW':
        return const StatusStyle(
          label: 'Under Review',
          bgColor: AppColors.purpleBg,
          textColor: AppColors.purpleText,
          borderColor: AppColors.purpleBorder,
        );
      case 'REJECTED':
        return const StatusStyle(
          label: 'Rejected',
          bgColor: AppColors.roseBg,
          textColor: AppColors.roseText,
          borderColor: AppColors.roseBorder,
        );
      case 'NOT_STARTED':
      default:
        return const StatusStyle(
          label: 'Not Started',
          bgColor: AppColors.slate100,
          textColor: AppColors.slate700,
          borderColor: AppColors.slate200,
        );
    }
  }

  static StatusStyle getAttendanceStyle(String status) {
    switch (status.toUpperCase()) {
      case 'PRESENT':
        return const StatusStyle(
          label: 'Present',
          bgColor: AppColors.emeraldBg,
          textColor: AppColors.emeraldText,
          borderColor: AppColors.emeraldBorder,
        );
      case 'WFH':
        return const StatusStyle(
          label: 'WFH',
          bgColor: AppColors.skyBg,
          textColor: AppColors.skyText,
          borderColor: AppColors.skyBorder,
        );
      case 'LATE':
        return const StatusStyle(
          label: 'Late',
          bgColor: AppColors.amberBg,
          textColor: AppColors.amberText,
          borderColor: AppColors.amberBorder,
        );
      case 'HALF_DAY':
        return const StatusStyle(
          label: 'Half Day',
          bgColor: Color(0xFFFFF7ED),
          textColor: Color(0xFFC2410C),
          borderColor: Color(0xFFFED7AA),
        );
      case 'ON_LEAVE':
        return const StatusStyle(
          label: 'On Leave',
          bgColor: Color(0xFFF5F3FF),
          textColor: Color(0xFF6D28D9),
          borderColor: Color(0xFFDDD6FE),
        );
      case 'ABSENT':
        return const StatusStyle(
          label: 'Absent',
          bgColor: AppColors.roseBg,
          textColor: AppColors.roseText,
          borderColor: AppColors.roseBorder,
        );
      default:
        return StatusStyle(
          label: status.replaceAll('_', ' '),
          bgColor: AppColors.slate100,
          textColor: AppColors.slate500,
          borderColor: AppColors.slate200,
        );
    }
  }
}

class StatusStyle {
  final String label;
  final Color bgColor;
  final Color textColor;
  final Color borderColor;

  const StatusStyle({
    required this.label,
    required this.bgColor,
    required this.textColor,
    required this.borderColor,
  });
}

