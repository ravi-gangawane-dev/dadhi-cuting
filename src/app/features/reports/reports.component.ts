import { ChartContainerComponent } from '../../shared/components/chart-container/chart-container.component';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { AppHeaderComponent } from '../../shared/components/app-header/app-header.component';

import { ReportSummary } from '../../core/data-access/database.types';
import { periodStart } from '../../core/services/business-date';
type Period = 'today' | 'week' | 'month' | 'year';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [ChartContainerComponent, FormsModule, AppHeaderComponent],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);
  readonly selectedPeriod = signal<Period | 'custom'>('month');
  readonly periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year', label: 'This Year' },
  ];
  readonly from = signal(periodStart(this.store.today(), 'month'));
  readonly to = signal(this.store.today());
  readonly report = signal<ReportSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rangeLabel = computed(() => `${this.from()} → ${this.to()}`);
  readonly periodRevenue = computed(() => this.report()?.revenue ?? 0);
  readonly previousRevenue = signal<number | null>(null);
  readonly growthPercentage = computed(() => {
    const previous = this.previousRevenue(),
      current = this.report();
    return previous !== null && previous > 0 && current
      ? Math.round(((current.revenue - previous) / previous) * 100)
      : null;
  });
  readonly totalServices = computed(() => this.report()?.services ?? 0);
  readonly totalEmployees = computed(() => this.report()?.employees?.length ?? 0);
  constructor() {
    effect((cleanup) => {
      const from = this.from(),
        to = this.to();
      const salon = this.store.salon();
      if (!salon.id || !from || !to || from > to) return;
      let cancelled = false;
      cleanup(() => (cancelled = true));
      this.loading.set(true);
      this.report.set(null);
      this.previousRevenue.set(null);
      const start = new Date(from + 'T00:00:00Z'),
        end = new Date(to + 'T00:00:00Z');
      const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      const previousEnd = new Date(start.getTime() - 86400000).toISOString().slice(0, 10);
      const previousStart = new Date(start.getTime() - days * 86400000).toISOString().slice(0, 10);
      void this.store
        .report(previousStart, previousEnd)
        .then((r) => {
          if (!cancelled) this.previousRevenue.set(r.revenue);
        })
        .catch(() => {});
      this.error.set('');
      void this.store
        .report(from, to)
        .then((r) => {
          if (!cancelled) this.report.set(r);
        })
        .catch((e) => {
          if (!cancelled) this.error.set(this.store.message(e));
        })
        .finally(() => {
          if (!cancelled) this.loading.set(false);
        });
    });
  }
  applyPeriod(period: Period) {
    this.selectedPeriod.set(period);
    this.from.set(periodStart(this.store.today(), period));
    this.to.set(this.store.today());
  }
  setCustomFrom(value: string) {
    this.selectedPeriod.set('custom');
    this.from.set(value);
  }
  setCustomTo(value: string) {
    this.selectedPeriod.set('custom');
    this.to.set(value);
  }
  readonly stats = computed(() => {
    const r = this.report();
    return {
      revenue: r?.revenue ?? 0,
      services: r?.services ?? 0,
      avgTicket: r?.visits ? r.revenue / r.visits : 0,
      customers: r?.visits ?? 0,
    };
  });
  readonly topServices = computed(() => {
    const rows = this.report()?.topServices ?? [];
    const max = Math.max(...rows.map((s) => s.revenue), 1);
    return rows.map((s) => ({ ...s, percent: Math.round((s.revenue / max) * 100) }));
  });
  readonly chartData = computed(() => this.report()?.chart ?? []);
  readonly performance = computed(() =>
    this.store.employees().map((e) => ({
      ...e,
      salesToday: this.report()?.employees.find((p) => p.employee_id === e.id)?.revenue ?? 0,
    })),
  );
  formatCurrency(n: number) {
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  /** Exports the already-loaded report; no extra query is made. */
  exportCsv() {
    const r = this.report();
    if (!r) return;
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[][] = [
      ['Section', 'Label', 'Count', 'Revenue'],
      ['Summary', 'Revenue', '', String(r.revenue)],
      ['Summary', 'Services', String(r.services), ''],
      ['Summary', 'Visits', String(r.visits), ''],
      ['Summary', 'Expenses', '', String(r.expenses)],
      ['Summary', 'Outstanding', '', String(r.outstanding)],
      ['Payment', 'Cash', '', String(r.methods?.cash ?? 0)],
      ['Payment', 'UPI', '', String(r.methods?.upi ?? 0)],
      ['Payment', 'Card', '', String(r.methods?.card ?? 0)],
      ...r.topServices.map((s) => ['Service', s.name, String(s.count), String(s.revenue)]),
      ...r.employees.map((e) => ['Employee', e.employee_id, String(e.visits), String(e.revenue)]),
      ...r.chart.map((c) => ['Day', c.label, '', String(c.value)]),
    ];
    const csv = rows.map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dadhicutting-report-${this.from()}_${this.to()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success('Report exported');
  }
}
