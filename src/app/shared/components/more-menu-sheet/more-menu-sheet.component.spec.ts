import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MoreMenuSheetComponent } from './more-menu-sheet.component';

describe('MoreMenuSheetComponent', () => {
  let component: MoreMenuSheetComponent;
  let fixture: ComponentFixture<MoreMenuSheetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MoreMenuSheetComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MoreMenuSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
