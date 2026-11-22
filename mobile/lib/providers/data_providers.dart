import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../models/task.dart';
import '../models/project.dart';
import '../models/attendance.dart';
import '../models/sod_eod.dart';
import '../models/leave.dart';
import '../models/employee.dart';
import '../models/notification.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

// Employee Dashboard
final employeeDashboardProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/dashboard/me');
  return res as Map<String, dynamic>;
});

// Admin Dashboard
final adminDashboardProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/dashboard/admin');
  return res as Map<String, dynamic>;
});

// Tasks Provider
final tasksProvider = FutureProvider.autoDispose.family<List<Task>, Map<String, dynamic>>((ref, filters) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/tasks', queryParameters: filters);
  if (res['data'] is List) {
    return List<Task>.from((res['data'] as List).map((t) => Task.fromJson(t)));
  }
  return [];
});

// Task Detail Provider
final taskDetailProvider = FutureProvider.autoDispose.family<TaskDetail, String>((ref, id) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/tasks/$id');
  final data = res['data'] ?? res;
  return TaskDetail.fromJson(data);
});

// Projects Provider
final projectsProvider = FutureProvider.autoDispose<List<Project>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/projects');
  if (res['data'] is List) {
    return List<Project>.from((res['data'] as List).map((p) => Project.fromJson(p)));
  }
  return [];
});

// Project Detail Provider
final projectDetailProvider = FutureProvider.autoDispose.family<Project, String>((ref, id) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/projects/$id');
  final data = res['data'] ?? res;
  return Project.fromJson(data);
});

// Today's SOD Provider
final todaySodProvider = FutureProvider.autoDispose<Sod?>((ref) async {
  final api = ref.watch(apiClientProvider);
  try {
    final res = await api.get('/sod/today');
    if (res['data'] != null) {
      return Sod.fromJson(res['data']);
    }
  } catch (_) {}
  return null;
});

// Today's EOD Provider
final todayEodProvider = FutureProvider.autoDispose<Eod?>((ref) async {
  final api = ref.watch(apiClientProvider);
  try {
    final res = await api.get('/eod/today');
    if (res['data'] != null) {
      return Eod.fromJson(res['data']);
    }
  } catch (_) {}
  return null;
});

// Attendance Today Provider
final todayAttendanceProvider = FutureProvider.autoDispose<TodayAttendanceResponse>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/attendance/today');
  return TodayAttendanceResponse.fromJson(res);
});

// Attendance History Provider
final attendanceHistoryProvider = FutureProvider.autoDispose<List<AttendanceRecord>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/attendance');
  if (res['data'] is List) {
    return List<AttendanceRecord>.from(
      (res['data'] as List).map((a) => AttendanceRecord.fromJson(a)),
    );
  }
  return [];
});

// Leave Balances Provider
final leaveBalancesProvider = FutureProvider.autoDispose<List<LeaveBalance>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/leave/balance');
  if (res['data'] is List) {
    return List<LeaveBalance>.from((res['data'] as List).map((b) => LeaveBalance.fromJson(b)));
  }
  return [];
});

// Leave Requests Provider
final leaveRequestsProvider = FutureProvider.autoDispose<List<LeaveRequest>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/leave');
  if (res['data'] is List) {
    return List<LeaveRequest>.from((res['data'] as List).map((l) => LeaveRequest.fromJson(l)));
  }
  return [];
});

// Notifications Provider
class NotificationsNotifier extends StateNotifier<List<NotificationItem>> {
  final ApiClient _api;
  int unreadCount = 0;

  NotificationsNotifier(this._api) : super([]) {
    loadNotifications();
  }

  Future<void> loadNotifications() async {
    try {
      final res = await _api.get('/notifications?pageSize=20');
      if (res['data'] is List) {
        state = List<NotificationItem>.from(
          (res['data'] as List).map((n) => NotificationItem.fromJson(n)),
        );
        unreadCount = res['unread'] is int ? res['unread'] : 0;
      }
    } catch (_) {}
  }

  Future<void> markAsRead(String id) async {
    try {
      await _api.post('/notifications/$id/read');
      state = [
        for (final item in state)
          if (item.id == id) item.copyWith(isRead: true) else item
      ];
      if (unreadCount > 0) unreadCount--;
    } catch (_) {}
  }
}

final notificationsProvider =
    StateNotifierProvider<NotificationsNotifier, List<NotificationItem>>((ref) {
  return NotificationsNotifier(ref.watch(apiClientProvider));
});

// Admin Review Queue Provider
final reviewQueueProvider = FutureProvider.autoDispose<List<Task>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/tasks/review-queue');
  if (res['data'] is List) {
    return List<Task>.from((res['data'] as List).map((t) => Task.fromJson(t)));
  }
  return [];
});

// Admin Employees Directory Provider
final employeesProvider = FutureProvider.autoDispose<List<HierarchyRosterMember>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get('/employees');
  if (res['data'] is List) {
    return List<HierarchyRosterMember>.from(
      (res['data'] as List).map((e) => HierarchyRosterMember.fromJson(e)),
    );
  }
  return [];
});

// Org Hierarchy Tree Provider
final orgHierarchyProvider = FutureProvider.autoDispose<OrgNode?>((ref) async {
  final api = ref.watch(apiClientProvider);
  try {
    final res = await api.get('/employees/org-chart');
    if (res['data'] != null) {
      return OrgNode.fromJson(res['data']);
    }
  } catch (_) {}
  return null;
});

