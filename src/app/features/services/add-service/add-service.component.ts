import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { CustomDialogComponent } from '../../../shared/components/custom-dialog/custom-dialog.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';
import { ToastService } from '../../../core/services/toast.service';
import { SalonService, Employee, Customer } from '../../../shared/models/salon.models';

@Component({
  selector: 'app-add-service',
  standalone: true,
  imports: [FormsModule, AppHeaderComponent, CustomDialogComponent, IconComponent],
  templateUrl: './add-service.component.html',
  styleUrl: './add-service.component.scss',
})
export class AddServiceComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly activeEmployees = computed(() => this.store.employees().filter((e) => e.active));
  readonly serviceQuery = signal('');
  readonly activeServices = computed(() =>
    this.store
      .services()
      .filter(
        (s) =>
          s.active &&
          (s.name + ' ' + s.category).toLowerCase().includes(this.serviceQuery().toLowerCase()),
      ),
  );
  // Form State
  selectedEmployeeId = signal<string>('');
  selectedCustomerId = signal<string>('cust_walkin');
  selectedServices = signal<SalonService[]>([]);
  discount = signal<number>(0);

  // Selector Modals
  showStaffModal = signal<boolean>(false);
  showCustomerModal = signal<boolean>(false);

  readonly requestId = crypto.randomUUID();
  constructor() {
    this.selectedEmployeeId.set(this.store.employees().find((e) => e.active)?.id ?? '');
    // No default service is billed.
    const defaultSrv = this.store.services().find((s) => s.id === 'srv_3');
    if (defaultSrv) {
      this.selectedServices.set([defaultSrv]);
    }
  }

  readonly selectedEmployee = computed(() => {
    return this.store.employees().find((e) => e.id === this.selectedEmployeeId());
  });

  readonly selectedCustomer = computed(() => {
    if (this.selectedCustomerId() === 'cust_walkin') {
      return { name: 'Walk-in customer', phone: 'Anonymous guest' };
    }
    return (
      this.store.customers().find((c) => c.id === this.selectedCustomerId()) || {
        name: 'Walk-in customer',
        phone: '',
      }
    );
  });

  readonly estimatedTotal = computed(() => {
    const subtotal = this.selectedServices().reduce((sum, s) => sum + s.price, 0);
    return Math.max(0, subtotal - this.discount());
  });

  isServiceSelected(serviceId: string): boolean {
    return this.selectedServices().some((s) => s.id === serviceId);
  }

  toggleService(service: SalonService): void {
    const list = this.selectedServices();
    if (this.isServiceSelected(service.id)) {
      this.selectedServices.set(list.filter((s) => s.id !== service.id));
    } else {
      this.selectedServices.set([...list, service]);
    }
  }

  chooseStaff(emp: Employee): void {
    this.selectedEmployeeId.set(emp.id);
    this.showStaffModal.set(false);
  }

  chooseCustomer(cust: Customer | null): void {
    if (cust) {
      this.selectedCustomerId.set(cust.id);
    } else {
      this.selectedCustomerId.set('cust_walkin');
    }
    this.showCustomerModal.set(false);
  }

  async continueToPayment(): Promise<void> {
    if (this.store.saving()) return;
    try {
      if (this.selectedServices().length === 0) {
        this.toast.error('कृपया किमान एक सेवा निवडा', 'सेवा निवडणे आवश्यक');
        return;
      }

      // Save service entry to store
      const entry = await this.store.createServiceEntry(
        {
          employeeId: this.selectedEmployeeId(),
          customerId: this.selectedCustomerId(),
          customerName: this.selectedCustomer().name,
          selectedServices: this.selectedServices(),
          discount: this.discount(),
          paymentMethod: 'pending',
        },
        this.requestId,
      );

      // Navigate to Collect Payment with invoice details
      this.router.navigate(['/payments/collect'], {
        queryParams: {
          serviceId: entry.id,
          invoiceId: entry.invoiceId,
          amount: entry.total,
          serviceName: entry.services.map((s) => s.name).join(' + '),
          employeeName: entry.employeeName,
          customerName: entry.customerName,
        },
      });
    } catch (e) {
      this.toast.error(this.store.message(e));
    }
  }
}
