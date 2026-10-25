import { Component, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
})
export class AppHeaderComponent {
  private readonly router = inject(Router);
  readonly i18n = inject(TranslationService);
  readonly store = inject(SalonStoreService);

  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly showBack = input<boolean>(false);
  readonly backUrl = input<string>('/dashboard');
  readonly showLanguageToggle = input<boolean>(true);

  readonly backClicked = output<void>();

  onBack(): void {
    if (this.showBack()) {
      this.backClicked.emit();
      this.router.navigateByUrl(this.backUrl());
    }
  }

  onProfileClick(): void {
    // Navigate to salon profile or settings
    this.router.navigate(['/settings']);
  }

  toggleLanguage(): void {
    this.i18n.toggleLanguage();
  }
}
