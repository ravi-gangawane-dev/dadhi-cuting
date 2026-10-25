import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiStateService {
  readonly isMoreMenuOpen = signal<boolean>(false);

  openMoreMenu(): void {
    this.isMoreMenuOpen.set(true);
  }

  closeMoreMenu(): void {
    this.isMoreMenuOpen.set(false);
  }

  toggleMoreMenu(): void {
    this.isMoreMenuOpen.update(v => !v);
  }
}
