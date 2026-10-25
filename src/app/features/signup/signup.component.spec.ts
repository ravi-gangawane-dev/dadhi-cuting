import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SignupComponent } from './signup.component';

describe('SignupComponent', () => {
  let component: SignupComponent;
  let fixture: ComponentFixture<SignupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignupComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SignupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('rejects an empty form', () => {
    component.submitted.set(true);
    expect(component.fieldError('fullName')).toContain('Enter your full name');
    expect(component.fieldError('email')).toContain('valid email');
    expect(component.fieldError('mobile')).toContain('10-digit mobile');
    expect(component.fieldError('password')).toContain('at least 8');
  });

  it('accepts a filled form with a 10-digit mobile', () => {
    component.fullName.set('Rohan Patil');
    component.email.set('rohan@example.com');
    component.mobile.set('9130451715');
    component.password.set('secret-pass');
    component.confirmPassword.set('secret-pass');
    expect(component.errors()).toEqual({});
  });

  it('flags mismatched passwords', () => {
    component.password.set('secret-pass');
    component.confirmPassword.set('other-pass');
    expect(component.errors()['confirmPassword']).toContain('do not match');
  });
});
