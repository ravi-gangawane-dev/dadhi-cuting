import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-employee-card',
  standalone: true,
  templateUrl: './employee-card.component.html',
  styleUrl: './employee-card.component.scss',
})
export class EmployeeCardComponent {
  readonly name = input.required<string>();
  readonly role = input.required<string>();
  readonly servicesCount = input<number>(0);
  readonly salesAmount = input<number>(0);
  readonly initials = input<string>('S');

  readonly clicked = output<void>();
}
