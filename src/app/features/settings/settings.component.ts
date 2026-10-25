import { IconComponent } from '../../shared/components/icon/icon.component';
import { CustomDialogComponent } from '../../shared/components/custom-dialog/custom-dialog.component';
import { FormsModule } from '@angular/forms';
import { Component, computed, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppHeaderComponent } from '../../shared/components/app-header/app-header.component';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { TranslationService } from '../../core/services/translation.service';
import { toE164 } from '../../core/services/mobile';
import { ToastService } from '../../core/services/toast.service';
import { otpErrorMessage } from '../../core/services/auth-errors';

interface SettingsItem {
  label: string;
  labelMarathi: string;
  icon: string;
  route: string;
  badge?: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IconComponent, CustomDialogComponent, FormsModule, AppHeaderComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly businessItems: SettingsItem[] = [
    {
      label: 'Salon Profile',
      labelMarathi: 'सलून प्रोफाइल',
      icon: 'scissors',
      route: '/settings/salon',
    },
    {
      label: 'Team & Permissions',
      labelMarathi: 'टीम आणि परवानग्या',
      icon: 'user',
      route: '/employees',
    },
    {
      label: 'Services & Pricing',
      labelMarathi: 'सेवा आणि किंमत',
      icon: 'scissors',
      route: '/catalog/services',
    },
    {
      label: 'Payments',
      labelMarathi: 'पेमेंट',
      icon: 'rupee',
      route: '/payments',
    },
    {
      label: 'Language',
      labelMarathi: 'भाषा',
      icon: 'settings',
      route: '/settings/salon',
      badge: 'EN / मर',
    },
  ];

  readonly appItems: SettingsItem[] = [
    { label: 'Notifications', labelMarathi: 'सूचना', icon: 'bell', route: '/notifications' },
    { label: 'Reports & Analytics', labelMarathi: 'अहवाल', icon: 'chart', route: '/reports' },
    { label: 'Daily Closing', labelMarathi: 'दैनिक बंद', icon: 'check', route: '/closing' },
  ];

  readonly visibleBusinessItems = computed(() =>
    this.businessItems.filter((i) => this.store.canAccess(i.route)),
  );
  readonly visibleAppItems = computed(() =>
    this.appItems.filter((i) => this.store.canAccess(i.route)),
  );

  navigateTo(route: string): void {
    this.router.navigateByUrl(route);
  }

  readonly fullName = signal(this.store.currentUser().name);
  readonly selectedTheme = signal<'light' | 'dark'>('light');
  readonly selectedLanguage = signal<'en' | 'mar'>('en');
  readonly notificationsEnabled = signal(false);
  readonly buildNumber = signal('1.0.0');
  readonly mobile = signal(this.store.profilePhone());
  readonly showOtpDialog = signal(false);
  readonly pendingMobile = signal('');
  readonly otp = signal('');
  readonly mobileVerified = computed(() => {
    const confirmed = this.store.auth.session()?.user.phone_confirmed_at;
    const phone = this.store.auth.session()?.user.phone ?? '';
    return !!confirmed && phone === toE164(this.mobile());
  });
  async saveProfile() {
    try {
      await this.store.updateProfile(this.fullName(), this.mobile());
      this.mobile.set(this.store.profilePhone());
      this.store.error.set('');
    } catch (e) {
      this.store.error.set(this.store.message(e));
    }
  }
  /** Saves the number, then asks Supabase to send a verification code to it. */
  async startMobileVerification() {
    try {
      await this.store.updateProfile(this.fullName(), this.mobile());
      const phone = this.store.profilePhone();
      if (!phone) throw new Error('Save a mobile number first.');
      await this.store.auth.linkMobile(phone);
      this.pendingMobile.set(phone);
      this.otp.set('');
      this.showOtpDialog.set(true);
      this.toast.success(`Verification code sent to ${phone}.`);
    } catch (e) {
      this.store.error.set(otpErrorMessage(e));
    }
  }
  async confirmMobileVerification() {
    try {
      if (!/^\d{6}$/.test(this.otp().trim()))
        throw new Error('Enter the 6-digit code from the SMS.');
      await this.store.auth.confirmLinkedMobile(this.pendingMobile(), this.otp());
      this.showOtpDialog.set(false);
      this.store.error.set('');
      this.toast.success('Mobile verified for OTP password reset.', 'Verified');
    } catch (e) {
      this.store.error.set(otpErrorMessage(e));
    }
  }
  async logout() {
    try {
      await this.store.logout();
      await this.router.navigateByUrl('/auth/login');
    } catch (e) {
      this.store.error.set(this.store.message(e));
    }
  }

  toggleLanguage(): void {
    this.i18n.toggleLanguage();
  }
}
