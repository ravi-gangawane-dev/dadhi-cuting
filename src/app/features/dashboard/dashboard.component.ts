import { IconComponent } from '../../shared/components/icon/icon.component';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { TranslationService } from '../../core/services/translation.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [IconComponent, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly store = inject(SalonStoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(TranslationService);

  readonly recentEntries = computed(() =>
    this.store
      .serviceEntries()
      .filter((e) => e.status === 'completed')
      .slice(0, 5),
  );

  readonly topStaff = computed(() =>
    [...this.store.employees()].sort((a, b) => b.salesToday - a.salesToday).slice(0, 3),
  );

  goTo(path: string): void {
    this.router.navigateByUrl(path);
  }

  async logout(): Promise<void> {
    try {
      await this.store.logout();
      this.toast.success('आपला लॉग आउट झाले आहे', 'Logout');
      this.router.navigateByUrl('/auth/login');
    } catch (e) {
      this.toast.error(this.store.message(e));
    }
  }
}
