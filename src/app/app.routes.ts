import { authGuard } from './core/services/auth.guard';
import { featureGuard } from './core/services/feature.guard';
import { platformGuard, platformSetupGuard } from './core/services/platform.guard';
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
    path: 'account-locked',
    data: { 'account-locked': true },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account-locked/account-locked.component').then(
        (m) => m.AccountLockedComponent,
      ),
  },
  // MFA setup lives outside the guarded portal: a platform admin without a
  // second factor must be able to enroll. The setup guard re-checks identity.
  {
    path: 'platform-admin/mfa',
    canActivate: [platformSetupGuard],
    loadComponent: () =>
      import('./features/platform-admin/platform-mfa.component').then(
        (m) => m.PlatformMfaComponent,
      ),
  },
  {
    path: 'platform-admin',
    canActivate: [platformGuard],
    loadComponent: () =>
      import('./features/platform-admin/platform-shell.component').then(
        (m) => m.PlatformShellComponent,
      ),
    children: [
      { path: '', loadComponent: () => import('./features/platform-admin/platform-dashboard.component').then((m) => m.PlatformDashboardComponent) },
      { path: 'salons', loadComponent: () => import('./features/platform-admin/platform-salons.component').then((m) => m.PlatformSalonsComponent) },
      { path: 'salons/:id', loadComponent: () => import('./features/platform-admin/platform-salon-detail.component').then((m) => m.PlatformSalonDetailComponent) },
      { path: 'users', loadComponent: () => import('./features/platform-admin/platform-users.component').then((m) => m.PlatformUsersComponent) },
      { path: 'features', loadComponent: () => import('./features/platform-admin/platform-features.component').then((m) => m.PlatformFeaturesComponent) },
      { path: 'audit', loadComponent: () => import('./features/platform-admin/platform-audit.component').then((m) => m.PlatformAuditComponent) },
      { path: 'settings', loadComponent: () => import('./features/platform-admin/platform-settings.component').then((m) => m.PlatformSettingsComponent) },
    ],
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
    data: { roles: ['owner', 'manager', 'receptionist'], feature: 'services' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/services/add-service/add-service.component').then(
        (m) => m.AddServiceComponent,
      ),
  },
  {
    path: 'catalog/services',
    data: { feature: 'services' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/services/services-list/services-list.component').then(
        (m) => m.ServicesListComponent,
      ),
  },
  {
    path: 'employees',
    data: { feature: 'employees' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/employees/employees-list/employees-list.component').then(
        (m) => m.EmployeesListComponent,
      ),
  },
  {
    path: 'employees/:id',
    data: { feature: 'employees' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/employees/employee-profile/employee-profile.component').then(
        (m) => m.EmployeeProfileComponent,
      ),
  },
  {
    path: 'customers',
    data: { roles: ['owner', 'manager', 'receptionist'], feature: 'customers' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/customers/customers-list/customers-list.component').then(
        (m) => m.CustomersListComponent,
      ),
  },
  {
    path: 'customers/:id',
    data: { roles: ['owner', 'manager', 'receptionist'], feature: 'customers' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/customers/customer-profile/customer-profile.component').then(
        (m) => m.CustomerProfileComponent,
      ),
  },
  {
    path: 'payments',
    data: { roles: ['owner', 'manager', 'receptionist'], feature: 'payments' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/payments/payments-list/payments-list.component').then(
        (m) => m.PaymentsListComponent,
      ),
  },
  {
    path: 'payments/collect',
    data: { roles: ['owner', 'manager', 'receptionist'], feature: 'payments' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/payments/collect-payment/collect-payment.component').then(
        (m) => m.CollectPaymentComponent,
      ),
  },
  {
    path: 'expenses',
    data: { roles: ['owner', 'manager'], feature: 'expenses' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/expenses/expenses-list/expenses-list.component').then(
        (m) => m.ExpensesListComponent,
      ),
  },
  {
    path: 'expenses/new',
    data: { roles: ['owner', 'manager'], feature: 'expenses' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/expenses/add-expense/add-expense.component').then(
        (m) => m.AddExpenseComponent,
      ),
  },
  {
    path: 'closing',
    data: { roles: ['owner', 'manager'], feature: 'daily_closing' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/daily-closing/daily-closing.component').then(
        (m) => m.DailyClosingComponent,
      ),
  },
  {
    path: 'reports',
    data: { roles: ['owner', 'manager', 'accountant'], feature: 'reports' },
    canActivate: [authGuard, featureGuard],
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
    data: { feature: 'appointments' },
    canActivate: [authGuard, featureGuard],
    loadComponent: () =>
      import('./features/appointments/appointments.component').then((m) => m.AppointmentsComponent),
  },
  { path: '**', redirectTo: '/dashboard' },
];