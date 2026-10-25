import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { ToastService } from '../../core/services/toast.service';
import { isMobile, normaliseMobile } from '../../core/services/mobile';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss',
})
export class SignupComponent {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly store = inject(SalonStoreService);

  readonly fullName = signal('');
  readonly email = signal('');
  readonly mobile = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly isLoading = signal(false);
  readonly submitted = signal(false);
  readonly showPassword = signal(false);
  /** Set when Supabase emailed a confirmation link instead of signing in. */
  readonly sentTo = signal('');

  readonly errors = computed(() => {
    const found: Record<string, string> = {};
    if (!this.fullName().trim()) found['fullName'] = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.email().trim()))
      found['email'] = 'Enter a valid email address.';
    if (!isMobile(this.mobile())) found['mobile'] = 'Enter a 10-digit mobile number.';
    if (this.password().length < 8) found['password'] = 'Use at least 8 characters.';
    if (this.confirmPassword() !== this.password())
      found['confirmPassword'] = 'Passwords do not match.';
    return found;
  });

  fieldError(name: string): string {
    return this.submitted() ? (this.errors()[name] ?? '') : '';
  }

  async submit(): Promise<void> {
    if (this.isLoading()) return;
    this.submitted.set(true);
    if (Object.keys(this.errors()).length) {
      this.toast.error('Check the highlighted fields.');
      return;
    }
    this.isLoading.set(true);
    try {
      const outcome = await this.store.register({
        fullName: this.fullName().trim(),
        email: this.email().trim(),
        mobile: normaliseMobile(this.mobile()),
        password: this.password(),
      });
      if (outcome === 'confirm-email') {
        this.sentTo.set(this.email().trim());
        return;
      }
      this.toast.success('Account created. Name your salon to begin.', 'Welcome');
      await this.router.navigateByUrl(this.store.needsOnboarding() ? '/onboarding' : '/dashboard');
    } catch (e) {
      this.toast.error(this.store.message(e));
    } finally {
      this.isLoading.set(false);
    }
  }
}
