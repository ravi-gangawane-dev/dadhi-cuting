import { StorageService } from '../../../core/data-access/storage.service';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-add-expense',
  standalone: true,
  imports: [FormsModule, AppHeaderComponent],
  templateUrl: './add-expense.component.html',
  styleUrl: './add-expense.component.scss',
})
export class AddExpenseComponent {
  private readonly router = inject(Router);
  private readonly storage = inject(StorageService);
  readonly store = inject(SalonStoreService);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(TranslationService);

  private readonly route = inject(ActivatedRoute);
  readonly editId = this.route.snapshot.queryParamMap.get('id') ?? '';
  title = signal<string>('');
  category = signal<string>('Shop supplies');
  amount = signal<number>(0);
  paidUsing = signal<'cash' | 'upi' | 'card' | 'bank_transfer'>('cash');
  date = signal<string>(this.store.today());
  notes = signal<string>('');
  readonly attachment = signal<File | null>(null);
  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.attachment.set(input.files?.[0] ?? null);
  }

  get categories() {
    return this.store.expenseCategories().map((c) => c.name);
  }
  constructor() {
    if (this.editId) {
      const e = this.store.expenses().find((e) => e.id === this.editId);
      if (e) {
        this.title.set(e.title);
        this.category.set(e.category);
        this.amount.set(e.amount);
        this.paidUsing.set(e.paidUsing);
        this.date.set(e.date);
        this.notes.set(e.notes ?? '');
      }
    }
  }

  async saveExpense(): Promise<void> {
    if (this.store.saving()) return;
    try {
      if (!this.title().trim() || !this.amount()) {
        this.toast.error('कृपया खर्चाचे नाव व रक्कम प्रविष्ट करा');
        return;
      }

      const payload = {
        title: this.title().trim(),
        category: this.category(),
        amount: Number(this.amount()),
        paidUsing: this.paidUsing(),
        date: this.date(),
        notes: this.notes().trim(),
      };
      let savedId = this.editId;
      if (this.editId) {
        await this.store.updateExpense(this.editId, payload);
      } else {
        const created = (await this.store.addExpense(payload)) as { id?: string } | undefined;
        savedId = created?.id ?? '';
      }
      const file = this.attachment();
      if (savedId && file) {
        try {
          await this.storage.replace(this.store.salon().id, 'expenses', savedId, file);
        } catch (e) {
          this.toast.error('Expense saved, but the attachment failed: ' + this.store.message(e));
        }
      }

      this.router.navigateByUrl('/expenses');
    } catch {
      /* Store displays the error; keep the form open. */
    }
  }
}
