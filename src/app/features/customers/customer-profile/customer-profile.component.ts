import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-customer-profile',
  standalone: true,
  imports: [RouterLink, IconComponent, AppHeaderComponent],
  templateUrl: './customer-profile.component.html',
  styleUrl: './customer-profile.component.scss',
})
export class CustomerProfileComponent {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);

  readonly customerId = computed(() => {
    return this.route.snapshot.paramMap.get('id') || '';
  });

  readonly customer = computed(() => {
    const id = this.customerId();
    return this.store.customers().find((c) => c.id === id);
  });

  readonly customerEntries = computed(() => {
    const cust = this.customer();
    if (!cust) return [];
    return this.store
      .serviceEntries()
      .filter((e) => e.customerId === cust.id && e.status === 'completed');
  });
}
