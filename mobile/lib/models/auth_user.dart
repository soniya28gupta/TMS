class Role {
  final String id;
  final String key;
  final String name;
  final String? description;
  final String portal; // 'ADMIN' | 'EMPLOYEE'
  final int? rank;
  final List<String> permissions;

  Role({
    required this.id,
    required this.key,
    required this.name,
    this.description,
    required this.portal,
    this.rank,
    this.permissions = const [],
  });

  factory Role.fromJson(Map<String, dynamic> json) {
    return Role(
      id: json['id']?.toString() ?? '',
      key: json['key']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      description: json['description']?.toString(),
      portal: json['portal']?.toString() ?? 'EMPLOYEE',
      rank: json['rank'] is int ? json['rank'] : null,
      permissions: json['permissions'] != null
          ? List<String>.from(json['permissions'].map((e) => e.toString()))
          : const [],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'key': key,
    'name': name,
    'description': description,
    'portal': portal,
    'rank': rank,
    'permissions': permissions,
  };
}

class DepartmentRef {
  final String id;
  final String name;
  final String code;

  DepartmentRef({required this.id, required this.name, required this.code});

  factory DepartmentRef.fromJson(Map<String, dynamic> json) {
    return DepartmentRef(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      code: json['code']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'code': code};
}

class ManagerRef {
  final String id;
  final String firstName;
  final String lastName;
  final String employeeCode;

  ManagerRef({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.employeeCode,
  });

  factory ManagerRef.fromJson(Map<String, dynamic> json) {
    return ManagerRef(
      id: json['id']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      lastName: json['lastName']?.toString() ?? '',
      employeeCode: json['employeeCode']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'firstName': firstName,
    'lastName': lastName,
    'employeeCode': employeeCode,
  };
}

class User {
  final String id;
  final String employeeCode;
  final String email;
  final String firstName;
  final String lastName;
  final String fullName;
  final String? phone;
  final String? avatarUrl;
  final Role role;
  final DepartmentRef? department;
  final ManagerRef? manager;
  final String? designation;
  final String employmentType;
  final String workMode;
  final String? dateOfJoining;
  final String shiftStart;
  final String shiftEnd;
  final String status;
  final bool mustChangePassword;

  User({
    required this.id,
    required this.employeeCode,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.fullName,
    this.phone,
    this.avatarUrl,
    required this.role,
    this.department,
    this.manager,
    this.designation,
    required this.employmentType,
    required this.workMode,
    this.dateOfJoining,
    required this.shiftStart,
    required this.shiftEnd,
    required this.status,
    required this.mustChangePassword,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id']?.toString() ?? '',
      employeeCode: json['employeeCode']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      lastName: json['lastName']?.toString() ?? '',
      fullName: json['fullName']?.toString() ??
          "${json['firstName'] ?? ''} ${json['lastName'] ?? ''}".trim(),
      phone: json['phone']?.toString(),
      avatarUrl: json['avatarUrl']?.toString(),
      role: json['role'] is Map<String, dynamic>
          ? Role.fromJson(json['role'])
          : Role(id: '', key: 'EMPLOYEE', name: 'Employee', portal: 'EMPLOYEE'),
      department: json['department'] != null
          ? DepartmentRef.fromJson(json['department'])
          : null,
      manager: json['manager'] != null
          ? ManagerRef.fromJson(json['manager'])
          : null,
      designation: json['designation']?.toString(),
      employmentType: json['employmentType']?.toString() ?? 'FULL_TIME',
      workMode: json['workMode']?.toString() ?? 'ONSITE',
      dateOfJoining: json['dateOfJoining']?.toString(),
      shiftStart: json['shiftStart']?.toString() ?? '09:30',
      shiftEnd: json['shiftEnd']?.toString() ?? '18:30',
      status: json['status']?.toString() ?? 'ACTIVE',
      mustChangePassword: json['mustChangePassword'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeCode': employeeCode,
    'email': email,
    'firstName': firstName,
    'lastName': lastName,
    'fullName': fullName,
    'phone': phone,
    'avatarUrl': avatarUrl,
    'role': role.toJson(),
    'department': department?.toJson(),
    'manager': manager?.toJson(),
    'designation': designation,
    'employmentType': employmentType,
    'workMode': workMode,
    'dateOfJoining': dateOfJoining,
    'shiftStart': shiftStart,
    'shiftEnd': shiftEnd,
    'status': status,
    'mustChangePassword': mustChangePassword,
  };
}

class DemoAccount {
  final String label;
  final String email;
  final String role;

  DemoAccount({required this.label, required this.email, required this.role});

  factory DemoAccount.fromJson(Map<String, dynamic> json) {
    return DemoAccount(
      label: json['label']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
    );
  }
}

