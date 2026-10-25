import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
})
export class OnboardingComponent {
  readonly store = inject(SalonStoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly salonName = signal('');
  readonly isLoading = signal(false);

  async createSalon(): Promise<void> {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    try {
      await this.store.createSalon(this.salonName());
      this.toast.success('Salon created. Welcome!');
      await this.router.navigateByUrl('/dashboard');
    } catch (e) {
      this.toast.error(this.store.message(e));
    } finally {
      this.isLoading.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.store.logout();
    await this.router.navigateByUrl('/auth/login');
  }
}
