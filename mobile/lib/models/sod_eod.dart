import 'task.dart';

class SodItem {
  final String id;
  final String? taskId;
  final String titleSnapshot;
  final String prioritySnapshot;
  final String statusSnapshot;
  final int progressSnapshot;
  final String? plannedOutcome;
  final double? plannedHours;
  final bool isAcknowledged;
  final String source; // 'AUTO_TASK' | 'ASSIGNED' | 'SELF'
  final String status; // 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'DROPPED'
  final String? instructions;
  final String? dueTime;
  final Task? task;

  SodItem({
    required this.id,
    this.taskId,
    required this.titleSnapshot,
    required this.prioritySnapshot,
    required this.statusSnapshot,
    this.progressSnapshot = 0,
    this.plannedOutcome,
    this.plannedHours,
    this.isAcknowledged = false,
    required this.source,
    required this.status,
    this.instructions,
    this.dueTime,
    this.task,
  });

  factory SodItem.fromJson(Map<String, dynamic> json) {
    return SodItem(
      id: json['id']?.toString() ?? '',
      taskId: json['taskId']?.toString(),
      titleSnapshot: json['titleSnapshot']?.toString() ?? '',
      prioritySnapshot: json['prioritySnapshot']?.toString() ?? 'MEDIUM',
      statusSnapshot: json['statusSnapshot']?.toString() ?? 'PENDING',
      progressSnapshot: (json['progressSnapshot'] as num?)?.toInt() ?? 0,
      plannedOutcome: json['plannedOutcome']?.toString(),
      plannedHours: (json['plannedHours'] as num?)?.toDouble(),
      isAcknowledged: json['isAcknowledged'] == true,
      source: json['source']?.toString() ?? 'SELF',
      status: json['status']?.toString() ?? 'PENDING',
      instructions: json['instructions']?.toString(),
      dueTime: json['dueTime']?.toString(),
      task: json['task'] is Map<String, dynamic> ? Task.fromJson(json['task']) : null,
    );
  }
}

class Sod {
  final String id;
  final String date;
  final String status; // 'PENDING' | 'SUBMITTED' | 'SKIPPED'
  final String? plannedNote;
  final String? skipReason;
  final String? submittedAt;
  final List<SodItem> items;
  final TaskUserRef? user;

  Sod({
    required this.id,
    required this.date,
    required this.status,
    this.plannedNote,
    this.skipReason,
    this.submittedAt,
    this.items = const [],
    this.user,
  });

  factory Sod.fromJson(Map<String, dynamic> json) {
    return Sod(
      id: json['id']?.toString() ?? '',
      date: json['date']?.toString() ?? '',
      status: json['status']?.toString() ?? 'PENDING',
      plannedNote: json['plannedNote']?.toString(),
      skipReason: json['skipReason']?.toString(),
      submittedAt: json['submittedAt']?.toString(),
      items: json['items'] != null
          ? List<SodItem>.from(json['items'].map((i) => SodItem.fromJson(i)))
          : const [],
      user: json['user'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['user'])
          : null,
    );
  }
}

class EodItem {
  final String id;
  final String? taskId;
  final String titleSnapshot;
  final String category; // 'COMPLETED' | 'PENDING' | 'BLOCKED' | 'ADDITIONAL'
  final String statusAtEod;
  final int progressAtEod;
  final double? hoursSpent;
  final String? note;
  final String? blockerReason;
  final Task? task;

  EodItem({
    required this.id,
    this.taskId,
    required this.titleSnapshot,
    required this.category,
    required this.statusAtEod,
    this.progressAtEod = 0,
    this.hoursSpent,
    this.note,
    this.blockerReason,
    this.task,
  });

  factory EodItem.fromJson(Map<String, dynamic> json) {
    return EodItem(
      id: json['id']?.toString() ?? '',
      taskId: json['taskId']?.toString(),
      titleSnapshot: json['titleSnapshot']?.toString() ?? '',
      category: json['category']?.toString() ?? 'COMPLETED',
      statusAtEod: json['statusAtEod']?.toString() ?? 'COMPLETED',
      progressAtEod: (json['progressAtEod'] as num?)?.toInt() ?? 0,
      hoursSpent: (json['hoursSpent'] as num?)?.toDouble(),
      note: json['note']?.toString(),
      blockerReason: json['blockerReason']?.toString(),
      task: json['task'] is Map<String, dynamic> ? Task.fromJson(json['task']) : null,
    );
  }
}

class Eod {
  final String id;
  final String date;
  final String status; // 'PENDING' | 'SUBMITTED' | 'REVIEWED' | 'CHANGES_REQUESTED'
  final String? workSummary;
  final String? pendingReason;
  final String? blockers;
  final String? additionalWork;
  final String? nextDayPlan;
  final double? totalHours;
  final String? submittedAt;
  final String? reviewedAt;
  final String? reviewNotes;
  final List<EodItem> items;
  final TaskUserRef? user;
  final TaskUserRef? reviewedBy;

  Eod({
    required this.id,
    required this.date,
    required this.status,
    this.workSummary,
    this.pendingReason,
    this.blockers,
    this.additionalWork,
    this.nextDayPlan,
    this.totalHours,
    this.submittedAt,
    this.reviewedAt,
    this.reviewNotes,
    this.items = const [],
    this.user,
    this.reviewedBy,
  });

  factory Eod.fromJson(Map<String, dynamic> json) {
    return Eod(
      id: json['id']?.toString() ?? '',
      date: json['date']?.toString() ?? '',
      status: json['status']?.toString() ?? 'PENDING',
      workSummary: json['workSummary']?.toString(),
      pendingReason: json['pendingReason']?.toString(),
      blockers: json['blockers']?.toString(),
      additionalWork: json['additionalWork']?.toString(),
      nextDayPlan: json['nextDayPlan']?.toString(),
      totalHours: (json['totalHours'] as num?)?.toDouble(),
      submittedAt: json['submittedAt']?.toString(),
      reviewedAt: json['reviewedAt']?.toString(),
      reviewNotes: json['reviewNotes']?.toString(),
      items: json['items'] != null
          ? List<EodItem>.from(json['items'].map((i) => EodItem.fromJson(i)))
          : const [],
      user: json['user'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['user'])
          : null,
      reviewedBy: json['reviewedBy'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['reviewedBy'])
          : null,
    );
  }
}

