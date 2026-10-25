import { SalonStoreService } from './core/services/salon-store.service';
import { Component, effect, inject, signal, HostListener } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { computed } from '@angular/core';
import { filter, map } from 'rxjs';
import { BottomNavigationComponent } from './shared/components/bottom-navigation/bottom-navigation.component';
import { MoreMenuSheetComponent } from './shared/components/more-menu-sheet/more-menu-sheet.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { UiStateService } from './core/services/ui-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, BottomNavigationComponent, MoreMenuSheetComponent, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly online = signal(navigator.onLine);
  @HostListener('window:online') onOnline() {
    this.online.set(true);
  }
  @HostListener('window:offline') onOffline() {
    this.online.set(false);
  }
  private readonly router = inject(Router);
  readonly store = inject(SalonStoreService);
  readonly uiState = inject(UiStateService);

  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects || e.url),
    ),
    { initialValue: this.router.url },
  );

  readonly showBottomNav = computed(() => {
    const url = this.currentUrl() || '';
    return this.store.isLoggedIn() && !url.includes('/auth/login') && !url.includes('/onboarding');
  });

  constructor() {
    let previouslySignedIn = false;
    effect(() => {
      const signedIn = this.store.isLoggedIn();
      if (previouslySignedIn && !signedIn) void this.router.navigateByUrl('/auth/login');
      previouslySignedIn = signedIn;
    });
  }

  closeMoreMenu(): void {
    this.uiState.closeMoreMenu();
  }
}
