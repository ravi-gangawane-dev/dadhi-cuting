import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PlatformDataService, SalonListRow } from '../../core/data-access/platform-data.service';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-platform-salons',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="flex items-baseline gap-3 mb-3">
      <h1 class="text-lg font-black mr-auto">Salons</h1>
      <span class="text-xs text-[var(--color-text-secondary)]">{{ total() }} total</span>
    </div>
    <input
      type="search"
      class="w-full text-sm rounded-xl border border-black/10 px-3 py-2 mb-3 bg-white"
      placeholder="Search salons by name…"
      [ngModel]="query()"
      (ngModelChange)="search($event)"
      aria-label="Search salons"
    />
    @if (loading()) {
      <p role="status" class="text-xs text-[var(--color-text-secondary)]">Loading salons…</p>
    } @else if (error()) {
      <p role="alert" class="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{{ error() }}</p>
    } @else if (!rows().length) {
      <p class="text-xs text-[var(--color-text-secondary)] py-6 text-center">
        No salons match this search yet.
      </p>
    } @else {
      <ul class="flex flex-col gap-2">
        @for (salon of rows(); track salon.id) {
          <li>
            <a
              [routerLink]="['/platform-admin/salons', salon.id]"
              class="block bg-white rounded-2xl border border-black/10 p-4 hover:border-black/25 transition-colors"
            >
              <div class="flex items-baseline gap-2">
                <p class="text-sm font-black mr-auto">{{ salon.name }}</p>
                <span class="text-[10px] text-[var(--color-text-secondary)]">{{ tzDate(salon.created_at) }}</span>
              </div>
              <p class="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                Owners:
                @if (salon.owner_names.length) {
                  {{ salon.owner_names.join(', ') }}
                } @else {
                  <span class="text-red-600 font-bold">none provisioned</span>
                }
              </p>
              <p class="text-[11px] text-[var(--color-text-secondary)]">
                {{ salon.staff_count }} staff · {{ salon.customer_count }} customers · {{ salon.timezone }}
              </p>
            </a>
          </li>
        }
      </ul>
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
export class PlatformSalonsComponent implements OnInit {
  private readonly data = inject(PlatformDataService);
  protected readonly PAGE_SIZE = PAGE_SIZE;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly rows = signal<SalonListRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly query = signal('');

  ngOnInit(): void {
    void this.load();
  }

  search(term: string): void {
    this.query.set(term);
    this.page.set(0);
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
      const result = await this.data.salons(this.page(), PAGE_SIZE, this.query());
      this.rows.set(result.rows);
      this.total.set(result.total);
    } catch (e) {
      this.error.set(this.data.message(e));
    } finally {
      this.loading.set(false);
    }
  }

  tzDate(value: string): string {
    return new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  }
}
