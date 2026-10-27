import { RouterLink } from '@angular/router';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';

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

  constructor() {
    effect(() => {
      const emp = this.employee();
      if (!emp || !this.activityVisible()) {
        this.activity.set(null);
        return;
      }
      const memberId = emp.userId ? (this.store.memberStatuses().get(emp.userId)?.memberId ?? '') : '';
      void this.store
        .memberActivity(emp.userId ?? '', memberId)
        .then((rows) => this.activity.set(rows))
        .catch(() => this.activity.set(null));
    });
  }

  viewAllServices(): void {
    this.router.navigateByUrl('/catalog/services');
  }
}
