class TaskCounts {
  final int comments;
  final int attachments;
  final int subtasks;

  TaskCounts({
    this.comments = 0,
    this.attachments = 0,
    this.subtasks = 0,
  });

  factory TaskCounts.fromJson(Map<String, dynamic>? json) {
    if (json == null) return TaskCounts();
    return TaskCounts(
      comments: json['comments'] is int ? json['comments'] : 0,
      attachments: json['attachments'] is int ? json['attachments'] : 0,
      subtasks: json['subtasks'] is int ? json['subtasks'] : 0,
    );
  }
}

class TaskUserRef {
  final String id;
  final String firstName;
  final String lastName;
  final String? employeeCode;
  final String? avatarUrl;

  TaskUserRef({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.employeeCode,
    this.avatarUrl,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory TaskUserRef.fromJson(Map<String, dynamic> json) {
    return TaskUserRef(
      id: json['id']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      lastName: json['lastName']?.toString() ?? '',
      employeeCode: json['employeeCode']?.toString(),
      avatarUrl: json['avatarUrl']?.toString(),
    );
  }
}

class Task {
  final String id;
  final String code;
  final String title;
  final String? description;
  final String priority;
  final String status;
  final String displayStatus;
  final bool isOverdue;
  final int progress;
  final double? estimatedHours;
  final double actualHours;
  final String? startDate;
  final String? dueDate;
  final String? completedAt;
  final String? blockedReason;
  final String? reviewNotes;
  final List<String> tags;
  final TaskUserRef? assignee;
  final TaskUserRef? createdBy;
  final TaskUserRef? reviewedBy;
  final TaskCounts counts;
  final String createdAt;

  Task({
    required this.id,
    required this.code,
    required this.title,
    this.description,
    required this.priority,
    required this.status,
    required this.displayStatus,
    this.isOverdue = false,
    this.progress = 0,
    this.estimatedHours,
    this.actualHours = 0,
    this.startDate,
    this.dueDate,
    this.completedAt,
    this.blockedReason,
    this.reviewNotes,
    this.tags = const [],
    this.assignee,
    this.createdBy,
    this.reviewedBy,
    required this.counts,
    required this.createdAt,
  });

  factory Task.fromJson(Map<String, dynamic> json) {
    return Task(
      id: json['id']?.toString() ?? '',
      code: json['code']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString(),
      priority: json['priority']?.toString() ?? 'MEDIUM',
      status: json['status']?.toString() ?? 'ASSIGNED',
      displayStatus: json['displayStatus']?.toString() ?? json['status']?.toString() ?? 'Assigned',
      isOverdue: json['isOverdue'] == true,
      progress: (json['progress'] as num?)?.toInt() ?? 0,
      estimatedHours: (json['estimatedHours'] as num?)?.toDouble(),
      actualHours: (json['actualHours'] as num?)?.toDouble() ?? 0.0,
      startDate: json['startDate']?.toString(),
      dueDate: json['dueDate']?.toString(),
      completedAt: json['completedAt']?.toString(),
      blockedReason: json['blockedReason']?.toString(),
      reviewNotes: json['reviewNotes']?.toString(),
      tags: json['tags'] != null
          ? List<String>.from(json['tags'].map((e) => e.toString()))
          : const [],
      assignee: json['assignee'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['assignee'])
          : null,
      createdBy: json['createdBy'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['createdBy'])
          : null,
      reviewedBy: json['reviewedBy'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['reviewedBy'])
          : null,
      counts: TaskCounts.fromJson(json['counts']),
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }
}

class TaskComment {
  final String id;
  final String body;
  final bool isInternal;
  final String createdAt;
  final TaskUserRef author;

  TaskComment({
    required this.id,
    required this.body,
    required this.isInternal,
    required this.createdAt,
    required this.author,
  });

  factory TaskComment.fromJson(Map<String, dynamic> json) {
    return TaskComment(
      id: json['id']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      isInternal: json['isInternal'] == true,
      createdAt: json['createdAt']?.toString() ?? '',
      author: TaskUserRef.fromJson(json['author'] ?? {}),
    );
  }
}

class TaskAttachment {
  final String id;
  final String originalName;
  final String mimeType;
  final int size;
  final String createdAt;
  final TaskUserRef uploadedBy;

  TaskAttachment({
    required this.id,
    required this.originalName,
    required this.mimeType,
    required this.size,
    required this.createdAt,
    required this.uploadedBy,
  });

  factory TaskAttachment.fromJson(Map<String, dynamic> json) {
    return TaskAttachment(
      id: json['id']?.toString() ?? '',
      originalName: json['originalName']?.toString() ?? '',
      mimeType: json['mimeType']?.toString() ?? '',
      size: (json['size'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt']?.toString() ?? '',
      uploadedBy: TaskUserRef.fromJson(json['uploadedBy'] ?? {}),
    );
  }
}

class TaskDetail {
  final Task task;
  final List<TaskComment> comments;
  final List<TaskAttachment> attachments;
  final List<Task> subtasks;

  TaskDetail({
    required this.task,
    this.comments = const [],
    this.attachments = const [],
    this.subtasks = const [],
  });

  factory TaskDetail.fromJson(Map<String, dynamic> json) {
    final taskObj = Task.fromJson(json);
    return TaskDetail(
      task: taskObj,
      comments: json['comments'] != null
          ? List<TaskComment>.from(json['comments'].map((c) => TaskComment.fromJson(c)))
          : const [],
      attachments: json['attachments'] != null
          ? List<TaskAttachment>.from(json['attachments'].map((a) => TaskAttachment.fromJson(a)))
          : const [],
      subtasks: json['subtasks'] != null
          ? List<Task>.from(json['subtasks'].map((s) => Task.fromJson(s)))
          : const [],
    );
  }
}

