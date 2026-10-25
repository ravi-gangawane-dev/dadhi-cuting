import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { AppHeaderComponent } from '../../shared/components/app-header/app-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageContainerComponent } from '../../shared/components/page-container/page-container.component';

@Component({
  selector: 'app-account-locked',
  standalone: true,
  imports: [AppHeaderComponent, EmptyStateComponent, PageContainerComponent],
  template: `
    <app-page-container [hasBottomNav]="false">
      <app-header title="Account suspended" [showBack]="false" [showLanguageToggle]="false" />
      <app-empty-state
        icon="lock"
        title="Access suspended"
        message="Your salon owner has suspended this account. Ask them to restore access if this was a mistake. Signing out is still possible."
        actionLabel="Sign out"
        (actionClicked)="signOut()"
      />
    </app-page-container>
  `,
})
export class AccountLockedComponent {
  private readonly store = inject(SalonStoreService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    try {
      await this.store.logout();
    } finally {
      this.router.navigateByUrl('/auth/login');
    }
  }
}
