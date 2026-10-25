import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from '../data-access/supabase.service';
import { toE164 } from './mobile';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = inject(SupabaseService).client;
  readonly session = signal<Session | null>(null);
  readonly recovery = signal(false);
  readonly loggedIn = computed(() => !!this.session());
  readonly ready: Promise<void>;

  constructor() {
    const { data: listener } = this.client.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (event === 'PASSWORD_RECOVERY') this.recovery.set(true);
      if (event === 'SIGNED_OUT') this.recovery.set(false);
    });
    inject(DestroyRef).onDestroy(()=>listener.subscription.unsubscribe());
    this.ready = this.client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      this.session.set(data.session);
    });
    // Guards and login surface errors; prevent an unhandled startup rejection.
    void this.ready.catch(() => {});
  }
  /** Accepts an email address or a 10-digit mobile number. */
  async login(identifier: string, password: string) {
    const value = identifier.trim();
    const email = value.includes('@') ? value : await this.emailForMobile(value);
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  /**
   * Creates an email/password account. `session` is null when the project still
   * requires the confirmation email to be opened first.
   */
  async signUp(input: { email: string; password: string; fullName: string }) {
    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: { full_name: input.fullName.trim() },
        // Honoured only when the origin is in the project's redirect allowlist;
        // the confirmation link then lands back on the sign-in screen.
        emailRedirectTo: `${location.origin}/auth/login`,
      },
    });
    if (error) throw error;
    return data;
  }
  private async emailForMobile(mobile: string): Promise<string> {
    const { data, error } = await this.client.rpc('email_for_mobile', { p_mobile: mobile });
    if (error) throw error;
    if (!data) throw new Error('No account found for that mobile number.');
    return data as string;
  }
  async logout() {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.session.set(null);
  }
  /** Sends a one-time code to a mobile number already verified for this account. */
  async sendMobileOtp(mobile: string) {
    const { error } = await this.client.auth.signInWithOtp({
      phone: toE164(mobile),
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
  }
  /** Verifies the code and returns the recovery session used to set a new password. */
  async verifyMobileOtp(mobile: string, token: string) {
    const { error } = await this.client.auth.verifyOtp({
      phone: toE164(mobile),
      token: token.trim(),
      type: 'sms',
    });
    if (error) throw error;
  }
  /** Email OTP: works without a redirect allowlist, unlike a reset link. */
  async sendEmailOtp(email: string) {
    const { error } = await this.client.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
  }
  async verifyEmailOtp(email: string, token: string) {
    const { error } = await this.client.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    });
    if (error) throw error;
  }
  /** Attaches a mobile to the signed-in account and sends the verification code. */
  async linkMobile(mobile: string) {
    const { error } = await this.client.auth.updateUser({ phone: toE164(mobile) });
    if (error) throw error;
  }
  async confirmLinkedMobile(mobile: string, token: string) {
    const { error } = await this.client.auth.verifyOtp({
      phone: toE164(mobile),
      token: token.trim(),
      type: 'phone_change',
    });
    if (error) throw error;
  }
  async resetPassword(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/login?recovery=1`,
    });
    if (error) throw error;
  }
  async updatePassword(password: string) {
    if (password.length < 8) throw new Error('Use at least 8 characters.');
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
    this.recovery.set(false);
  }
}
