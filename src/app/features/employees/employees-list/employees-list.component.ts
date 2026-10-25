import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { CustomDialogComponent } from '../../../shared/components/custom-dialog/custom-dialog.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-employees-list',
  standalone: true,
  imports: [FormsModule, AppHeaderComponent, CustomDialogComponent],
  templateUrl: './employees-list.component.html',
  styleUrl: './employees-list.component.scss',
})
export class EmployeesListComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);

  showAddModal = signal<boolean>(false);

  readonly editId = signal('');
  readonly query = signal('');
  readonly showArchived = signal(false);
  readonly filteredEmployees = computed(() =>
    this.store
      .employees()
      .filter(
        (e) =>
          (this.showArchived() || e.active) &&
          (e.name + ' ' + e.phone).toLowerCase().includes(this.query().toLowerCase()),
      ),
  );
  // Form State
  newName = signal<string>('');
  newRole = signal<string>('barber');
  newPhone = signal<string>('');
  newCommission = signal<number>(25);

  readonly totalTeamServices = computed(() => {
    return this.store.employees().reduce((s, e) => s + e.servicesToday, 0);
  });

  readonly totalTeamSales = computed(() => {
    return this.store.employees().reduce((s, e) => s + e.salesToday, 0);
  });

  goToProfile(id: string): void {
    this.router.navigate(['/employees', id]);
  }

  openAddModal(): void {
    this.editId.set('');
    this.newPhone.set('');
    this.newName.set('');
    this.newRole.set('barber');
    this.newCommission.set(25);
    this.showAddModal.set(true);
  }

  async saveEmployee(): Promise<void> {
    if (this.store.saving()) return;
    try {
      if (!this.newName().trim()) return;

      const payload = {
        name: this.newName().trim(),
        role: this.newRole() as any,
        phone: this.newPhone().trim(),
        commissionRate: Number(this.newCommission()),
      };
      if (this.editId()) await this.store.updateEmployee(this.editId(), payload);
      else await this.store.addEmployee(payload);

      this.showAddModal.set(false);
    } catch {
      /* Store displays the error; keep the form open. */
    }
  }
  editEmployee(id: string) {
    const e = this.store.employees().find((e) => e.id === id);
    if (!e) return;
    this.editId.set(id);
    this.newName.set(e.name);
    this.newRole.set(e.role);
    this.newPhone.set(e.phone);
    this.newCommission.set(e.commissionRate);
    this.showAddModal.set(true);
  }
  async archive(id: string, active: boolean) {
    try {
      await this.store.updateEmployee(id, { active });
    } catch {}
  }
}
