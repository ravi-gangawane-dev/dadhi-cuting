import { CustomDialogComponent } from '../../../shared/components/custom-dialog/custom-dialog.component';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { Expense } from '../../../shared/models/salon.models';

@Component({
  selector: 'app-expenses-list',
  standalone: true,
  imports: [CustomDialogComponent, FormsModule, AppHeaderComponent],
  templateUrl: './expenses-list.component.html',
  styleUrl: './expenses-list.component.scss',
})
export class ExpensesListComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);

  readonly totalExpenses = computed(() => this.store.expenses().reduce((s, e) => s + e.amount, 0));
  readonly cashExpenses = computed(() =>
    this.store
      .expenses()
      .filter((e) => e.paidUsing === 'cash')
      .reduce((s, e) => s + e.amount, 0),
  );
  readonly upiExpenses = computed(() =>
    this.store
      .expenses()
      .filter((e) => e.paidUsing === 'upi')
      .reduce((s, e) => s + e.amount, 0),
  );
  readonly cardExpenses = computed(() =>
    this.store
      .expenses()
      .filter((e) => e.paidUsing === 'card')
      .reduce((s, e) => s + e.amount, 0),
  );

  goToNewExpense(): void {
    this.router.navigateByUrl('/expenses/new');
  }
  readonly from = signal(this.store.today().slice(0, 7) + '-01');
  readonly to = signal(this.store.today());
  readonly category = signal('');
  readonly filteredExpenses = computed(() =>
    this.store
      .expenses()
      .filter(
        (e) =>
          (!this.from() || e.date >= this.from()) &&
          (!this.to() || e.date <= this.to()) &&
          (!this.category() || e.category === this.category()),
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  readonly periodTotal = computed(() => this.filteredExpenses().reduce((s, e) => s + e.amount, 0));
  editExpense(id: string) {
    this.router.navigate(['/expenses/new'], { queryParams: { id } });
  }

  readonly deleting = signal<Expense | null>(null);
  readonly showCategories = signal(false);
  readonly newCategory = signal('');
  readonly renamingId = signal('');
  readonly renamingName = signal('');

  async addCategory(): Promise<void> {
    try {
      await this.store.addExpenseCategory(this.newCategory());
      this.newCategory.set('');
    } catch {
      /* Store surfaces the error. */
    }
  }

  startRename(id: string, name: string): void {
    this.renamingId.set(id);
    this.renamingName.set(name);
  }

  async saveRename(): Promise<void> {
    if (!this.renamingId()) return;
    try {
      await this.store.renameExpenseCategory(this.renamingId(), this.renamingName());
      this.renamingId.set('');
      this.renamingName.set('');
    } catch {
      /* Store surfaces the error. */
    }
  }

  async confirmDelete(): Promise<void> {
    const expense = this.deleting();
    if (!expense || this.store.saving()) return;
    try {
      await this.store.deleteExpense(expense.id);
      this.deleting.set(null);
    } catch {
      /* Store surfaces the error; keep the dialog open. */
    }
  }
}
