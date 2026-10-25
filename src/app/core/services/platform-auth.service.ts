import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from '../data-access/supabase.service';

/**
 * Platform administration identity. The browser can only ask the database
 * "is this signed-in user a platform administrator?" through the backend
 * function `is_platform_admin`; the list itself is never exposed. MFA is
 * required before any platform route opens (AAL2, TOTP).
 */
@Injectable({ providedIn: 'root' })
export class PlatformAuthService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  /** null = not determined yet; true/false = backend verdict. */
  readonly isAdmin = signal<boolean | null>(null);
  readonly mfaReady = signal(false);
  readonly checking = signal(false);

  readonly accessState = computed<'unknown' | 'not-admin' | 'mfa-needed' | 'allowed'>(
    () => {
      if (this.isAdmin() !== true) return this.isAdmin() === false ? 'not-admin' : 'unknown';
      return this.mfaReady() ? 'allowed' : 'mfa-needed';
    },
  );

  /** Re-derives admin status and MFA assurance for the current session. */
  async refresh(): Promise<void> {
    const session = this.auth.session();
    if (!session) {
      this.isAdmin.set(false);
      this.mfaReady.set(false);
      return;
    }
    this.checking.set(true);
    try {
      const [{ data: admin, error }, assurance] = await Promise.all([
        this.client.rpc('is_platform_admin'),
        this.client.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (error) throw error;
      this.isAdmin.set(admin === true);
      const level = assurance.data?.currentLevel ?? 'aal1';
      this.mfaReady.set(level === 'aal2');
    } finally {
      this.checking.set(false);
    }
  }

  /** Called after MFA enrollment/verification so guards re-evaluate. */
  async reassessMfa(): Promise<void> {
    const assurance = await this.client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    this.mfaReady.set((assurance.data.currentLevel ?? 'aal1') === 'aal2');
  }

  async signOut(): Promise<void> {
    await this.auth.logout();
    this.isAdmin.set(false);
    this.mfaReady.set(false);
  }

  /** TOTP enrollment for platform administration. */
  async enrollTotp(friendlyName = 'DadhiCutting Platform'): Promise<{ id: string; qr: string }> {
    const { data, error } = await this.client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    });
    if (error) throw error;
    const factor = data as { id: string; totp: { qr_code?: string } };
    if (!factor?.totp?.qr_code) throw new Error('Authenticator enrollment returned no QR code.');
    return { id: factor.id, qr: factor.totp.qr_code };
  }

  async verifyEnrollment(factorId: string, code: string): Promise<void> {
    const { data: challenge, error } = await this.client.auth.mfa.challenge({ factorId });
    if (error) throw error;
    const { error: verifyError } = await this.client.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.replace(/\s/g, ''),
    });
    if (verifyError) throw verifyError;
    await this.reassessMfa();
  }

  /** Verified TOTP factors already registered for this identity. */
  async verifiedFactors(): Promise<{ id: string; friendlyName: string }[]> {
    const { data, error } = await this.client.auth.mfa.listFactors();
    if (error) throw error;
    return (data?.totp ?? [])
      .filter((f) => f.status === 'verified')
      .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? '' }));
  }

  /**
   * Re-login path: prove possession of an already-registered authenticator.
   * A fresh session starts at aal1; a verified challenge raises it to aal2.
   */
  async challengeVerified(factorId: string, code: string): Promise<void> {
    const { data: challenge, error } = await this.client.auth.mfa.challenge({ factorId });
    if (error) throw error;
    const { error: verifyError } = await this.client.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.replace(/\s/g, ''),
    });
    if (verifyError) throw verifyError;
    await this.reassessMfa();
  }
}
