import { RouterLink } from '@angular/router';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-employee-profile',
  standalone: true,
  imports: [RouterLink, IconComponent, AppHeaderComponent],
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

  viewAllServices(): void {
    this.router.navigateByUrl('/catalog/services');
  }
}
