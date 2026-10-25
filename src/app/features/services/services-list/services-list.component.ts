import { CustomDialogComponent } from '../../../shared/components/custom-dialog/custom-dialog.component';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';
import { SalonService } from '../../../shared/models/salon.models';

@Component({
  selector: 'app-services-list',
  standalone: true,
  imports: [CustomDialogComponent, FormsModule, AppHeaderComponent],
  templateUrl: './services-list.component.html',
  styleUrl: './services-list.component.scss',
})
export class ServicesListComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);

  readonly selectedCategory = signal('');
  readonly categoryName = signal('');
  readonly renamingId = signal('');
  readonly renamingName = signal('');
  async addCategory() {
    try {
      await this.store.addCategory(this.categoryName());
      this.categoryName.set('');
    } catch (e) {
      this.store.error.set(this.store.message(e));
    }
  }
  startRename(id: string, name: string) {
    this.renamingId.set(id);
    this.renamingName.set(name);
  }
  async saveRename() {
    if (!this.renamingId()) return;
    try {
      await this.store.updateServiceCategory(this.renamingId(), { name: this.renamingName() });
      this.renamingId.set('');
      this.renamingName.set('');
    } catch {
      /* Store surfaces the error. */
    }
  }
  async toggleCategory(id: string, active: boolean) {
    try {
      await this.store.updateServiceCategory(id, { active: !active });
    } catch {
      /* Store surfaces the error. */
    }
  }
  readonly editId = signal('');
  readonly showArchived = signal(false);
  searchQuery = signal<string>('');
  showAddModal = signal<boolean>(false);

  // Form State for new service
  newServiceName = signal<string>('');
  newServicePrice = signal<number>(250);
  newServiceDuration = signal<number>(30);
  newServiceCategory = signal<any>('Hair');

  readonly filteredServices = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q)
      return this.store
        .services()
        .filter(
          (s) =>
            (this.showArchived() || s.active) &&
            (!this.selectedCategory() || s.category === this.selectedCategory()),
        );
    return this.store
      .services()
      .filter(
        (s) =>
          (this.showArchived() || s.active) &&
          (!this.selectedCategory() || s.category === this.selectedCategory()) &&
          (s.name.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q) ||
            (s.nameMarathi && s.nameMarathi.includes(q))),
      );
  });

  openAddModal(): void {
    this.editId.set('');
    this.newServiceName.set('');
    this.newServicePrice.set(250);
    this.newServiceDuration.set(30);
    this.showAddModal.set(true);
  }

  async saveNewService(): Promise<void> {
    if (this.store.saving()) return;
    try {
      if (!this.newServiceName().trim()) return;

      const payload = {
        name: this.newServiceName().trim(),
        category: this.newServiceCategory(),
        price: Number(this.newServicePrice()),
        durationMinutes: Number(this.newServiceDuration()),
      };
      if (this.editId()) await this.store.updateService(this.editId(), payload);
      else await this.store.addService(payload);

      this.showAddModal.set(false);
    } catch {
      /* Store displays the error; keep the form open. */
    }
  }
  editService(s: SalonService) {
    this.editId.set(s.id);
    this.newServiceName.set(s.name);
    this.newServicePrice.set(s.price);
    this.newServiceDuration.set(s.durationMinutes);
    this.newServiceCategory.set(s.category);
    this.showAddModal.set(true);
  }
  async archive(s: SalonService) {
    try {
      await this.store.updateService(s.id, { active: !s.active });
    } catch {}
  }
}
