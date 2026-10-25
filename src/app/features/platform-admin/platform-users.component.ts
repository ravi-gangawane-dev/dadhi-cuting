import { Component, OnInit, inject, signal } from '@angular/core';
import {
  PlatformDataService,
  PlatformMemberRow,
  PlatformStaffRow,
} from '../../core/data-access/platform-data.service';

@Component({
  selector: 'app-platform-users',
  standalone: true,
  imports: [],
  template: `
    <h1 class="text-lg font-black mb-1">Platform users</h1>
    <p class="text-xs text-[var(--color-text-secondary)] mb-4">
      Accounts known to the application database. Actual credentials live in Supabase Auth and are never exposed here.
    </p>

    @if (loading()) {
      <p role="status" class="text-xs text-[var(--color-text-secondary)]">Loading users…</p>
    } @else if (error()) {
      <p role="alert" class="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{{ error() }}</p>
    } @else {
      <section class="mb-5">
        <h2 class="text-sm font-black mb-2">Memberships ({{ members().length }})</h2>
        <div class="bg-white rounded-2xl border border-black/10 divide-y divide-black/5">
          @for (m of members(); track m.user_id + m.salon_id) {
            <div class="p-3 flex flex-wrap items-center gap-2">
              <div class="mr-auto">
                <p class="text-xs font-bold">{{ m.name || m.user_id }}</p>
                <p class="text-[10px] text-[var(--color-text-secondary)]">{{ m.salon_name }} · {{ m.phone || 'no phone' }}</p>
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

      <section class="mb-8">
        <h2 class="text-sm font-black mb-2">Staff records ({{ staff().length }})</h2>
        <div class="bg-white rounded-2xl border border-black/10 divide-y divide-black/5">
          @for (s of staff(); track s.id) {
            <div class="p-3 flex flex-wrap items-center gap-2">
              <div class="mr-auto">
                <p class="text-xs font-bold">{{ s.full_name }}</p>
                <p class="text-[10px] text-[var(--color-text-secondary)]">{{ s.salon_name }}</p>
              </div>
              <span class="text-[10px] px-2 py-1 rounded-full"
                [class]="s.user_id ? 'bg-indigo-100 text-indigo-800' : 'bg-black/5 text-[var(--color-text-secondary)]'">
                {{ s.user_id ? 'has login' : 'no login' }}
              </span>
              <span class="text-[10px] font-black uppercase px-2 py-1 rounded-full"
                [class]="s.active ? 'bg-emerald-100 text-emerald-800' : 'bg-black/5 text-[var(--color-text-secondary)]'">
                {{ s.active ? 'active' : 'archived' }}
              </span>
            </div>
          } @empty {
            <p class="p-4 text-xs text-[var(--color-text-secondary)]">No staff records.</p>
          }
        </div>
      </section>
    }
  `,
})
export class PlatformUsersComponent implements OnInit {
  private readonly data = inject(PlatformDataService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly members = signal<PlatformMemberRow[]>([]);
  readonly staff = signal<PlatformStaffRow[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [members, staff] = await Promise.all([this.data.memberships(), this.data.staff()]);
      this.members.set(members);
      this.staff.set(staff);
    } catch (e) {
      this.error.set(this.data.message(e));
    } finally {
      this.loading.set(false);
    }
  }
}
