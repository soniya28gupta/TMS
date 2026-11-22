import 'task.dart';

class AttendanceRecord {
  final String id;
  final String userId;
  final String date;
  final String? checkInAt;
  final String? checkOutAt;
  final int workedMinutes;
  final String status;
  final String workMode;
  final String? note;
  final bool isManual;
  final TaskUserRef? user;

  // GPS coordinates & tracking details
  final bool locationConsent;
  final double? checkInLatitude;
  final double? checkInLongitude;
  final double? checkInAccuracy;
  final String? checkInAddress;
  final double? checkOutLatitude;
  final double? checkOutLongitude;
  final double? checkOutAccuracy;
  final String? checkOutAddress;

  AttendanceRecord({
    required this.id,
    required this.userId,
    required this.date,
    this.checkInAt,
    this.checkOutAt,
    this.workedMinutes = 0,
    required this.status,
    required this.workMode,
    this.note,
    this.isManual = false,
    this.user,
    this.locationConsent = false,
    this.checkInLatitude,
    this.checkInLongitude,
    this.checkInAccuracy,
    this.checkInAddress,
    this.checkOutLatitude,
    this.checkOutLongitude,
    this.checkOutAccuracy,
    this.checkOutAddress,
  });

  bool get hasCheckInGps => checkInLatitude != null && checkInLongitude != null;
  bool get hasCheckOutGps => checkOutLatitude != null && checkOutLongitude != null;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      id: json['id']?.toString() ?? '',
      userId: json['userId']?.toString() ?? '',
      date: json['date']?.toString() ?? '',
      checkInAt: json['checkInAt']?.toString(),
      checkOutAt: json['checkOutAt']?.toString(),
      workedMinutes: (json['workedMinutes'] as num?)?.toInt() ?? 0,
      status: json['status']?.toString() ?? 'PRESENT',
      workMode: json['workMode']?.toString() ?? 'ONSITE',
      note: json['note']?.toString(),
      isManual: json['isManual'] == true,
      user: json['user'] is Map<String, dynamic>
          ? TaskUserRef.fromJson(json['user'])
          : null,
      locationConsent: json['locationConsent'] == true,
      checkInLatitude: (json['checkInLatitude'] as num?)?.toDouble(),
      checkInLongitude: (json['checkInLongitude'] as num?)?.toDouble(),
      checkInAccuracy: (json['checkInAccuracy'] as num?)?.toDouble(),
      checkInAddress: json['checkInAddress']?.toString(),
      checkOutLatitude: (json['checkOutLatitude'] as num?)?.toDouble(),
      checkOutLongitude: (json['checkOutLongitude'] as num?)?.toDouble(),
      checkOutAccuracy: (json['checkOutAccuracy'] as num?)?.toDouble(),
      checkOutAddress: json['checkOutAddress']?.toString(),
    );
  }
}

class TodayAttendanceResponse {
  final AttendanceRecord? data;
  final String today;
  final bool canCheckIn;
  final bool canCheckOut;

  TodayAttendanceResponse({
    this.data,
    required this.today,
    required this.canCheckIn,
    required this.canCheckOut,
  });

  factory TodayAttendanceResponse.fromJson(Map<String, dynamic> json) {
    return TodayAttendanceResponse(
      data: json['data'] is Map<String, dynamic>
          ? AttendanceRecord.fromJson(json['data'])
          : null,
      today: json['today']?.toString() ?? '',
      canCheckIn: json['canCheckIn'] == true,
      canCheckOut: json['canCheckOut'] == true,
    );
  }
}

