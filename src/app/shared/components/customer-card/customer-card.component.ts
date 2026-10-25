import { Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-customer-card',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './customer-card.component.html',
  styleUrl: './customer-card.component.scss',
})
export class CustomerCardComponent {
  readonly name = input.required<string>();
  readonly lastVisit = input<string>('Today');
  readonly visitsCount = input<number>(1);
  readonly initials = input<string>('C');

  readonly clicked = output<void>();
}
