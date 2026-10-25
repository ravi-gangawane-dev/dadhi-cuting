import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformAuthService } from '../../core/services/platform-auth.service';
import { Router } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';

/**
 * Mandatory TOTP enrollment for platform administration. Reaching this page
 * already requires a signed-in platform administrator; proceeding requires
 * proving a second factor, after which the portal unlocks.
 */
@Component({
  selector: 'app-platform-mfa',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center p-4">
      <div class="w-full max-w-sm bg-white rounded-2xl border border-black/10 p-6">
        <h1 class="text-base font-black">Two-factor authentication required</h1>
        <p class="text-xs text-[var(--color-text-secondary)] mt-1">
          Platform administration requires an authenticator app (TOTP). Start enrollment, scan the
          code with your authenticator, then confirm the 6-digit code.
        </p>

        @if (qr()) {
          <img [src]="qr()" alt="Authenticator QR code" class="mx-auto my-4 w-44 h-44 rounded-xl border border-black/10 bg-white p-2" />
        }

        <label class="block text-xs font-bold mt-2">
          6-digit code
          <input
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            class="w-full mt-1 text-sm rounded-xl border border-black/10 px-3 py-2 tracking-widest"
            [(ngModel)]="code"
            name="code"
          />
        </label>

        @if (error()) {
          <p role="alert" class="text-xs font-bold text-red-600 mt-2">{{ error() }}</p>
        }

        <button
          type="button"
          class="mt-3 w-full text-xs font-black py-3 rounded-xl bg-[var(--color-text-primary)] text-[#F0D4A1] disabled:opacity-50"
          [disabled]="busy() || !qr() || code().length < 6"
          (click)="verify()"
        >
          {{ busy() ? 'Verifying…' : 'Confirm enrollment' }}
        </button>
        <button
          type="button"
          class="mt-2 w-full text-xs font-bold py-2 rounded-xl disabled:opacity-50"
          [disabled]="busy() || qr()"
          (click)="enroll()"
        >
          {{ qr() ? 'Code shown above' : 'Start enrollment' }}
        </button>
        <button type="button" class="mt-4 w-full text-xs text-[var(--color-text-secondary)] underline" (click)="signOut()">
          Use a different account
        </button>
      </div>
    </div>
  `,
})
export class PlatformMfaComponent {
  private readonly platform = inject(PlatformAuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly qr = signal('');
  readonly code = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  private factorId = '';

  async enroll(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const { id, qr } = await this.platform.enrollTotp();
      this.factorId = id;
      this.qr.set(qr);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Enrollment failed');
    } finally {
      this.busy.set(false);
    }
  }

  async verify(): Promise<void> {
    if (!this.factorId) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.platform.verifyEnrollment(this.factorId, this.code());
      this.toast.success('Authenticator enrolled');
      this.router.navigateByUrl('/platform-admin');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.platform.signOut();
    this.router.navigateByUrl('/auth/login');
  }
}
