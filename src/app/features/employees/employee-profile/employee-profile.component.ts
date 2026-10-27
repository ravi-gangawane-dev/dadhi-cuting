import { RouterLink } from '@angular/router';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-employee-profile',
  standalone: true,
  imports: [RouterLink, IconComponent, AppHeaderComponent, FileUploadComponent],
  templateUrl: './employee-profile.component.html',
  styleUrl: './employee-profile.component.scss',
})
export class EmployeeProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);

  readonly employeeId = computed(() => {
    return this.route.snapshot.paramMap.get('id') || '';
  });

  readonly employee = computed(() => {
    const id = this.employeeId();
    return this.store.employees().find((e) => e.id === id);
  });

  readonly estimatedCommission = computed(() => {
    const emp = this.employee();
    if (!emp) return 0;
    return Math.round((emp.salesToday * emp.commissionRate) / 100);
  });

  readonly employeeEntries = computed(() => {
    const emp = this.employee();
    if (!emp) return [];
    return this.store
      .serviceEntries()
      .filter((e) => e.employeeId === emp.id && e.status === 'completed');
  });

  /**
   * Owner-viewable audit trail for this staff member (audit_read is an
   * owner-only RLS grant, so the section is hidden for other roles).
   */
  readonly activity = signal<
    { action: string; created_at: string; entity_type: string }[] | null
  >(null);
  readonly activityVisible = computed(() => this.store.currentUser().role === 'owner');

  /**
   * Granular capabilities layered on top of the member's role. Only shown to
   * owners; toggles persist through the audited set_member_permission RPC.
   */
  readonly capabilityKeys = [
    { key: 'record_services', label: 'Record visits & payments', desc: 'Create invoices and collect receipts' },
    { key: 'manage_customers', label: 'Manage customers', desc: 'Add and edit customer records' },
    { key: 'manage_appointments', label: 'Manage appointments', desc: 'Add, edit and cancel bookings' },
    { key: 'manage_services', label: 'Manage services & pricing', desc: 'Edit the service catalog' },
    { key: 'manage_expenses', label: 'Manage expenses', desc: 'Record shop expenses' },
  ] as const;
  readonly capabilities = signal<Map<string, boolean>>(new Map());

  constructor() {
    effect(() => {
      const emp = this.employee();
      if (!emp || !this.activityVisible()) {
        this.activity.set(null);
        this.capabilities.set(new Map());
        return;
      }
      const memberId = emp.userId ? (this.store.memberStatuses().get(emp.userId)?.memberId ?? '') : '';
      void this.store
        .memberActivity(emp.userId ?? '', memberId)
        .then((rows) => this.activity.set(rows))
        .catch(() => this.activity.set(null));
      if (emp.userId) {
        void this.store
          .loadMemberCapabilities(emp.userId)
          .then((keys) =>
            this.capabilities.set(
              new Map(this.capabilityKeys.map((c) => [c.key, keys.includes(c.key)])),
            ),
          )
          .catch(() => this.capabilities.set(new Map()));
      }
    });
  }

  /** Toggles one capability through the audited RPC; reverts on failure. */
  async toggleCapability(event: Event, key: string): Promise<void> {
    const input = event.target as HTMLInputElement;
    const emp = this.employee();
    if (!emp?.userId) return;
    const granted = input.checked;
    try {
      await this.store.setMemberCapability(emp.userId, key, granted);
      this.toast.success(
        granted ? 'Capability granted' : 'Capability removed',
        emp.name,
      );
    } catch (e) {
      this.capabilities.set(
        new Map(this.capabilities()).set(key, !granted),
      );
      this.toast.error(this.store.message(e));
    }
  }

  viewAllServices(): void {
    this.router.navigateByUrl('/catalog/services');
  }
}
