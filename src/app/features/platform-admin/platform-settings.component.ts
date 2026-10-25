import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { PlatformAuthService } from '../../core/services/platform-auth.service';
import { Router } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-platform-settings',
  standalone: true,
  imports: [],
  template: `
    <h1 class="text-lg font-black mb-1">Settings</h1>
    <p class="text-xs text-[var(--color-text-secondary)] mb-4">
      Administrator account controls for this console.
    </p>
    <div class="bg-white rounded-2xl border border-black/10 divide-y divide-black/5">
      <div class="p-4">
        <p class="text-xs font-bold">Account</p>
        <p class="text-xs text-[var(--color-text-secondary)]">{{ email() }}</p>
      </div>
      <div class="p-4">
        <p class="text-xs font-bold">Multi-factor authentication</p>
        <p class="text-xs text-[var(--color-text-secondary)] mt-0.5">
          @if (platform.mfaReady()) {
            Active. This session is verified with a second factor (AAL2).
          } @else {
            Not verified in this session. Enroll or verify from the sign-in screen.
          }
        </p>
        <button
          type="button"
          class="mt-2 text-xs font-bold px-3 py-2 rounded-xl border border-black/10"
          (click)="goEnroll()"
        >
          Manage authenticator
        </button>
      </div>
      <div class="p-4">
        <p class="text-xs font-bold">Identity &amp; bootstrap</p>
        <p class="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
          Platform administrators are provisioned exclusively by the operator bootstrap script
          (<code>scripts/bootstrap-super-admin.mjs</code>) using the service-role key held outside
          the browser. There is no self-service elevation.
        </p>
      </div>
    </div>
  `,
})
export class PlatformSettingsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  readonly platform = inject(PlatformAuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly email = (): string => this.auth.session()?.user.email ?? 'unknown';

  ngOnInit(): void {
    void this.platform.refresh();
  }

  goEnroll(): void {
    this.router.navigateByUrl('/platform-admin/mfa');
  }

  async signOutEverywhere(): Promise<void> {
    // Token revocation for every device requires the service-role session
    // revoke endpoint and is part of the operator script; see
    // reports/SUPABASE_SECURITY_REPORT.md. Here we end this session only.
    try {
      await this.platform.signOut();
      this.toast.success('Signed out');
      this.router.navigateByUrl('/auth/login');
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Unable to sign out');
    }
  }
}
