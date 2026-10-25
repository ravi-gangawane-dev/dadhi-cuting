import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { FeatureFlagRow, MemberRow, PlatformAuditRow, SalonRow, Tables } from './database.types';

export interface PlatformMemberRow {
  user_id: string;
  role: string;
  active: boolean;
  salon_id: string;
  salon_name: string;
  name: string;
  phone: string;
  created_at: string;
}
export interface PlatformStaffRow {
  id: string;
  salon_id: string;
  salon_name: string;
  full_name: string;
  phone: string;
  active: boolean;
  user_id: string | null;
  created_at: string;
}
export interface SalonListRow extends SalonRow {
  owner_names: string[];
  staff_count: number;
  customer_count: number;
}
export interface Page<T> {
  rows: T[];
  total: number;
}

/**
 * Typed, backend-driven access for the platform portal. Every table here is
 * protected by RLS so these queries only succeed for a confirmed platform
 * administrator session (see platform_read_* policies).
 */
@Injectable({ providedIn: 'root' })
export class PlatformDataService {
  private readonly client = inject(SupabaseService).client;

  /** Exact counts, single round trip, no rows transferred. */
  async count(
    table: keyof Tables,
    filters?: { column: string; value: unknown }[],
  ): Promise<number> {
    let q = this.client.from(table).select('id', { count: 'exact', head: true });
    for (const f of filters ?? []) q = q.eq(f.column, f.value as never);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  }

  /** Salons with owners, staff counts and customer counts merged in TypeScript. */
  async salons(page = 0, pageSize = 25, search = ''): Promise<Page<SalonListRow>> {
    const term = search.replace(/[%_(),.\\]/g, '').slice(0, 100);
    let q = this.client
      .from('salons')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id');
    if (term) q = q.ilike('name', `%${term}%`);
    const { data, error, count } = await q.range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as SalonRow[];
    if (!rows.length) return { rows: [], total: count ?? 0 };
    const salonIds = rows.map((r) => r.id);
    const membersResult = await this.client
      .from('salon_members')
      .select('salon_id,user_id,role')
      .eq('role', 'owner')
      .in('salon_id', salonIds);
    const staffResult = await this.client.from('employees').select('salon_id,user_id').in('salon_id', salonIds);
    const customersResult = await this.client.from('customers').select('salon_id,id').in('salon_id', salonIds);
    if (membersResult.error) throw membersResult.error;
    if (staffResult.error) throw staffResult.error;
    if (customersResult.error) throw customersResult.error;
    const ownerRows = (membersResult.data ?? []) as Pick<MemberRow, 'salon_id' | 'user_id'>[];
    const profiles = new Map<string, string>();
    const userIds = [...new Set(ownerRows.map((o) => o.user_id))];
    if (userIds.length) {
      const { data: profileRows, error: profileError } = await this.client
        .from('user_profiles')
        .select('id,full_name')
        .in('id', userIds);
      if (profileError) throw profileError;
      for (const p of (profileRows ?? []) as { id: string; full_name: string }[]) {
        profiles.set(p.id, p.full_name);
      }
    }
    const list = rows.map((salon) => ({
      ...salon,
      owner_names: ownerRows
        .filter((o) => o.salon_id === salon.id)
        .map((o) => profiles.get(o.user_id) ?? o.user_id),
      staff_count:
        (staffResult.data as { salon_id: string }[]).filter((s) => s.salon_id === salon.id).length,
      customer_count:
        (customersResult.data as { salon_id: string }[]).filter((c) => c.salon_id === salon.id)
          .length,
    }));
    return { rows: list, total: count ?? 0 };
  }

  async salon(id: string): Promise<SalonRow> {
    const { data, error } = await this.client.from('salons').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  /** All memberships across the platform (or one salon) with profile names. */
  async memberships(salonId?: string): Promise<PlatformMemberRow[]> {
    let q = this.client
      .from('salon_members')
      .select('user_id,role,active,salon_id,created_at')
      .order('created_at', { ascending: false });
    if (salonId) q = q.eq('salon_id', salonId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as {
      user_id: string;
      role: string;
      active: boolean;
      salon_id: string;
      created_at: string;
    }[];
    if (!rows.length) return [];
    const [{ data: salonRows, error: salonError }, profiles] = await Promise.all([
      this.client
        .from('salons')
        .select('id,name')
        .in('id', [...new Set(rows.map((r) => r.salon_id))]),
      this.profiles(rows.map((r) => r.user_id)),
    ]);
    if (salonError) throw salonError;
    const salonNames = new Map(
      ((salonRows ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
    );
    return rows.map((r) => ({
      ...r,
      salon_name: salonNames.get(r.salon_id) ?? r.salon_id,
      name: profiles.get(r.user_id)?.full_name ?? '',
      phone: profiles.get(r.user_id)?.phone ?? '',
    }));
  }

  async staff(salonId?: string): Promise<PlatformStaffRow[]> {
    let q = this.client
      .from('employees')
      .select('id,salon_id,full_name,phone,active,user_id,created_at')
      .order('created_at', { ascending: false });
    if (salonId) q = q.eq('salon_id', salonId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as {
      id: string;
      salon_id: string;
      full_name: string;
      phone: string;
      active: boolean;
      user_id: string | null;
      created_at: string;
    }[];
    if (!rows.length) return [];
    const [{ data: salonRows, error: salonError }] = await Promise.all([
      this.client
        .from('salons')
        .select('id,name')
        .in('id', [...new Set(rows.map((r) => r.salon_id))]),
    ]);
    if (salonError) throw salonError;
    const salonNames = new Map(
      ((salonRows ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
    );
    return rows.map((r) => ({ ...r, salon_name: salonNames.get(r.salon_id) ?? r.salon_id }));
  }

  async profiles(userIds: string[]): Promise<Map<string, { full_name: string; phone: string }>> {
    const out = new Map<string, { full_name: string; phone: string }>();
    if (!userIds.length) return out;
    const { data, error } = await this.client
      .from('user_profiles')
      .select('id,full_name,phone')
      .in('id', userIds);
    if (error) throw error;
    for (const p of (data ?? []) as { id: string; full_name: string; phone: string }[]) {
      out.set(p.id, { full_name: p.full_name, phone: p.phone });
    }
    return out;
  }

  async flags(): Promise<FeatureFlagRow[]> {
    const { data, error } = await this.client
      .from('feature_flags')
      .select('*')
      .order('sort_order');
    if (error) throw error;
    return (data ?? []) as FeatureFlagRow[];
  }

  async salonOverrides(salonId: string): Promise<Map<string, boolean>> {
    const { data, error } = await this.client
      .from('salon_feature_overrides')
      .select('flag_key,enabled')
      .eq('salon_id', salonId);
    if (error) throw error;
    return new Map(((data ?? []) as { flag_key: string; enabled: boolean }[]).map((o) => [o.flag_key, o.enabled]));
  }

  async audit(page = 0, pageSize = 40): Promise<Page<PlatformAuditRow>> {
    const { data, error, count } = await this.client
      .from('platform_audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    return { rows: (data ?? []) as PlatformAuditRow[], total: count ?? 0 };
  }

  message(e: unknown): string {
    return e && typeof e === 'object' && 'message' in e
      ? String((e as { message: unknown }).message)
      : 'Unable to complete the request.';
  }
}
