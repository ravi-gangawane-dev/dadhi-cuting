import { A11yModule } from '@angular/cdk/a11y';
import { Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-custom-dialog',
  standalone: true,
  imports: [A11yModule, IconComponent],
  templateUrl: './custom-dialog.component.html',
  styleUrl: './custom-dialog.component.scss',
})
export class CustomDialogComponent {
  readonly isOpen = input<boolean>(false);
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');

  readonly closed = output<void>();

  onClose(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('backdrop-layer')) {
      this.onClose();
    }
  }
}
