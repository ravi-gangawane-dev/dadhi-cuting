import { authGuard } from './core/services/auth.guard';
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'auth/login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/signup',
    loadComponent: () => import('./features/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'onboarding',
    data: { onboarding: true },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'services/new',
    data: { roles: ['owner', 'manager', 'receptionist'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/services/add-service/add-service.component').then(
        (m) => m.AddServiceComponent,
      ),
  },
  {
    path: 'catalog/services',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/services/services-list/services-list.component').then(
        (m) => m.ServicesListComponent,
      ),
  },
  {
    path: 'employees',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/employees/employees-list/employees-list.component').then(
        (m) => m.EmployeesListComponent,
      ),
  },
  {
    path: 'employees/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/employees/employee-profile/employee-profile.component').then(
        (m) => m.EmployeeProfileComponent,
      ),
  },
  {
    path: 'customers',
    data: { roles: ['owner', 'manager', 'receptionist'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customers/customers-list/customers-list.component').then(
        (m) => m.CustomersListComponent,
      ),
  },
  {
    path: 'customers/:id',
    data: { roles: ['owner', 'manager', 'receptionist'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customers/customer-profile/customer-profile.component').then(
        (m) => m.CustomerProfileComponent,
      ),
  },
  {
    path: 'payments',
    data: { roles: ['owner', 'manager', 'receptionist'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/payments/payments-list/payments-list.component').then(
        (m) => m.PaymentsListComponent,
      ),
  },
  {
    path: 'payments/collect',
    data: { roles: ['owner', 'manager', 'receptionist'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/payments/collect-payment/collect-payment.component').then(
        (m) => m.CollectPaymentComponent,
      ),
  },
  {
    path: 'expenses',
    data: { roles: ['owner', 'manager'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/expenses/expenses-list/expenses-list.component').then(
        (m) => m.ExpensesListComponent,
      ),
  },
  {
    path: 'expenses/new',
    data: { roles: ['owner', 'manager'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/expenses/add-expense/add-expense.component').then(
        (m) => m.AddExpenseComponent,
      ),
  },
  {
    path: 'closing',
    data: { roles: ['owner', 'manager'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/daily-closing/daily-closing.component').then(
        (m) => m.DailyClosingComponent,
      ),
  },
  {
    path: 'reports',
    data: { roles: ['owner', 'manager'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/reports/reports.component').then((m) => m.ReportsComponent),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/notifications/notifications.component').then(
        (m) => m.NotificationsComponent,
      ),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'settings/salon',
    data: { roles: ['owner'] },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/settings/salon-profile/salon-profile.component').then(
        (m) => m.SalonProfileComponent,
      ),
  },
  {
    path: 'appointments',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/appointments/appointments.component').then((m) => m.AppointmentsComponent),
  },
  { path: '**', redirectTo: '/dashboard' },
];
