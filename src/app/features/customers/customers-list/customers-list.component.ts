import { Customer } from '../../../shared/models/salon.models';
import { Component, effect, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { CustomerCardComponent } from '../../../shared/components/customer-card/customer-card.component';
import { SearchInputComponent } from '../../../shared/components/search-input/search-input.component';
import { CustomDialogComponent } from '../../../shared/components/custom-dialog/custom-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-customers-list',
  standalone: true,
  imports: [
    FormsModule,
    AppHeaderComponent,
    CustomerCardComponent,
    SearchInputComponent,
    CustomDialogComponent,
    EmptyStateComponent,
  ],
  templateUrl: './customers-list.component.html',
  styleUrl: './customers-list.component.scss',
})
export class CustomersListComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);

  searchQuery = signal<string>('');
  showAddModal = signal<boolean>(false);

  // New Customer Form State
  newName = signal<string>('');
  newPhone = signal<string>('');
  newNotes = signal<string>('');

  readonly filteredCustomers = signal<Customer[]>([]);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly searching = signal(false);
  readonly editId = signal('');
  constructor() {
    effect((cleanup) => {
      const q = this.searchQuery(),
        page = this.page();
      this.store.customers();
      if (!this.store.salon().id) return;
      let cancelled = false;
      const timer = setTimeout(() => {
        this.searching.set(true);
        void this.store
          .searchCustomers(q, page)
          .then((r) => {
            if (!cancelled) {
              this.filteredCustomers.set(r.rows);
              this.total.set(r.total);
            }
          })
          .catch((e) => {
            if (!cancelled) this.store.error.set(this.store.message(e));
          })
          .finally(() => {
            if (!cancelled) this.searching.set(false);
          });
      }, 200);
      cleanup(() => {
        cancelled = true;
        clearTimeout(timer);
      });
    });
  }
  search(value: string) {
    this.page.set(0);
    this.searchQuery.set(value);
  }
  editCustomer(c: Customer) {
    this.editId.set(c.id);
    this.newName.set(c.name);
    this.newPhone.set(c.phone.replace(/^\+91\s*/, ''));
    this.newNotes.set(c.notes ?? '');
    this.showAddModal.set(true);
  }

  goToProfile(id: string): void {
    this.router.navigate(['/customers', id]);
  }

  openAddModal(): void {
    this.editId.set('');
    this.newName.set('');
    this.newPhone.set('');
    this.newNotes.set('');
    this.showAddModal.set(true);
  }

  async saveCustomer(): Promise<void> {
    if (this.store.saving()) return;
    try {
      if (!this.newName().trim()) return;

      const payload = {
        name: this.newName().trim(),
        phone: this.newPhone().trim() ? '+91 ' + this.newPhone().trim() : 'Anonymous',
        notes: this.newNotes().trim(),
      };
      if (this.editId()) await this.store.updateCustomer(this.editId(), payload);
      else await this.store.addCustomer(payload);

      this.showAddModal.set(false);
    } catch {
      /* Store displays the error; keep the form open. */
    }
  }
}
