import { Component, effect, inject, input, signal } from '@angular/core';
import { StorageService } from '../../../core/data-access/storage.service';
import { SalonStoreService } from '../../../core/services/salon-store.service';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  template: ` <div class="flex flex-col gap-2 text-sm">
    @if (url()) {
      <a [href]="url()" target="_blank" rel="noopener noreferrer" class="text-[#0B5345] underline"
        >View current {{ label() }}</a
      >
    }
    <label class="text-[#687280]"
      >{{ label() }}
      <input
        type="file"
        [accept]="
          kind() === 'expenses'
            ? 'image/jpeg,image/png,image/webp,application/pdf'
            : 'image/jpeg,image/png,image/webp'
        "
        [disabled]="busy()"
        (change)="upload($event)"
        class="block w-full text-xs mt-2"
      />
    </label>
    @if (busy()) {
      <span role="status">Uploading…</span>
    }
    @if (error()) {
      <span role="alert" class="text-red-700">{{ error() }}</span>
    }
  </div>`,
})
export class FileUploadComponent {
  readonly kind = input.required<'logo' | 'employees' | 'expenses'>();
  readonly recordId = input.required<string>();
  readonly label = input('Photo');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly url = signal('');
  private readonly storage = inject(StorageService);
  private readonly store = inject(SalonStoreService);
  constructor() {
    effect((cleanup) => {
      const id = this.recordId(),
        salon = this.store.salon().id,
        kind = this.kind();
      let cancelled = false;
      cleanup(() => (cancelled = true));
      if (!id || !salon) return;
      void this.storage
        .current(salon, kind, id)
        .then((url) => {
          if (!cancelled) this.url.set(url ?? '');
        })
        .catch((e) => {
          if (!cancelled) this.error.set(this.store.message(e));
        });
    });
  }
  async upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.url.set(
        await this.storage.replace(this.store.salon().id, this.kind(), this.recordId(), file),
      );
    } catch (e) {
      this.error.set(this.store.message(e));
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }
}
