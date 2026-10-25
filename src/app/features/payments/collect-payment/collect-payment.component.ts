import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';
import { ToastService } from '../../../core/services/toast.service';
import { PaymentMethod } from '../../../shared/models/salon.models';

@Component({
  selector: 'app-collect-payment',
  standalone: true,
  imports: [FormsModule, AppHeaderComponent],
  templateUrl: './collect-payment.component.html',
  styleUrl: './collect-payment.component.scss',
})
export class CollectPaymentComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);
  readonly invoiceId = signal(this.route.snapshot.queryParamMap.get('invoiceId') ?? '');
  readonly entry = computed(() =>
    this.store.serviceEntries().find((e) => e.id === this.invoiceId() && e.status === 'completed'),
  );
  readonly serviceName = computed(
    () =>
      this.entry()
        ?.services.map((s) => s.name)
        .join(' + ') ?? 'Select an invoice from Payments',
  );
  readonly staffName = computed(() => this.entry()?.employeeName ?? '');
  readonly customerName = computed(() => this.entry()?.customerName ?? '');
  readonly outstanding = computed(() =>
    this.store
      .payments()
      .filter((p) => p.invoiceId === this.invoiceId() && p.status === 'pending')
      .reduce((s, p) => s + p.amount, 0),
  );
  readonly amount = signal(this.outstanding());
  readonly paymentMethods: PaymentMethod[] = ['cash', 'upi', 'card', 'split', 'pending'];
  readonly selectedMethod = signal<PaymentMethod>('cash');
  readonly splitCashAmount = signal(0);
  readonly splitUpiAmount = signal(0);
  readonly confirmed = signal(false);
  readonly reference = signal('');
  readonly isSplit = computed(() => this.selectedMethod() === 'split');
  private readonly requestId = crypto.randomUUID();
  selectMethod(method: PaymentMethod) {
    this.selectedMethod.set(method);
    this.confirmed.set(false);
    if (method === 'split') {
      const half = Math.floor(this.amount() / 2);
      this.splitCashAmount.set(half);
      this.splitUpiAmount.set(this.amount() - half);
    }
  }
  async confirmPayment() {
    if (this.store.saving()) return;
    try {
      const method = this.selectedMethod();
      if (!this.entry()) throw new Error('Select an existing invoice from Payments.');
      if (method === 'pending') {
        await this.router.navigateByUrl('/payments');
        return;
      }
      if (!this.confirmed()) throw new Error('Confirm that payment was received.');
      if (
        !Number.isFinite(this.amount()) ||
        this.amount() <= 0 ||
        this.amount() > this.outstanding()
      )
        throw new Error('Enter an amount within the outstanding balance.');
      await this.store.collectPayment(
        this.invoiceId(),
        Number(this.amount()),
        method,
        'Manually confirmed: ' + (this.reference().trim() || method),
        this.requestId,
        { cash: Number(this.splitCashAmount()), upi: Number(this.splitUpiAmount()) },
      );
      await this.router.navigateByUrl('/payments');
    } catch (e) {
      this.toast.error(this.store.message(e));
    }
  }
}
