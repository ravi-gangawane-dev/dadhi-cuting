import { Component, OnInit, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { PlatformAuditRow } from '../../core/data-access/database.types';
import { PlatformDataService } from '../../core/data-access/platform-data.service';

const PAGE_SIZE = 40;

@Component({
  selector: 'app-platform-audit',
  standalone: true,
  imports: [JsonPipe],
  template: `
    <h1 class="text-lg font-black mb-1">Audit logs</h1>
    <p class="text-xs text-[var(--color-text-secondary)] mb-4">
      Server-written record of privileged platform changes (feature flags, owner grants).
      Salon-level actions live in each salon's own audit trail.
    </p>
    @if (loading()) {
      <p role="status" class="text-xs text-[var(--color-text-secondary)]">Loading audit trail…</p>
    } @else if (error()) {
      <p role="alert" class="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{{ error() }}</p>
    } @else if (!rows().length) {
      <p class="text-xs text-[var(--color-text-secondary)] py-6 text-center">No platform audit entries yet.</p>
    } @else {
      <div class="bg-white rounded-2xl border border-black/10 divide-y divide-black/5">
        @for (row of rows(); track row.id) {
          <div class="p-3">
            <div class="flex flex-wrap items-baseline gap-2">
              <span class="text-xs font-black">{{ row.action }}</span>
              <span class="text-[10px] text-[var(--color-text-secondary)] mr-auto">
                {{ row.entity_type }}{{ row.entity_id ? ' · ' + row.entity_id : '' }}
              </span>
              <span class="text-[10px] text-[var(--color-text-secondary)]">{{ time(row.created_at) }}</span>
            </div>
            <p class="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
              actor {{ row.actor_user_id ?? 'service-role' }}
              @if (row.details && objectKeys(row.details).length) {
                · {{ row.details | json }}
              }
            </p>
          </div>
        }
      </div>
      <div class="flex items-center gap-3 mt-4">
        <button
          type="button"
          class="text-xs font-bold px-3 py-2 rounded-xl border border-black/10 disabled:opacity-40"
          [disabled]="page() === 0"
          (click)="goTo(page() - 1)"
        >
          Previous
        </button>
        <span class="text-xs text-[var(--color-text-secondary)]">Page {{ page() + 1 }}</span>
        <button
          type="button"
          class="text-xs font-bold px-3 py-2 rounded-xl border border-black/10 disabled:opacity-40"
          [disabled]="(page() + 1) * PAGE_SIZE >= total()"
          (click)="goTo(page() + 1)"
        >
          Next
        </button>
      </div>
    }
  `,
})
export class PlatformAuditComponent implements OnInit {
  private readonly data = inject(PlatformDataService);
  protected readonly PAGE_SIZE = PAGE_SIZE;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly rows = signal<PlatformAuditRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);

  ngOnInit(): void {
    void this.load();
  }

  goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.data.audit(this.page(), PAGE_SIZE);
      this.rows.set(result.rows);
      this.total.set(result.total);
    } catch (e) {
      this.error.set(this.data.message(e));
    } finally {
      this.loading.set(false);
    }
  }

  objectKeys(details: unknown): string[] {
    return details && typeof details === 'object' ? Object.keys(details) : [];
  }

  time(value: string): string {
    return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
}
