import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-container',
  standalone: true,
  templateUrl: './page-container.component.html',
  styleUrl: './page-container.component.scss',
})
export class PageContainerComponent {
  readonly hasBottomNav = input<boolean>(true);
  readonly noPadding = input<boolean>(false);
}
