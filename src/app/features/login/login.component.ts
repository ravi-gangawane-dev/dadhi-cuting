import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { TranslationService } from '../../core/services/translation.service';
import { ToastService } from '../../core/services/toast.service';
import { CustomDialogComponent } from '../../shared/components/custom-dialog/custom-dialog.component';
import { isMobile, normaliseMobile } from '../../core/services/mobile';
import { otpErrorMessage } from '../../core/services/auth-errors';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, CustomDialogComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly router = inject(Router);
  readonly store = inject(SalonStoreService);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(TranslationService);
  readonly mobileNumber = signal('');
  readonly identifier = computed(() => {
    const value = this.mobileNumber().trim();
    if (value.includes('@')) return value.includes('.') ? value : '';
    const digits = value.replace(/\D/g, '');
    return digits.length === 10 || (digits.length === 12 && digits.startsWith('91')) ? digits : '';
  });
  readonly password = signal('');
  readonly isLoading = signal(false);
  readonly showForgotModal = signal(false);

  constructor() {
    // A confirmed signup returns here with a session in the URL; send those
    // users into the app instead of showing the form again.
    void (async () => {
      await this.store.auth.ready.catch(() => {});
      if (!this.store.auth.loggedIn() || this.store.auth.recovery()) return;
      await this.store.ensureLoaded().catch(() => {});
      await this.router.navigateByUrl(this.store.needsOnboarding() ? '/onboarding' : '/dashboard');
    })();
  }
  async onSubmit(): Promise<void> {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    try {
      if (this.store.auth.recovery()) {
        await this.store.auth.updatePassword(this.password());
        this.toast.success('Password updated.');
      } else {
        if (!this.identifier() || !this.password())
          throw new Error('Enter your email or mobile number and password.');
        if (!(await this.store.login(this.mobileNumber(), this.password()))) return;
      }
      await this.router.navigateByUrl(this.store.needsOnboarding() ? '/onboarding' : '/dashboard');
    } catch (e) {
      this.toast.error(this.store.message(e));
    } finally {
      this.isLoading.set(false);
    }
  }
  readonly resetStep = signal<'mobile' | 'otp' | 'password' | 'email'>('mobile');
  readonly otpChannel = signal<'sms' | 'email'>('sms');
  readonly resetMobile = signal('');
  readonly resetEmail = signal('');
  readonly otp = signal('');
  readonly newPassword = signal('');

  openForgotPassword() {
    const typed = this.mobileNumber().trim();
    this.resetStep.set(typed.includes('@') ? 'email' : 'mobile');
    this.otpChannel.set(typed.includes('@') ? 'email' : 'sms');
    if (typed.includes('@')) this.resetEmail.set(typed);
    else this.resetMobile.set(typed);
    this.otp.set('');
    this.newPassword.set('');
    this.showForgotModal.set(true);
  }
  closeForgotPassword() {
    this.showForgotModal.set(false);
  }
  async sendOtp() {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    try {
      if (!isMobile(this.resetMobile())) throw new Error('Enter a 10-digit mobile number.');
      await this.store.auth.sendMobileOtp(this.resetMobile());
      this.otpChannel.set('sms');
      this.resetMobile.set(normaliseMobile(this.resetMobile()));
      this.otp.set('');
      this.resetStep.set('otp');
      this.toast.success(`OTP sent to ${this.resetMobile()}.`);
    } catch (e) {
      this.toast.error(otpErrorMessage(e));
    } finally {
      this.isLoading.set(false);
    }
  }
  async verifyOtp() {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    try {
      if (!/^\d{6}$/.test(this.otp().trim()))
        throw new Error(
          this.otpChannel() === 'sms'
            ? 'Enter the 6-digit code from the SMS.'
            : 'Enter the 6-digit code from the email.',
        );
      if (this.otpChannel() === 'sms')
        await this.store.auth.verifyMobileOtp(this.resetMobile(), this.otp());
      else await this.store.auth.verifyEmailOtp(this.resetEmail(), this.otp());
      this.resetStep.set('password');
    } catch (e) {
      this.toast.error(otpErrorMessage(e));
    } finally {
      this.isLoading.set(false);
    }
  }
  async saveNewPassword() {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    try {
      if (this.newPassword().length < 8) throw new Error('Use at least 8 characters.');
      await this.store.auth.updatePassword(this.newPassword());
      this.closeForgotPassword();
      await this.store.logout();
      this.password.set('');
      this.toast.success('Password updated. Sign in with your new password.', 'Done');
    } catch (e) {
      this.toast.error(this.store.message(e));
    } finally {
      this.isLoading.set(false);
    }
  }
  async sendEmailCode() {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    try {
      if (!this.resetEmail().includes('@')) throw new Error('Enter your registered email.');
      await this.store.auth.sendEmailOtp(this.resetEmail());
      this.otpChannel.set('email');
      this.otp.set('');
      this.resetStep.set('otp');
      this.toast.success(`Code sent to ${this.resetEmail().trim()}.`);
    } catch (e) {
      this.toast.error(otpErrorMessage(e));
    } finally {
      this.isLoading.set(false);
    }
  }
}
