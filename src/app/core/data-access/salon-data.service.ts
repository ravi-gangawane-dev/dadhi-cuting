import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Database, ReportSummary, Tables } from './database.types';

@Injectable({ providedIn: 'root' })
export class SalonDataService {
  readonly client = inject(SupabaseService).client;
  async list<K extends keyof Tables>(table: K, salon: string): Promise<Tables[K][]> {
    // Explicit pages avoid silently truncated PostgREST responses. Large customer
    // searches use customersPage; aggregates use report_summary, not this cache.
    const result: Tables[K][] = [];
    for (let offset = 0; ; offset += 500) {
      const query = this.client
        .from(table)
        .select('*')
        .eq('salon_id' as never, salon)
        .order('id')
        .range(offset, offset + 499);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data as unknown as Tables[K][];
      result.push(...rows);
      if (rows.length < 500) return result;
    }
  }
  async insert<K extends keyof Tables>(table: K, row: Partial<Tables[K]>): Promise<Tables[K]> {
    const { data, error } = await this.client
      .from(table)
      .insert(row as never)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Tables[K];
  }
  async update<K extends keyof Tables>(
    table: K,
    id: string,
    salon: string,
    changes: Partial<Tables[K]>,
  ): Promise<void> {
    let query = this.client
      .from(table)
      .update(changes as never)
      .eq('id' as never, id);
    if (table !== 'salons') query = query.eq('salon_id' as never, salon);
    const { data, error } = await query.select('id').single();
    if (error) throw error;
    if (!data) throw new Error('Record is unavailable or access was denied.');
  }
  async remove<K extends keyof Tables>(table: K, id: string, salon: string): Promise<void> {
    const { data, error } = await this.client
      .from(table)
      .delete()
      .eq('id' as never, id)
      .eq('salon_id' as never, salon)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Record is unavailable or access was denied.');
  }
  async rpc<K extends keyof Database['public']['Functions']>(
    name: K,
    args: Database['public']['Functions'][K]['Args'],
  ) {
    const { data, error } = await this.client.rpc(name, args as never);
    if (error) throw error;
    return data;
  }
  async report(salon: string, from: string, to: string): Promise<ReportSummary> {
    return (await this.rpc('report_summary', {
      p_salon: salon,
      p_from: from,
      p_to: to,
    })) as unknown as ReportSummary;
  }
  async customersPage(salon: string, search = '', page = 0, pageSize = 25) {
    const term = search.replace(/[%_(),.\\]/g, '').slice(0, 100);
    let q = this.client.from('customers').select('*', { count: 'exact' }).eq('salon_id', salon);
    if (term) q = q.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
    const { data, error, count } = await q
      .order('full_name')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    return { rows: data, total: count ?? 0 };
  }
}
