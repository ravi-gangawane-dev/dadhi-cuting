import { A11yModule } from '@angular/cdk/a11y';
import { Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { TranslationService } from '../../../core/services/translation.service';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { FeatureAccessService } from '../../../core/services/feature-access.service';

interface MenuItem {
  title: string;
  titleMarathi: string;
  icon: string;
  route: string;
  feature?: string;
  badge?: number;
}

@Component({
  selector: 'app-more-menu-sheet',
  standalone: true,
  imports: [A11yModule, IconComponent],
  templateUrl: './more-menu-sheet.component.html',
  styleUrl: './more-menu-sheet.component.scss',
})
export class MoreMenuSheetComponent {
  private readonly router = inject(Router);
  readonly i18n = inject(TranslationService);
  readonly store = inject(SalonStoreService);
  readonly flags = inject(FeatureAccessService);

  readonly isOpen = input<boolean>(false);
  readonly closed = output<void>();

  readonly menuItems: MenuItem[] = [
    { title: 'Employees', titleMarathi: 'कर्मचारी', icon: 'users', route: '/employees', feature: 'employees' },
    { title: 'Customers', titleMarathi: 'ग्राहक', icon: 'user', route: '/customers', feature: 'customers' },
    { title: 'Expenses', titleMarathi: 'खर्च नोंद', icon: 'receipt', route: '/expenses', feature: 'expenses' },
    { title: 'Daily Closing', titleMarathi: 'दिवसाचा हिशेब', icon: 'wallet', route: '/closing', feature: 'daily_closing' },
    { title: 'Reports & Insights', titleMarathi: 'अहवाल', icon: 'trending-up', route: '/reports', feature: 'reports' },
    { title: 'Notifications', titleMarathi: 'सूचना', icon: 'bell', route: '/notifications' },
    {
      title: 'Appointments',
      titleMarathi: 'अपॉइंटमेंट्स',
      icon: 'calendar',
      route: '/appointments',
      feature: 'appointments',
    },
    {
      title: 'Settings & Profile',
      titleMarathi: 'सेटिंग्ज व प्रोफाईल',
      icon: 'settings',
      route: '/settings',
    },
  ];

  readonly visibleMenuItems = computed(() =>
    this.menuItems.filter(
      (item) =>
        this.store.canAccess(item.route) &&
        (!item.feature || this.flags.flags()[item.feature]?.available !== false),
    ),
  );

  navigate(route: string): void {
    this.closed.emit();
    this.router.navigateByUrl(route);
  }

  async onReset(): Promise<void> {
    try {
      await this.store.refresh();
      this.closed.emit();
    } catch (e) {
      this.store.error.set(this.store.message(e));
    }
  }
}
