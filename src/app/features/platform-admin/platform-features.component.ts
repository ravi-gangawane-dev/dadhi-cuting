import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FeatureFlagRow } from '../../core/data-access/database.types';
import { PlatformDataService } from '../../core/data-access/platform-data.service';
import { FeatureAccessService } from '../../core/services/feature-access.service';
import { ToastService } from '../../core/services/toast.service';

const LIFECYCLES = ['planned', 'beta', 'enabled', 'disabled', 'deprecated'] as const;

@Component({
  selector: 'app-platform-features',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1 class="text-lg font-black mb-1">Feature flags</h1>
    <p class="text-xs text-[var(--color-text-secondary)] mb-4">
      Lifecycle state and platform availability are controlled here only. A flag cannot make an
      unfinished module usable: the backend gates every feature by lifecycle + availability +
      salon entitlement + user permission.
    </p>
    @if (loading()) {
      <p role="status" class="text-xs text-[var(--color-text-secondary)]">Loading registry…</p>
    } @else if (error()) {
      <p role="alert" class="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{{ error() }}</p>
    } @else {
      <div class="bg-white rounded-2xl border border-black/10 divide-y divide-black/5">
        @for (f of registry(); track f.key) {
          <div class="p-3 flex flex-wrap items-center gap-2">
            <div class="mr-auto">
              <p class="text-xs font-bold">{{ f.label }}</p>
              <p class="text-[10px] text-[var(--color-text-secondary)]">{{ f.description || f.key }}</p>
            </div>
            <label class="text-[10px] font-bold">
              Lifecycle
              <select
                class="block mt-0.5 text-xs rounded-lg border border-black/10 px-2 py-1"
                [ngModel]="f.lifecycle"
                (change)="setLifecycle(f, $any($event.target).value)"
              >
                @for (l of lifecycles; track l) {
                  <option [value]="l" [selected]="l === f.lifecycle">{{ l }}</option>
                }
              </select>
            </label>
            <label class="flex items-center gap-1 text-[10px] font-bold cursor-pointer">
              <input
                type="checkbox"
                [checked]="f.platform_enabled"
                (change)="setAvailability(f, $any($event.target).checked)"
              />
              platform available
            </label>
          </div>
        }
      </div>
    }
  `,
})
export class PlatformFeaturesComponent implements OnInit {
  private readonly data = inject(PlatformDataService);
  private readonly flags = inject(FeatureAccessService);
  private readonly toast = inject(ToastService);
  protected readonly lifecycles = LIFECYCLES;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly registry = signal<FeatureFlagRow[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.registry.set(await this.data.flags());
    } catch (e) {
      this.error.set(this.data.message(e));
    } finally {
      this.loading.set(false);
    }
  }

  async setLifecycle(flag: FeatureFlagRow, lifecycle: string): Promise<void> {
    try {
      await this.flags.setPlatformFlag(flag.key, null, lifecycle);
      this.toast.success(`${flag.label} lifecycle set to ${lifecycle}`);
      await this.load();
    } catch (e) {
      this.toast.error(this.flags.error(e));
      await this.load();
    }
  }

  async setAvailability(flag: FeatureFlagRow, platformEnabled: boolean): Promise<void> {
    try {
      await this.flags.setPlatformFlag(flag.key, platformEnabled, null);
      this.toast.success(`${flag.label} platform availability ${platformEnabled ? 'enabled' : 'disabled'}`);
      await this.load();
    } catch (e) {
      this.toast.error(this.flags.error(e));
      await this.load();
    }
  }
}
