import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../providers/data_providers.dart';
import 'ui_components.dart';

class NotificationSheet extends ConsumerWidget {
  const NotificationSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.8,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                const Icon(Icons.notifications_outlined, size: 20, color: AppColors.slate700),
                const SizedBox(width: 8),
                const Text(
                  'Notifications',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.slate900,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20, color: AppColors.slate500),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.slate200),
          // List
          Flexible(
            child: notifications.isEmpty
                ? const EmptyStateWidget(
                    icon: Icons.notifications_none_outlined,
                    title: 'No notifications',
                    message: 'You are completely caught up!',
                  )
                : ListView.separated(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: notifications.length,
                    separatorBuilder: (_, __) =>
                        const Divider(height: 1, color: AppColors.slate100),
                    itemBuilder: (context, index) {
                      final item = notifications[index];
                      return ListTile(
                        onTap: () {
                          ref.read(notificationsProvider.notifier).markAsRead(item.id);
                          if (item.link != null && item.link!.isNotEmpty) {
                            Navigator.pop(context);
                            context.push(item.link!);
                          }
                        },
                        tileColor: item.isRead ? Colors.white : AppColors.brand50.withOpacity(0.5),
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: item.isRead ? AppColors.slate100 : AppColors.brand100,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            item.severity == 'CRITICAL'
                                ? Icons.warning_amber_rounded
                                : Icons.info_outline,
                            size: 16,
                            color: item.severity == 'CRITICAL'
                                ? const Color(0xFFDC2626)
                                : AppColors.brand600,
                          ),
                        ),
                        title: Text(
                          item.title,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: item.isRead ? FontWeight.w500 : FontWeight.w700,
                            color: AppColors.slate900,
                          ),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (item.body != null) ...[
                              const SizedBox(height: 2),
                              Text(
                                item.body!,
                                style: const TextStyle(fontSize: 12, color: AppColors.slate600),
                              ),
                            ],
                            const SizedBox(height: 4),
                            Text(
                              Formatters.relativeTime(item.createdAt),
                              style: const TextStyle(fontSize: 11, color: AppColors.slate400),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

