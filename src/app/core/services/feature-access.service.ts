import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../data-access/supabase.service';

export interface FeatureStatus {
  label: string;
  description: string;
  lifecycle: 'planned' | 'beta' | 'enabled' | 'disabled' | 'deprecated';
  platformEnabled: boolean;
  available: boolean;
  entitled: boolean;
}
export type FeatureStateMap = Record<string, FeatureStatus>;

/**
 * Backend-driven feature access for the signed-in salon member. Reads the
 * server evaluation (`feature_state`): lifecycle + platform availability +
 * salon entitlement. Nothing here decides access locally; the database does.
 *
 * Notice: different salons can be attached to one platform-admin account, but
 * normal members always read only their own salon.
 */
@Injectable({ providedIn: 'root' })
export class FeatureAccessService {
  private readonly client = inject(SupabaseService).client;
  readonly flags = signal<FeatureStateMap>({});
  readonly loadedFor = signal('');
  readonly loading = signal(false);
  readonly lastDenied = signal('');

  get(key: string): FeatureStatus | undefined {
    return this.flags()[key];
  }

  async enabled(key: string): Promise<boolean> {
    const known = this.flags()[key];
    if (known || this.loadedFor()) return known?.available ?? false;
    await this.ensureLoaded();
    return this.flags()[key]?.available ?? false;
  }

  /** Ensures the flag map is loaded for a salon; reloads when the salon changes. */
  async ensureLoaded(salonId?: string): Promise<void> {
    const target = salonId ?? this.loadedFor();
    if (!target) return;
    if (this.loadedFor() === target && Object.keys(this.flags()).length) return;
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await this.reload(target);
    } finally {
      this.loading.set(false);
    }
  }

  async reload(salonId: string): Promise<void> {
    const { data, error } = await this.client.rpc('feature_state', {
      p_salon: salonId,
    });
    if (error) throw error;
    this.flags.set((data as unknown as FeatureStateMap) ?? {});
    this.loadedFor.set(salonId);
  }

  /** Super Admin only; the database rejects everyone else. */
  async setPlatformFlag(key: string, platformEnabled: boolean | null, lifecycle: string | null) {
    const { error } = await this.client.rpc('platform_feature_set', {
      p_key: key,
      p_platform_enabled: platformEnabled,
      p_lifecycle: lifecycle,
    });
    if (error) throw error;
  }

  /** Super Admin only. `enabled = null` clears the salon override. */
  async setSalonFeature(salonId: string, key: string, enabled: boolean | null) {
    const { error } = await this.client.rpc('platform_salon_feature', {
      p_salon: salonId,
      p_key: key,
      p_enabled: enabled,
    });
    if (error) throw error;
  }

  error(e: unknown): string {
    return e && typeof e === 'object' && 'message' in e
      ? String((e as { message: unknown }).message)
      : 'Unable to complete the request.';
  }
}
