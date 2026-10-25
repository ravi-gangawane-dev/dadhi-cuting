import { TestBed } from '@angular/core/testing';
import { ReportsComponent } from './reports.component';
import { provideRouter } from '@angular/router';

describe('ReportsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
