import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Database } from './database.types';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client = createClient<Database>(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    },
  );
}
