import { Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-service-card',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './service-card.component.html',
  styleUrl: './service-card.component.scss',
})
export class ServiceCardComponent {
  readonly name = input.required<string>();
  readonly price = input.required<number>();
  readonly duration = input<number>(30);
  readonly category = input<string>('Hair');
  readonly codeLetter = input<string>('C');
  readonly selectable = input<boolean>(false);
  readonly selected = input<boolean>(false);

  readonly toggled = output<void>();
}
