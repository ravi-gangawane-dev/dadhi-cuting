import { TestBed } from '@angular/core/testing';
import { SalonProfileComponent } from './salon-profile.component';
import { provideRouter } from '@angular/router';

describe('SalonProfileComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalonProfileComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(SalonProfileComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
