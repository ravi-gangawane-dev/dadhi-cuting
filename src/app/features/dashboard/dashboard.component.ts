import { IconComponent } from '../../shared/components/icon/icon.component';
import { ChartContainerComponent } from '../../shared/components/chart-container/chart-container.component';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { TranslationService } from '../../core/services/translation.service';
import { ToastService } from '../../core/services/toast.service';
import { FeatureAccessService } from '../../core/services/feature-access.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [IconComponent, RouterLink, ChartContainerComponent, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly store = inject(SalonStoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly features = inject(FeatureAccessService);
  readonly i18n = inject(TranslationService);

  /** The temp-password hint set by the server-side account provisioning flow. */
  readonly mustChangePassword = computed(() => {
    const meta = this.store.auth.session()?.user.user_metadata ?? {};
    return (meta as Record<string, unknown>)['must_change_password'] === true;
  });
  readonly newPassword = signal('');
  readonly changingPassword = signal(false);

  /** Replaces the one-time password and clears the change-me hint. */
  async completePasswordChange(): Promise<void> {
    if (this.changingPassword()) return;
    try {
      await this.store.auth.updatePassword(this.newPassword());
      await this.store.auth.clearMustChangePassword();
      this.newPassword.set('');
      this.toast.success('Password updated. Keep it private.', 'Secure');
    } catch (e) {
      this.toast.error(this.store.message(e));
    } finally {
      this.changingPassword.set(false);
    }
  }

  /** The module a feature guard just denied, if any, from the backend verdict. */
  readonly deniedFeatureLabel = computed(() => {
    const key = this.features.lastDenied();
    if (!key) return '';
    return this.features.flags()[key]?.label ?? key;
  });

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
