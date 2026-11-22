class NotificationItem {
  final String id;
  final String type;
  final String title;
  final String? body;
  final String? link;
  final String severity; // 'INFO' | 'WARNING' | 'CRITICAL'
  final bool isRead;
  final String createdAt;

  NotificationItem({
    required this.id,
    required this.type,
    required this.title,
    this.body,
    this.link,
    required this.severity,
    required this.isRead,
    required this.createdAt,
  });

  NotificationItem copyWith({bool? isRead}) {
    return NotificationItem(
      id: id,
      type: type,
      title: title,
      body: body,
      link: link,
      severity: severity,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt,
    );
  }

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    return NotificationItem(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'SYSTEM',
      title: json['title']?.toString() ?? '',
      body: json['body']?.toString(),
      link: json['link']?.toString(),
      severity: json['severity']?.toString() ?? 'INFO',
      isRead: json['isRead'] == true,
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }
}

