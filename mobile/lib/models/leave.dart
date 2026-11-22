import 'task.dart';

class LeaveType {
  final String id;
  final String name;
  final String code;
  final double defaultDays;
  final bool isPaid;
  final bool allowHalfDay;
  final String color;

  LeaveType({
    required this.id,
    required this.name,
    required this.code,
    this.defaultDays = 0,
    this.isPaid = true,
    this.allowHalfDay = true,
    this.color = '#3b82f6',
  });

  factory LeaveType.fromJson(Map<String, dynamic> json) {
    return LeaveType(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      code: json['code']?.toString() ?? '',
      defaultDays: (json['defaultDays'] as num?)?.toDouble() ?? 0,
      isPaid: json['isPaid'] == true,
      allowHalfDay: json['allowHalfDay'] == true,
      color: json['color']?.toString() ?? '#3b82f6',
    );
  }
}

class LeaveBalance {
  final String id;
  final LeaveType leaveType;
  final int year;
  final double entitled;
  final double carriedForward;
  final double used;
  final double pending;
  final double available;

  LeaveBalance({
    required this.id,
    required this.leaveType,
    required this.year,
    required this.entitled,
    required this.carriedForward,
    required this.used,
    required this.pending,
    required this.available,
  });

  factory LeaveBalance.fromJson(Map<String, dynamic> json) {
    return LeaveBalance(
      id: json['id']?.toString() ?? '',
      leaveType: LeaveType.fromJson(json['leaveType'] ?? {}),
      year: (json['year'] as num?)?.toInt() ?? DateTime.now().year,
      entitled: (json['entitled'] as num?)?.toDouble() ?? 0,
      carriedForward: (json['carriedForward'] as num?)?.toDouble() ?? 0,
      used: (json['used'] as num?)?.toDouble() ?? 0,
      pending: (json['pending'] as num?)?.toDouble() ?? 0,
      available: (json['available'] as num?)?.toDouble() ?? 0,
    );
  }
}

class LeaveRequest {
  final String id;
  final String? userId;
  final String startDate;
  final String endDate;
  final double days;
  final bool isHalfDay;
  final String reason;
  final String status; // 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  final String? decisionNote;
  final String createdAt;
  final LeaveType leaveType;
  final TaskUserRef? user;
  final TaskUserRef? approver;

  LeaveRequest({
    required this.id,
    this.userId,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.isHalfDay,
    required this.reason,
    required this.status,
    this.decisionNote,
    required this.createdAt,
    required this.leaveType,
    this.user,
    this.approver,
  });

  factory LeaveRequest.fromJson(Map<String, dynamic> json) {
    return LeaveRequest(
      id: json['id']?.toString() ?? '',
      userId: json['userId']?.toString(),
      startDate: json['startDate']?.toString() ?? '',
      endDate: json['endDate']?.toString() ?? '',
      days: (json['days'] as num?)?.toDouble() ?? 1,
      isHalfDay: json['isHalfDay'] == true,
      reason: json['reason']?.toString() ?? '',
      status: json['status']?.toString() ?? 'PENDING',
      decisionNote: json['decisionNote']?.toString(),
      createdAt: json['createdAt']?.toString() ?? '',
      leaveType: LeaveType.fromJson(json['leaveType'] ?? {}),
      user: json['user'] is Map<String, dynamic> ? TaskUserRef.fromJson(json['user']) : null,
      approver: json['approver'] is Map<String, dynamic> ? TaskUserRef.fromJson(json['approver']) : null,
    );
  }
}

