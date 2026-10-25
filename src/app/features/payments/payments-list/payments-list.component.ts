import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { CustomDialogComponent } from '../../../shared/components/custom-dialog/custom-dialog.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';
import { PaymentTransaction } from '../../../shared/models/salon.models';

@Component({
  selector: 'app-payments-list',
  standalone: true,
  imports: [FormsModule, AppHeaderComponent, CustomDialogComponent, UpperCasePipe],
  templateUrl: './payments-list.component.html',
  styleUrl: './payments-list.component.scss',
})
export class PaymentsListComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);

  readonly methods: ('all' | 'cash' | 'upi' | 'pending')[] = ['all', 'cash', 'upi', 'pending'];
  readonly query = signal('');
  filterMethod = signal<'all' | 'upi' | 'cash' | 'pending'>('all');

  readonly filteredPayments = computed(() => {
    const f = this.filterMethod();
    const rows = this.store
      .payments()
      .filter((p) =>
        (p.customerName + ' ' + p.employeeName + ' ' + (p.reference ?? ''))
          .toLowerCase()
          .includes(this.query().toLowerCase()),
      );
    if (f === 'all') return rows;
    if (f === 'pending') return rows.filter((p) => p.status === 'pending');
    return rows.filter((p) => p.method === f);
  });

  readonly correction = signal<{
    kind: 'invoice' | 'receipt';
    id: string;
    label: string;
  } | null>(null);
  readonly reason = signal('');

  goToCollect(invoiceId?: string): void {
    if (invoiceId) {
      this.router.navigate(['/payments/collect'], { queryParams: { invoiceId } });
    } else {
      const pending = this.store.payments().find((p) => p.status === 'pending');
      if (pending)
        this.router.navigate(['/payments/collect'], {
          queryParams: { invoiceId: pending.invoiceId },
        });
      else this.store.error.set('There are no outstanding invoices.');
    }
  }

  openCorrection(pay: PaymentTransaction): void {
    const pending = pay.method === 'pending';
    this.correction.set({
      kind: pending ? 'invoice' : 'receipt',
      id: pending ? pay.serviceEntryId : pay.id,
      label: pay.customerName || (pending ? 'this invoice' : 'this receipt'),
    });
    this.reason.set('');
  }

  closeCorrection(): void {
    this.correction.set(null);
    this.reason.set('');
  }

  async confirmCorrection(): Promise<void> {
    const c = this.correction();
    if (!c || this.store.saving()) return;
    try {
      if (c.kind === 'invoice') await this.store.voidServiceEntry(c.id, this.reason());
      else await this.store.voidPayment(c.id, this.reason());
      this.closeCorrection();
    } catch {
      /* Store surfaces the error; keep the dialog open. */
    }
  }
}
