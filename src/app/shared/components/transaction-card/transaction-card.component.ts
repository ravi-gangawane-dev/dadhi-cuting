import { Component, input, output } from '@angular/core';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';

@Component({
  selector: 'app-transaction-card',
  standalone: true,
  imports: [StatusBadgeComponent],
  templateUrl: './transaction-card.component.html',
  styleUrl: './transaction-card.component.scss',
})
export class TransactionCardComponent {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly amount = input.required<number | string>();
  readonly initials = input<string>('₹');
  readonly status = input<string>('paid');
  readonly showStatusBadge = input<boolean>(false);

  readonly clicked = output<void>();
}
