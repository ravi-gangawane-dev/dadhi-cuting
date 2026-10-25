import { Component, OnInit, inject, signal } from '@angular/core';
import { PlatformDataService } from '../../core/data-access/platform-data.service';
import { FeatureAccessService } from '../../core/services/feature-access.service';
import { FeatureFlagRow } from '../../core/data-access/database.types';
import { IconComponent } from '../../shared/components/icon/icon.component';

interface PlatformCounts {
  salons: number;
  members: number;
  staff: number;
  customers: number;
  admins: number;
  featuresAvailable: number;
  featuresPlanned: number;
}

@Component({
  selector: 'app-platform-dashboard',
  standalone: true,
  imports: [IconComponent],
  template: `
    <h1 class="text-lg font-black mb-1">Platform overview</h1>
    <p class="text-xs text-[var(--color-text-secondary)] mb-4">
      Every figure below is a live database aggregation restricted to platform administrators.
    </p>

    @if (loading()) {
      <p role="status" class="text-xs text-[var(--color-text-secondary)]">Loading platform figures…</p>
    } @else if (error()) {
      <p role="alert" class="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{{ error() }}</p>
      <button type="button" class="mt-2 text-xs font-bold underline" (click)="load()">Retry</button>
    } @else {
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        @for (card of cards(); track card.label) {
          <div class="bg-white rounded-2xl border border-black/10 p-4">
            <div class="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center mb-2">
              <app-icon [name]="card.icon" [size]="16" />
            </div>
            <p class="text-xl font-black leading-none">{{ card.value }}</p>
            <p class="text-[11px] text-[var(--color-text-secondary)] mt-1">{{ card.label }}</p>
          </div>
        }
      </div>
    }
  `,
})
export class PlatformDashboardComponent implements OnInit {
  private readonly data = inject(PlatformDataService);
  private readonly flags = inject(FeatureAccessService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly counts = signal<PlatformCounts | null>(null);
  readonly registry = signal<FeatureFlagRow[]>([]);

  readonly cards = signal<{ label: string; value: string | number; icon: string }[]>([]);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [salons, members, staff, customers, admins, flags] = await Promise.all([
        this.data.count('salons'),
        this.data.count('salon_members'),
        this.data.count('employees'),
        this.data.count('customers'),
        this.data.count('platform_admins'),
        this.data.flags(),
      ]);
      this.registry.set(flags);
      this.counts.set({
        salons,
        members,
        staff,
        customers,
        admins,
        featuresAvailable: flags.filter((f) => f.platform_enabled && f.lifecycle !== 'planned' && f.lifecycle !== 'deprecated').length,
        featuresPlanned: flags.filter((f) => f.lifecycle === 'planned').length,
      });
      const c = this.counts();
      if (c) {
        this.cards.set([
          { label: 'Salons on the platform', value: c.salons, icon: 'server' },
          { label: 'Salon memberships', value: c.members, icon: 'users' },
          { label: 'Staff records', value: c.staff, icon: 'scissors' },
          { label: 'Customers across salons', value: c.customers, icon: 'user' },
          { label: 'Platform administrators', value: c.admins, icon: 'shield' },
          { label: 'Features available', value: c.featuresAvailable, icon: 'flag' },
          { label: 'Features planned', value: c.featuresPlanned, icon: 'clock' },
        ]);
      }
    } catch (e) {
      this.error.set(this.data.message(e));
    } finally {
      this.loading.set(false);
    }
  }
}
