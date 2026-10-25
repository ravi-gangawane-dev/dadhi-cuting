import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TransactionCardComponent } from './transaction-card.component';

describe('TransactionCardComponent', () => {
  let component: TransactionCardComponent;
  let fixture: ComponentFixture<TransactionCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransactionCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TransactionCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Haircut + beard');
    fixture.componentRef.setInput('subtitle', 'Sagar Patil • 10:32 AM');
    fixture.componentRef.setInput('amount', '₹350');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
