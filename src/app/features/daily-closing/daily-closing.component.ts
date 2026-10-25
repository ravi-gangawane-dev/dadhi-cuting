import { RouterLink } from '@angular/router';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { AppHeaderComponent } from '../../shared/components/app-header/app-header.component';

@Component({
  selector: 'app-daily-closing',
  standalone: true,
  imports: [RouterLink, FormsModule, AppHeaderComponent],
  templateUrl: './daily-closing.component.html',
  styleUrl: './daily-closing.component.scss',
})
export class DailyClosingComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly isClosing = signal<boolean>(false);
  readonly isClosed = computed(() => this.store.dailyClosing().status === 'closed');
  readonly openingCash = signal(this.store.dailyClosing().openingCash);
  readonly countedCash = signal(this.store.dailyClosing().countedCash);
  readonly totalRevenue = computed(() => this.store.todayRevenue());
  readonly cashCollected = computed(() => this.store.paymentMethodTotals().cash);
  readonly upiCollected = computed(() => this.store.paymentMethodTotals().upi);
  readonly totalExpenses = computed(() => this.store.todayExpenses());
  readonly expectedCash = computed(() => this.cashReconciliation().expectedCash);
  readonly difference = computed(() => this.countedCash() - this.expectedCash());

  readonly todayKPIs = computed(() => {
    const revenue = this.store.todayRevenue();
    const expenses = this.store.todayExpenses();
    const services = this.store.todayServicesCount();
    return {
      grossSales: revenue,
      expenses: expenses,
      netResult: revenue - expenses,
      services: services,
    };
  });

  readonly cashReconciliation = computed(() => {
    const openingCash = this.isClosed()
      ? this.store.dailyClosing().openingCash
      : this.openingCash();
    const cashReceived = this.store.paymentMethodTotals().cash;
    const cashExpenses = this.store.todayCashExpenses();
    const expectedCash = openingCash + cashReceived - cashExpenses;
    return { openingCash, cashReceived, cashExpenses, expectedCash };
  });

  formatCurrency(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN');
  }

  async closeDay(): Promise<void> {
    if (this.isClosed()) return;
    this.isClosing.set(true);

    try {
      await this.store.closeBusinessDay(Number(this.countedCash()), Number(this.openingCash()));
      this.toast.show({
        type: 'success',
        message: 'Day closed successfully! Great work today! 🎉',
      });
      setTimeout(() => this.router.navigateByUrl('/dashboard'), 1800);
    } catch {
      this.toast.show({ type: 'error', message: 'Failed to close day. Please try again.' });
    } finally {
      this.isClosing.set(false);
    }
  }
}
