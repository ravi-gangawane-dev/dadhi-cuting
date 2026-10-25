import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PlatformAuthService } from '../../core/services/platform-auth.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-platform-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <div class="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <header
        class="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-black/10 bg-white sticky top-0 z-20"
      >
        <div class="flex items-center gap-2 mr-auto">
          <span class="w-8 h-8 rounded-lg bg-[var(--color-text-primary)] text-[#F0D4A1] flex items-center justify-center text-sm font-black">D</span>
          <div>
            <p class="text-sm font-black leading-tight">DadhiCutting Platform</p>
            <p class="text-[10px] text-[var(--color-text-secondary)]">Super Admin console</p>
          </div>
        </div>
        <span class="text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">
          MFA active
        </span>
        <button
          type="button"
          (click)="signOut()"
          class="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl border border-black/10 hover:bg-black/5"
        >
          <app-icon name="logout" [size]="14" /> Sign out
        </button>
      </header>
      <nav class="flex gap-1 overflow-x-auto px-2 py-2 border-b border-black/10 bg-white" aria-label="Platform sections">
        @for (tab of tabs; track tab.path) {
          <a
            [routerLink]="tab.path"
            routerLinkActive="dc-platform-tab-active"
            class="dc-platform-tab whitespace-nowrap"
          >{{ tab.label }}</a>
        }
      </nav>
      <div class="max-w-5xl mx-auto p-4">
        <router-outlet />
      </div>
    </div>
  `,
  styles: [
    `
      .dc-platform-tab {
        padding: 0.5rem 0.9rem;
        border-radius: 0.75rem;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-text-secondary);
      }
      .dc-platform-tab:hover {
        background: rgba(0, 0, 0, 0.05);
      }
      .dc-platform-tab-active {
        background: var(--color-text-primary);
        color: #f0d4a1;
      }
    `,
  ],
})
export class PlatformShellComponent {
  private readonly platform = inject(PlatformAuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly tabs = [
    { path: '/platform-admin', label: 'Dashboard' },
    { path: '/platform-admin/salons', label: 'Salons' },
    { path: '/platform-admin/users', label: 'Platform users' },
    { path: '/platform-admin/features', label: 'Feature flags' },
    { path: '/platform-admin/audit', label: 'Audit logs' },
    { path: '/platform-admin/settings', label: 'Settings' },
  ];

  async signOut(): Promise<void> {
    try {
      await this.platform.signOut();
      this.router.navigateByUrl('/auth/login');
    } catch (e) {
      this.toast.error(this.platformError(e));
    }
  }

  private platformError(e: unknown): string {
    return e instanceof Error ? e.message : 'Unable to complete the request.';
  }
}
