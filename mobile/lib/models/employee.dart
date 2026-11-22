class Department {
  final String id;
  final String name;
  final String code;
  final String? description;
  final bool isActive;
  final int userCount;

  Department({
    required this.id,
    required this.name,
    required this.code,
    this.description,
    this.isActive = true,
    this.userCount = 0,
  });

  factory Department.fromJson(Map<String, dynamic> json) {
    final counts = json['_count'] ?? {};
    return Department(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      code: json['code']?.toString() ?? '',
      description: json['description']?.toString(),
      isActive: json['isActive'] == true,
      userCount: (counts['users'] as num?)?.toInt() ?? 0,
    );
  }
}

class OrgNode {
  final String id;
  final String name;
  final String employeeCode;
  final String? designation;
  final String roleKey;
  final String roleName;
  final String? department;
  final String status;
  final int depth;
  final int directReports;
  final int totalReports;
  final List<OrgNode> children;

  OrgNode({
    required this.id,
    required this.name,
    required this.employeeCode,
    this.designation,
    required this.roleKey,
    required this.roleName,
    this.department,
    required this.status,
    required this.depth,
    this.directReports = 0,
    this.totalReports = 0,
    this.children = const [],
  });

  factory OrgNode.fromJson(Map<String, dynamic> json) {
    return OrgNode(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      employeeCode: json['employeeCode']?.toString() ?? '',
      designation: json['designation']?.toString(),
      roleKey: json['roleKey']?.toString() ?? '',
      roleName: json['roleName']?.toString() ?? '',
      department: json['department']?.toString(),
      status: json['status']?.toString() ?? 'ACTIVE',
      depth: (json['depth'] as num?)?.toInt() ?? 0,
      directReports: (json['directReports'] as num?)?.toInt() ?? 0,
      totalReports: (json['totalReports'] as num?)?.toInt() ?? 0,
      children: json['children'] != null
          ? List<OrgNode>.from(json['children'].map((c) => OrgNode.fromJson(c)))
          : const [],
    );
  }
}

class HierarchyRosterMember {
  final String id;
  final String firstName;
  final String lastName;
  final String employeeCode;
  final String email;
  final String roleName;
  final String? departmentName;
  final String? positionTitle;
  final String? managerName;
  final String workMode;
  final String attendanceStatus;
  final String? checkInAt;
  final String sodStatus;
  final String eodStatus;
  final int activeTasksCount;

  HierarchyRosterMember({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.employeeCode,
    required this.email,
    required this.roleName,
    this.departmentName,
    this.positionTitle,
    this.managerName,
    required this.workMode,
    required this.attendanceStatus,
    this.checkInAt,
    required this.sodStatus,
    required this.eodStatus,
    this.activeTasksCount = 0,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory HierarchyRosterMember.fromJson(Map<String, dynamic> json) {
    return HierarchyRosterMember(
      id: json['id']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      lastName: json['lastName']?.toString() ?? '',
      employeeCode: json['employeeCode']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      roleName: json['roleName']?.toString() ?? 'Employee',
      departmentName: json['departmentName']?.toString(),
      positionTitle: json['positionTitle']?.toString(),
      managerName: json['managerName']?.toString(),
      workMode: json['workMode']?.toString() ?? 'ONSITE',
      attendanceStatus: json['attendanceStatus']?.toString() ?? 'NOT_MARKED',
      checkInAt: json['checkInAt']?.toString(),
      sodStatus: json['sodStatus']?.toString() ?? 'PENDING',
      eodStatus: json['eodStatus']?.toString() ?? 'PENDING',
      activeTasksCount: (json['activeTasksCount'] as num?)?.toInt() ?? 0,
    );
  }
}
