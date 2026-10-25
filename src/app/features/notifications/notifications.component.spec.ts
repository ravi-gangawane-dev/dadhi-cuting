import { TestBed } from '@angular/core/testing';
import { NotificationsComponent } from './notifications.component';
import { provideRouter } from '@angular/router';

describe('NotificationsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(NotificationsComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
