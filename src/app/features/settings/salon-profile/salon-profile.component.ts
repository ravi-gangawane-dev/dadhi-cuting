import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { SalonStoreService } from '../../../core/services/salon-store.service';
import { TranslationService } from '../../../core/services/translation.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-salon-profile',
  standalone: true,
  imports: [FileUploadComponent, AppHeaderComponent, ReactiveFormsModule],
  templateUrl: './salon-profile.component.html',
  styleUrl: './salon-profile.component.scss',
})
export class SalonProfileComponent implements OnInit {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly isSaving = signal<boolean>(false);
  readonly selectedLanguage = signal<'en' | 'mr'>('en');

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.pattern(/^\+91\s?\d{5}\s?\d{5}$/)]],
    city: ['', Validators.required],
    timezone: ['', Validators.required],
    openingTime: ['', Validators.required],
    closingTime: ['', Validators.required],
  });

  ngOnInit(): void {
    const salon = this.store.salon();
    this.form.patchValue({
      name: salon.name,
      phone: salon.phone,
      city: salon.city,
      timezone: salon.timezone,
      openingTime: salon.openingTime,
      closingTime: salon.closingTime,
    });
    this.selectedLanguage.set(salon.language);
  }

  setLanguage(lang: 'en' | 'mr'): void {
    this.selectedLanguage.set(lang);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);

    try {
      const vals = this.form.getRawValue();
      await this.store.updateSalonProfile({
        name: vals.name,
        phone: vals.phone,
        city: vals.city,
        timezone: vals.timezone,
        openingTime: vals.openingTime,
        closingTime: vals.closingTime,
        language: this.selectedLanguage(),
      });
      this.toast.show({ type: 'success', message: 'Salon profile updated successfully!' });
      this.router.navigateByUrl('/settings');
    } catch {
      this.toast.show({ type: 'error', message: 'Failed to save. Please try again.' });
    } finally {
      this.isSaving.set(false);
    }
  }

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }
}
