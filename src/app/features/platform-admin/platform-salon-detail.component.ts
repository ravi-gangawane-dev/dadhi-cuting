import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SalonRow } from '../../core/data-access/database.types';
import { SupabaseService } from '../../core/data-access/supabase.service';
import {
  PlatformDataService,
  PlatformMemberRow,
} from '../../core/data-access/platform-data.service';
import { FeatureAccessService } from '../../core/services/feature-access.service';
import { ToastService } from '../../core/services/toast.service';

interface FlagRow {
  key: string;
  label: string;
  lifecycle: string;
  platform_enabled: boolean;
}

@Component({
  selector: 'app-platform-salon-detail',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <a routerLink="/platform-admin/salons" class="text-xs font-bold underline text-[var(--color-text-secondary)]">← All salons</a>
    @if (loading()) {
      <p role="status" class="text-xs text-[var(--color-text-secondary)] mt-3">Loading salon…</p>
    } @else if (error()) {
      <p role="alert" class="mt-3 text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{{ error() }}</p>
    } @else {
      <h1 class="text-lg font-black mt-2">{{ salon()?.name }}</h1>
      <p class="text-xs text-[var(--color-text-secondary)]">
        {{ salon()?.timezone }} · {{ salon()?.language === 'mr' ? 'Marathi' : 'English' }} · created {{ created() }}
      </p>
      <p class="text-xs text-[var(--color-text-secondary)] mt-1">{{ salon()?.phone }} {{ salon()?.address }}</p>

      <section class="mt-5">
        <h2 class="text-sm font-black mb-2">Owners &amp; provisioning</h2>
        <form class="bg-white rounded-2xl border border-black/10 p-4 flex flex-wrap gap-2 items-end" (ngSubmit)="inviteOwner()">
          <label class="flex-1 min-w-[220px] text-xs font-bold">
            New owner email
            <input type="email" required class="w-full mt-1 text-sm rounded-xl border border-black/10 px-3 py-2" [ngModel]="ownerEmail" (ngModelChange)="ownerEmail = $event" name="ownerEmail" placeholder="owner@example.com" />
          </label>
          <button type="submit" class="text-xs font-black px-4 py-2 rounded-xl bg-[var(--color-text-primary)] text-[#F0D4A1]" [disabled]="busy()">
            {{ busy() ? 'Working…' : 'Invite owner' }}
          </button>
        </form>
        <p class="text-[10px] text-[var(--color-text-secondary)] mt-1">
          Sends an activation invite and records the ownership grant once the account exists.
          Requires the deployed <code>platform-admin-ops</code> Edge Function.
        </p>
        @if (ownerMessage()) {
          <p class="text-xs font-bold mt-2" [class]="success() ? 'text-emerald-700' : 'text-red-600'">{{ ownerMessage() }}</p>
        }
      </section>

      <section class="mt-5">
        <h2 class="text-sm font-black mb-2">Memberships ({{ members().length }})</h2>
        <div class="bg-white rounded-2xl border border-black/10 divide-y divide-black/5">
          @for (m of members(); track m.user_id + m.salon_id) {
            <div class="p-3 flex flex-wrap items-center gap-2">
              <div class="mr-auto">
                <p class="text-xs font-bold">{{ m.name || m.user_id }}</p>
                <p class="text-[10px] text-[var(--color-text-secondary)]">{{ m.phone || 'no phone' }}</p>
              </div>
              <span class="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-black/5">{{ m.role }}</span>
              <span class="text-[10px] font-black uppercase px-2 py-1 rounded-full"
                [class]="m.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'">
                {{ m.active ? 'active' : 'suspended' }}
              </span>
            </div>
          } @empty {
            <p class="p-4 text-xs text-[var(--color-text-secondary)]">No memberships.</p>
          }
        </div>
      </section>

      <section class="mt-5 mb-8">
        <h2 class="text-sm font-black mb-2">Feature entitlements</h2>
        <p class="text-[10px] text-[var(--color-text-secondary)] mb-2">
          Untouched flags inherit the platform default. Overrides are enforced by database policies and RPCs, not just the UI.
        </p>
        <div class="bg-white rounded-2xl border border-black/10 divide-y divide-black/5">
          @for (f of registry(); track f.key) {
            <div class="p-3 flex flex-wrap items-center gap-2">
              <div class="mr-auto">
                <p class="text-xs font-bold">{{ f.label }}</p>
                <p class="text-[10px] text-[var(--color-text-secondary)]">
                  {{ f.lifecycle }} · platform {{ f.platform_enabled ? 'available' : 'unavailable' }}
                  @if (overrideLabel(f.key)) {
                    · salon override: {{ overrideLabel(f.key) }}
                  }
                </p>
              </div>
              @if (f.lifecycle === 'enabled' || f.lifecycle === 'beta') {
                @if (overridden(f.key)) {
                  <button type="button" class="text-[10px] font-black px-2 py-1 rounded-lg border border-black/10" (click)="clearOverride(f.key)">
                    Reset to inherit
                  </button>
                } @else {
                  <button type="button" class="text-[10px] font-black px-2 py-1 rounded-lg border border-black/10" (click)="setOverride(f.key, false)">
                    Disable here
                  </button>
                }
              } @else {
                <span class="text-[10px] text-[var(--color-text-secondary)]">not platform-available</span>
              }
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class PlatformSalonDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly data = inject(PlatformDataService);
  private readonly client = inject(SupabaseService).client;
  private readonly flags = inject(FeatureAccessService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly salon = signal<SalonRow | null>(null);
  readonly members = signal<PlatformMemberRow[]>([]);
  readonly registry = signal<FlagRow[]>([]);
  readonly overrides = signal<Map<string, boolean>>(new Map());
  readonly ownerMessage = signal('');
  readonly success = signal(false);
  readonly busy = signal(false);
  ownerEmail = '';

  ngOnInit(): void {
    void this.init();
  }

  async init(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.loading.set(true);
    this.error.set('');
    try {
      const [salon, members, flags, overrides] = await Promise.all([
        this.data.salon(id),
        this.data.memberships(id),
        this.data.flags(),
        this.data.salonOverrides(id),
      ]);
      this.salon.set(salon);
      this.members.set(members);
      this.registry.set(flags);
      this.overrides.set(overrides);
    } catch (e) {
      this.error.set(this.data.message(e));
    } finally {
      this.loading.set(false);
    }
  }

  created(): string {
    return this.salon()
      ? new Date(this.salon()!.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })
      : '';
  }

  overridden(key: string): boolean {
    return this.overrides().has(key);
  }

  overrideLabel(key: string): string {
    const value = this.overrides().get(key);
    if (value === undefined) return '';
    return value ? 'enabled' : 'disabled';
  }

  async setOverride(key: string, enabled: boolean | null): Promise<void> {
    const salonId = this.salon()?.id;
    if (!salonId) return;
    try {
      await this.flags.setSalonFeature(salonId, key, enabled);
      const next = new Map(this.overrides());
      if (enabled === null) next.delete(key);
      else next.set(key, enabled);
      this.overrides.set(next);
      this.toast.success('Salon entitlement updated');
    } catch (e) {
      this.toast.error(this.flags.error(e));
    }
  }

  async clearOverride(key: string): Promise<void> {
    await this.setOverride(key, null);
  }

  /** Server-side owner provisioning. The browser has no admin rights itself. */
  async inviteOwner(): Promise<void> {
    const salonId = this.salon()?.id;
    const email = this.ownerEmail.trim();
    if (!salonId || !email) return;
    this.busy.set(true);
    this.ownerMessage.set('');
    try {
      const { data, error } = await this.client.functions.invoke('platform-admin-ops', {
        body: { action: 'invite_owner', salonId, email },
      });
      const result = (data ?? {}) as { error?: string; already_owner?: boolean };
      if (error) throw new Error(String(error.message));
      if (result.error) throw new Error(result.error);
      this.success.set(true);
      this.ownerMessage.set(
        result.already_owner
          ? 'This user already owns this salon.'
          : 'Invitation sent; ownership is recorded once they accept.',
      );
      this.ownerEmail = '';
      this.members.set(await this.data.memberships(salonId));
    } catch (e) {
      this.success.set(false);
      this.ownerMessage.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
