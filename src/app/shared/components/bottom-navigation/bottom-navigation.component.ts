import { SalonStoreService } from '../../../core/services/salon-store.service';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { IconComponent } from '../icon/icon.component';
import { TranslationService } from '../../../core/services/translation.service';
import { UiStateService } from '../../../core/services/ui-state.service';
import { FeatureAccessService } from '../../../core/services/feature-access.service';

@Component({
  selector: 'app-bottom-navigation',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './bottom-navigation.component.html',
  styleUrl: './bottom-navigation.component.scss',
})
export class BottomNavigationComponent {
  private readonly router = inject(Router);
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  readonly uiState = inject(UiStateService);
  readonly flags = inject(FeatureAccessService);

  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects || e.url),
    ),
    { initialValue: this.router.url },
  );

  readonly isMoreActive = computed(() => {
    const url = this.currentUrl() || '';
    const morePaths = [
      '/employees',
      '/customers',
      '/expenses',
      '/closing',
      '/reports',
      '/notifications',
      '/settings',
      '/appointments',
    ];
    return morePaths.some((p) => url.startsWith(p));
  });

  isTabActive(path: string): boolean {
    const url = this.currentUrl() || '';
    if (path === '/dashboard') {
      return url === '/' || url === '/dashboard';
    }
    return url.startsWith(path);
  }

  openMore(): void {
    this.uiState.toggleMoreMenu();
  }
}
