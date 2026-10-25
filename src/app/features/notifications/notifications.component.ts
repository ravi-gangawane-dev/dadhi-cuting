import { Component, computed, inject, signal } from '@angular/core';
import { AppHeaderComponent } from '../../shared/components/app-header/app-header.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { TranslationService } from '../../core/services/translation.service';
import { ToastService } from '../../core/services/toast.service';
import { NotificationItem } from '../../shared/models/salon.models';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [AppHeaderComponent, IconComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);

  readonly filter = signal('all');
  readonly notifications = computed(() => this.store.notifications());
  readonly visibleNotifications = computed(() =>
    this.notifications().filter(
      (n) =>
        this.filter() === 'all' ||
        (this.filter() === 'unread' ? !n.isRead : n.type === this.filter()),
    ),
  );

  readonly todayNotifications = computed(() =>
    this.notifications().filter((n) => n.group === 'today' || !n.group),
  );

  readonly earlierNotifications = computed(() =>
    this.notifications().filter((n) => n.group === 'earlier'),
  );

  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.isRead).length);

  async markAllRead(): Promise<void> {
    try {
      await this.store.markAllNotificationsRead();
    } catch {
      /* Store displays errors. */
    }
  }

  async markRead(notif: NotificationItem): Promise<void> {
    try {
      await this.store.markNotificationRead(notif.id);
    } catch {
      /* Store displays errors. */
    }
  }

  getIconName(type: string): string {
    const map: Record<string, string> = {
      payment: 'rupee',
      expense: 'minus',
      closing: 'check',
      customer: 'user',
      pending: 'bell',
    };
    return map[type] ?? 'bell';
  }

  getIconBg(type: string): string {
    const map: Record<string, string> = {
      payment: '#E5F4EA',
      expense: '#FEE2E2',
      closing: '#F0EDE8',
      customer: '#EFF6FF',
      pending: '#FFF9EB',
    };
    return map[type] ?? '#F0EDE8';
  }

  getIconColor(type: string): string {
    const map: Record<string, string> = {
      payment: '#268A65',
      expense: '#DC2626',
      closing: '#77817A',
      customer: '#3B82F6',
      pending: '#BC8B42',
    };
    return map[type] ?? '#77817A';
  }
}
