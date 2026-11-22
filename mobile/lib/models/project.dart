import 'task.dart';

class ProjectMember {
  final String id;
  final String projectId;
  final String userId;
  final String role; // 'LEAD' | 'MEMBER' | 'VIEWER'
  final String assignedAt;
  final TaskUserRef user;

  ProjectMember({
    required this.id,
    required this.projectId,
    required this.userId,
    required this.role,
    required this.assignedAt,
    required this.user,
  });

  factory ProjectMember.fromJson(Map<String, dynamic> json) {
    return ProjectMember(
      id: json['id']?.toString() ?? '',
      projectId: json['projectId']?.toString() ?? '',
      userId: json['userId']?.toString() ?? '',
      role: json['role']?.toString() ?? 'MEMBER',
      assignedAt: json['assignedAt']?.toString() ?? '',
      user: TaskUserRef.fromJson(json['user'] ?? {}),
    );
  }
}

class ProjectAttachment {
  final String id;
  final String projectId;
  final String originalName;
  final String storageKey;
  final String mimeType;
  final int fileSize;
  final String createdAt;
  final TaskUserRef? uploadedBy;

  ProjectAttachment({
    required this.id,
    required this.projectId,
    required this.originalName,
    required this.storageKey,
    required this.mimeType,
    required this.fileSize,
    required this.createdAt,
    this.uploadedBy,
  });

  factory ProjectAttachment.fromJson(Map<String, dynamic> json) {
    return ProjectAttachment(
      id: json['id']?.toString() ?? '',
      projectId: json['projectId']?.toString() ?? '',
      originalName: json['originalName']?.toString() ?? '',
      storageKey: json['storageKey']?.toString() ?? '',
      mimeType: json['mimeType']?.toString() ?? '',
      fileSize: (json['fileSize'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt']?.toString() ?? '',
      uploadedBy: json['uploadedBy'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['uploadedBy'])
          : null,
    );
  }
}

class ProjectProgressUpdate {
  final String id;
  final String projectId;
  final String employeeId;
  final String updateType; // 'DAILY' | 'WEEKLY'
  final int previousProgress;
  final int newProgress;
  final String completedWork;
  final String ongoingWork;
  final String? blockers;
  final String nextSteps;
  final String? additionalNotes;
  final TaskUserRef? employee;
  final List<ProjectAttachment> attachments;
  final String createdAt;

  ProjectProgressUpdate({
    required this.id,
    required this.projectId,
    required this.employeeId,
    required this.updateType,
    required this.previousProgress,
    required this.newProgress,
    required this.completedWork,
    required this.ongoingWork,
    this.blockers,
    required this.nextSteps,
    this.additionalNotes,
    this.employee,
    this.attachments = const [],
    required this.createdAt,
  });

  factory ProjectProgressUpdate.fromJson(Map<String, dynamic> json) {
    return ProjectProgressUpdate(
      id: json['id']?.toString() ?? '',
      projectId: json['projectId']?.toString() ?? '',
      employeeId: json['employeeId']?.toString() ?? '',
      updateType: json['updateType']?.toString() ?? 'DAILY',
      previousProgress: (json['previousProgress'] as num?)?.toInt() ?? 0,
      newProgress: (json['newProgress'] as num?)?.toInt() ?? 0,
      completedWork: json['completedWork']?.toString() ?? '',
      ongoingWork: json['ongoingWork']?.toString() ?? '',
      blockers: json['blockers']?.toString(),
      nextSteps: json['nextSteps']?.toString() ?? '',
      additionalNotes: json['additionalNotes']?.toString(),
      employee: json['employee'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['employee'])
          : null,
      attachments: json['attachments'] != null
          ? List<ProjectAttachment>.from(
              json['attachments'].map((a) => ProjectAttachment.fromJson(a)))
          : const [],
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }
}

class ProjectApprovalHistory {
  final String id;
  final String submissionId;
  final String action; // 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'
  final String? comments;
  final String createdAt;
  final TaskUserRef? performedBy;

  ProjectApprovalHistory({
    required this.id,
    required this.submissionId,
    required this.action,
    this.comments,
    required this.createdAt,
    this.performedBy,
  });

  factory ProjectApprovalHistory.fromJson(Map<String, dynamic> json) {
    return ProjectApprovalHistory(
      id: json['id']?.toString() ?? '',
      submissionId: json['submissionId']?.toString() ?? '',
      action: json['action']?.toString() ?? 'SUBMITTED',
      comments: json['comments']?.toString(),
      createdAt: json['createdAt']?.toString() ?? '',
      performedBy: json['performedBy'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['performedBy'])
          : null,
    );
  }
}

class ProjectSubmission {
  final String id;
  final String projectId;
  final String submittedById;
  final String finalSummary;
  final String completedDeliverables;
  final int finalProgress;
  final String? outstandingIssues;
  final String? deliveryDetails;
  final String? submissionComments;
  final String status; // 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'
  final String submittedAt;
  final String? managementComments;
  final TaskUserRef? submittedBy;
  final TaskUserRef? reviewedBy;
  final List<ProjectAttachment> attachments;
  final List<ProjectApprovalHistory> approvalHistories;

  ProjectSubmission({
    required this.id,
    required this.projectId,
    required this.submittedById,
    required this.finalSummary,
    required this.completedDeliverables,
    required this.finalProgress,
    this.outstandingIssues,
    this.deliveryDetails,
    this.submissionComments,
    required this.status,
    required this.submittedAt,
    this.managementComments,
    this.submittedBy,
    this.reviewedBy,
    this.attachments = const [],
    this.approvalHistories = const [],
  });

  factory ProjectSubmission.fromJson(Map<String, dynamic> json) {
    return ProjectSubmission(
      id: json['id']?.toString() ?? '',
      projectId: json['projectId']?.toString() ?? '',
      submittedById: json['submittedById']?.toString() ?? '',
      finalSummary: json['finalSummary']?.toString() ?? '',
      completedDeliverables: json['completedDeliverables']?.toString() ?? '',
      finalProgress: (json['finalProgress'] as num?)?.toInt() ?? 100,
      outstandingIssues: json['outstandingIssues']?.toString(),
      deliveryDetails: json['deliveryDetails']?.toString(),
      submissionComments: json['submissionComments']?.toString(),
      status: json['status']?.toString() ?? 'PENDING',
      submittedAt: json['submittedAt']?.toString() ?? '',
      managementComments: json['managementComments']?.toString(),
      submittedBy: json['submittedBy'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['submittedBy'])
          : null,
      reviewedBy: json['reviewedBy'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['reviewedBy'])
          : null,
      attachments: json['attachments'] != null
          ? List<ProjectAttachment>.from(
              json['attachments'].map((a) => ProjectAttachment.fromJson(a)))
          : const [],
      approvalHistories: json['approvalHistories'] != null
          ? List<ProjectApprovalHistory>.from(
              json['approvalHistories'].map((h) => ProjectApprovalHistory.fromJson(h)))
          : const [],
    );
  }
}

class Project {
  final String id;
  final String code;
  final String name;
  final String? description;
  final String status;
  final int progress;
  final String? startDate;
  final String? dueDate;
  final String? completedAt;
  final TaskUserRef? manager;
  final TaskUserRef? createdBy;
  final List<ProjectMember> members;
  final List<ProjectProgressUpdate> progressUpdates;
  final List<ProjectAttachment> attachments;
  final List<ProjectSubmission> submissions;
  final int taskCount;
  final int memberCount;

  Project({
    required this.id,
    required this.code,
    required this.name,
    this.description,
    required this.status,
    required this.progress,
    this.startDate,
    this.dueDate,
    this.completedAt,
    this.manager,
    this.createdBy,
    this.members = const [],
    this.progressUpdates = const [],
    this.attachments = const [],
    this.submissions = const [],
    this.taskCount = 0,
    this.memberCount = 0,
  });

  factory Project.fromJson(Map<String, dynamic> json) {
    final counts = json['counts'] ?? json['_count'] ?? {};
    return Project(
      id: json['id']?.toString() ?? '',
      code: json['code']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      description: json['description']?.toString(),
      status: json['status']?.toString() ?? 'NOT_STARTED',
      progress: (json['progress'] as num?)?.toInt() ?? 0,
      startDate: json['startDate']?.toString(),
      dueDate: json['dueDate']?.toString(),
      completedAt: json['completedAt']?.toString(),
      manager: json['manager'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['manager'])
          : null,
      createdBy: json['createdBy'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['createdBy'])
          : null,
      members: json['members'] != null
          ? List<ProjectMember>.from(json['members'].map((m) => ProjectMember.fromJson(m)))
          : const [],
      progressUpdates: json['progressUpdates'] != null
          ? List<ProjectProgressUpdate>.from(
              json['progressUpdates'].map((u) => ProjectProgressUpdate.fromJson(u)))
          : const [],
      attachments: json['attachments'] != null
          ? List<ProjectAttachment>.from(
              json['attachments'].map((a) => ProjectAttachment.fromJson(a)))
          : const [],
      submissions: json['submissions'] != null
          ? List<ProjectSubmission>.from(
              json['submissions'].map((s) => ProjectSubmission.fromJson(s)))
          : const [],
      taskCount: (counts['tasks'] as num?)?.toInt() ?? 0,
      memberCount: (counts['members'] as num?)?.toInt() ?? 0,
    );
  }
}

