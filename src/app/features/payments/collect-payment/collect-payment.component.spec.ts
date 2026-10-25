import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CollectPaymentComponent } from './collect-payment.component';

describe('CollectPaymentComponent', () => {
  let component: CollectPaymentComponent;
  let fixture: ComponentFixture<CollectPaymentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CollectPaymentComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectPaymentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
