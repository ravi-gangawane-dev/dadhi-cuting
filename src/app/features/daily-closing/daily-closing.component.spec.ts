import { TestBed } from '@angular/core/testing';
import { DailyClosingComponent } from './daily-closing.component';
import { provideRouter } from '@angular/router';

describe('DailyClosingComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DailyClosingComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(DailyClosingComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });
});
