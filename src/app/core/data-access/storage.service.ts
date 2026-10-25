import { Injectable, inject } from '@angular/core';
import { SalonDataService } from './salon-data.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly client = inject(SupabaseService).client;
  private readonly data = inject(SalonDataService);
  async replace(
    salon: string,
    kind: 'logo' | 'employees' | 'expenses',
    recordId: string,
    file: File,
  ): Promise<string> {
    const allowed =
      kind === 'expenses'
        ? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
        : ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024)
      throw new Error('Choose a permitted image (or expense PDF) up to 5 MB.');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const valid =
      file.type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : file.type === 'image/png'
          ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
          : file.type === 'image/webp'
            ? String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
              String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
            : String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
    if (!valid) throw new Error('The file content does not match its type.');
    const table = kind === 'logo' ? 'salons' : kind === 'employees' ? 'employees' : 'expenses';
    const field =
      kind === 'logo' ? 'logo_url' : kind === 'employees' ? 'avatar_url' : 'attachment_path';
    let oldQuery = this.client.from(table).select('*').eq('id', recordId);
    if (table !== 'salons') oldQuery = oldQuery.eq('salon_id' as never, salon);
    const { data: old, error: readError } = await oldQuery.single();
    if (readError) throw readError;
    const previous = (old as unknown as Record<string, unknown>)[field];
    const extension = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    }[file.type];
    const path = `${salon}/${kind}/${crypto.randomUUID()}.${extension}`;
    const bucket = this.client.storage.from('salon-private');
    const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    try {
      await this.data.update(table, recordId, salon, { [field]: path });
    } catch (e) {
      await bucket.remove([path]);
      throw e;
    }
    // Only delete after the reference is saved; never delete unrelated legacy URLs.
    if (typeof previous === 'string' && previous.startsWith(`${salon}/${kind}/`)) {
      const { error: deleteError } = await bucket.remove([previous]);
      if (deleteError)
        throw new Error('New file saved; old file cleanup failed. Refresh before retrying.');
    }
    return this.signedUrl(path);
  }
  async signedUrl(path: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from('salon-private')
      .createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  }
  async current(
    salon: string,
    kind: 'logo' | 'employees' | 'expenses',
    id: string,
  ): Promise<string | null> {
    const table = kind === 'logo' ? 'salons' : kind === 'employees' ? 'employees' : 'expenses';
    let q = this.client.from(table).select('*').eq('id', id);
    if (table !== 'salons') q = q.eq('salon_id' as never, salon);
    const { data, error } = await q.single();
    if (error) throw error;
    const field =
      kind === 'logo' ? 'logo_url' : kind === 'employees' ? 'avatar_url' : 'attachment_path';
    const path = (data as unknown as Record<string, unknown>)[field];
    return typeof path === 'string' && path.startsWith(salon + '/') ? this.signedUrl(path) : null;
  }
}
