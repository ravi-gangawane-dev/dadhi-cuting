import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  Appointment,
  Customer,
  DailyClosingRecord,
  Employee,
  Expense,
  NotificationItem,
  PaymentMethod,
  PaymentTransaction,
  Salon,
  SalonService,
  ServiceEntry,
} from '../../shared/models/salon.models';
import { SalonDataService } from '../data-access/salon-data.service';
import { CategoryRow, ReportSummary } from '../data-access/database.types';
import {
  emptyClosing,
  emptySalon,
  initials,
  mapAppointment,
  mapClosing,
  mapCustomer,
  mapEmployee,
  mapEntry,
  mapExpense,
  mapNotification,
  mapPayments,
  mapSalon,
  mapService,
} from '../data-access/salon-mappers';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { businessDate } from './business-date';
import { TranslationService } from './translation.service';
import { FeatureAccessService } from './feature-access.service';

const emptySummary: ReportSummary = {
  revenue: 0,
  services: 0,
  visits: 0,
  expenses: 0,
  outstanding: 0,
  methods: {},
  chart: [],
  topServices: [],
  employees: [],
};
@Injectable({ providedIn: 'root' })
export class SalonStoreService {
  readonly auth = inject(AuthService);
  private readonly data = inject(SalonDataService);
  private readonly toast = inject(ToastService);
  readonly flags = inject(FeatureAccessService);
  private readonly translation = inject(TranslationService);
  private readonly clock = signal(new Date());
  readonly salon = signal<Salon>({ ...emptySalon });
  readonly employees = signal<Employee[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly services = signal<SalonService[]>([]);
  readonly serviceEntries = signal<ServiceEntry[]>([]);
  readonly payments = signal<PaymentTransaction[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly dailyClosing = signal<DailyClosingRecord>({ ...emptyClosing });
  readonly closingHistory = signal<DailyClosingRecord[]>([]);
  readonly appointments = signal<Appointment[]>([]);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly categories = signal<CategoryRow[]>([]);
  readonly expenseCategories = signal<Omit<CategoryRow, 'active'>[]>([]);
  readonly summary = signal<ReportSummary>({ ...emptySummary });
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly needsOnboarding = signal(false);
  /** The signed-in account exists but every membership is inactive. */
  readonly accountSuspended = signal(false);
  readonly profilePhone = signal('');
  readonly isLoggedIn = this.auth.loggedIn;
  readonly currentUser = signal({ name: '', initials: '', role: '' });
  readonly canManage = computed(() => ['owner', 'manager'].includes(this.currentUser().role));
  readonly canOperate = computed(() =>
    ['owner', 'manager', 'receptionist'].includes(this.currentUser().role),
  );
  readonly today = computed(() => businessDate(this.clock(), this.salon().timezone));
  readonly todayRevenue = computed(() => this.summary().revenue);
  readonly todayServicesCount = computed(() => this.summary().services);
  readonly todayVisits = computed(() => this.summary().visits);
  readonly todayExpenses = computed(() => this.summary().expenses);
  readonly todayNetEarnings = computed(() => this.todayRevenue() - this.todayExpenses());
  readonly todayPending = computed(() => this.summary().outstanding);
  readonly todayCollected = computed(() =>
    Object.values(this.summary().methods).reduce((s, v) => s + (v ?? 0), 0),
  );
  readonly paymentMethodTotals = computed(() => ({
    cash: this.summary().methods.cash ?? 0,
    upi: this.summary().methods.upi ?? 0,
    card: this.summary().methods.card ?? 0,
    pending: this.todayPending(),
  }));
  readonly todayCashExpenses = computed(() =>
    this.expenses()
      .filter((e) => e.date === this.today() && e.paidUsing === 'cash')
      .reduce((s, e) => s + e.amount, 0),
  );
  readonly expectedCash = computed(
    () =>
      this.dailyClosing().openingCash + this.paymentMethodTotals().cash - this.todayCashExpenses(),
  );
  readonly unreadNotificationsCount = computed(
    () => this.notifications().filter((n) => !n.isRead).length,
  );
  private loadedUser = '';
  private loadPromise: Promise<void> | null = null;
  private generation = 0;
  constructor() {
    effect(() => {
      const user = this.auth.session()?.user.id ?? '';
      if (!user) this.clear();
      else if (this.loadedUser && this.loadedUser !== user) this.clear();
    });
    const timer = setInterval(() => {
      const now = new Date();
      if (businessDate(now, this.salon().timezone) !== this.today()) {
        this.clock.set(now);
        if (this.loadedUser) void this.refresh().catch((e) => this.error.set(this.message(e)));
      }
    }, 60000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  clear() {
    this.generation++;
    this.loadedUser = '';
    this.loadPromise = null;
    this.needsOnboarding.set(false);
    this.accountSuspended.set(false);
    this.profilePhone.set('');
    this.salon.set({ ...emptySalon });
    this.currentUser.set({ name: '', initials: '', role: '' });
    this.employees.set([]);
    this.customers.set([]);
    this.services.set([]);
    this.serviceEntries.set([]);
    this.payments.set([]);
    this.expenses.set([]);
    this.appointments.set([]);
    this.notifications.set([]);
    this.closingHistory.set([]);
    this.categories.set([]);
    this.expenseCategories.set([]);
    this.summary.set({ ...emptySummary });
    this.dailyClosing.set({ ...emptyClosing });
  }
  async ensureLoaded() {
    await this.auth.ready;
    const user = this.auth.session()?.user;
    if (!user) throw new Error('Sign in to continue.');
    if (this.loadedUser === user.id && (this.salon().id || this.needsOnboarding())) return;
    if (this.loadPromise) return this.loadPromise;
    const generation = this.generation;
    this.loadPromise = (async () => {
      this.loading.set(true);
      this.error.set('');
      try {
        // All memberships, including inactive ones, so a suspended account is
        // recognised instead of being pushed to salon onboarding.
        const { data: members, error } = await this.data.client
          .from('salon_members')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at');
        if (error) throw error;
        const active = (members ?? []).filter((m) => m.active);
        if (!active.length) {
          const { data: ownProfile, error: ownProfileError } = await this.data.client
            .from('user_profiles')
            .select('full_name,phone')
            .eq('id', user.id)
            .maybeSingle();
          if (ownProfileError) throw ownProfileError;
          this.profilePhone.set(ownProfile?.phone ?? '');
          if (generation !== this.generation || this.auth.session()?.user.id !== user.id) return;
          const ownName = ownProfile?.full_name || user.email || 'Account';
          this.currentUser.set({ name: ownName, initials: initials(ownName), role: '' });
          this.needsOnboarding.set(true);
          this.accountSuspended.set((members ?? []).length > 0);
          this.loadedUser = user.id;
          return;
        }
        const membership = active[0];
        const { data: salon, error: salonError } = await this.data.client
          .from('salons')
          .select('*')
          .eq('id', membership.salon_id)
          .single();
        if (salonError) throw salonError;
        const { data: profile, error: profileError } = await this.data.client
          .from('user_profiles')
          .select('full_name,phone')
          .eq('id', user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (generation !== this.generation || this.auth.session()?.user.id !== user.id) return;
        this.profilePhone.set(profile?.phone ?? '');
        this.salon.set(mapSalon(salon));
        this.translation.setLanguage(salon.language);
        const name = profile?.full_name || user.email || 'Account';
        this.currentUser.set({ name, initials: initials(name), role: membership.role });
        await this.refresh();
        // Backend-evaluated feature entitlements for this salon; a failure must
        // not block the salon itself (guards re-check per navigation).
        try {
          await this.flags.ensureLoaded(this.salon().id);
        } catch {
          /* feature status stays empty; route guards fail closed */
        }
        try {
          // Membership states drive the Owner's login management UI; other
          // roles are only permitted by RLS to see their own row.
          if (membership.role === 'owner') await this.loadMemberStatuses();
        } catch {
          /* status column renders 'no data' rather than blocking the page */
        }
        if (generation === this.generation) this.loadedUser = user.id;
      } catch (e) {
        this.error.set(this.message(e));
        throw e;
      } finally {
        this.loading.set(false);
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }
  async refresh() {
    const s = this.salon().id;
    if (!s) return;
    const generation = this.generation;
    const [
      employees,
      customers,
      services,
      categories,
      entries,
      items,
      payments,
      expenses,
      expenseCategories,
      closings,
      appointments,
      notifications,
      summary,
    ] = await Promise.all([
      this.data.list('employees', s),
      this.data.list('customers', s),
      this.data.list('services', s),
      this.data.list('service_categories', s),
      this.data.list('service_entries', s),
      this.data.list('service_entry_items', s),
      this.data.list('payments', s),
      this.data.list('expenses', s),
      this.data.list('expense_categories', s),
      this.data.list('daily_closings', s),
      this.data.list('appointments', s),
      this.data.list('notifications', s),
      this.data.report(s, this.today(), this.today()),
    ]);
    if (generation !== this.generation || this.salon().id !== s) return;
    const tz = this.salon().timezone;
    const mapped = entries
      .map((e) => mapEntry(e, items, payments, employees, customers, tz))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    this.serviceEntries.set(mapped);
    this.employees.set(employees.map((e) => mapEmployee(e, mapped, this.today())));
    this.customers.set(customers.map((c) => mapCustomer(c, mapped)));
    this.categories.set(categories);
    this.expenseCategories.set(expenseCategories);
    this.services.set(services.map((s) => mapService(s, categories)));
    this.payments.set(
      this.currentUser().role === 'employee' ? [] : mapPayments(payments, mapped, tz),
    );
    this.expenses.set(expenses.map((e) => mapExpense(e, expenseCategories)));
    const history = closings
      .map((c) => mapClosing(c, tz))
      .sort((a, b) => b.date.localeCompare(a.date));
    this.closingHistory.set(history);
    this.dailyClosing.set(
      history.find((c) => c.date === this.today()) ?? { ...emptyClosing, date: this.today() },
    );
    this.appointments.set(
      appointments
        .map((a) => mapAppointment(a, employees, customers))
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    );
    this.notifications.set(
      notifications
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((n) => mapNotification(n, this.today(), tz)),
    );
    this.summary.set(summary);
  }
  message(e: unknown): string {
    return e && typeof e === 'object' && 'message' in e
      ? String(e.message)
      : 'Unable to complete the request.';
  }
  async mutation<T>(action: () => Promise<T>): Promise<T> {
    if (this.saving()) throw new Error('A save is already in progress.');
    this.saving.set(true);
    this.error.set('');
    try {
      const result = await action();
      try {
        await this.refresh();
        this.toast.success('Saved successfully');
      } catch (e) {
        this.error.set('Saved, but refreshing data failed. Refresh before making another change.');
        this.toast.error(this.error());
      }
      return result;
    } catch (e) {
      this.error.set(this.message(e));
      this.toast.error(this.message(e));
      throw e;
    } finally {
      this.saving.set(false);
    }
  }
  async login(email: string, password: string): Promise<boolean> {
    try {
      await this.auth.login(email, password);
      await this.ensureLoaded();
      return true;
    } catch (e) {
      this.error.set(this.message(e));
      this.toast.error(this.message(e));
      return false;
    }
  }
  /**
   * Creates an account, then stores the name and mobile on the profile so the
   * number can be used to sign in. Returns 'confirm-email' when Supabase still
   * requires the confirmation link to be opened before a session exists.
   */
  async register(input: {
    fullName: string;
    email: string;
    mobile: string;
    password: string;
  }): Promise<'signed-in' | 'confirm-email'> {
    let result: Awaited<ReturnType<AuthService['signUp']>>;
    try {
      result = await this.auth.signUp(input);
      // Supabase answers a duplicate signup with an empty identities list rather
      // than an error, so this is the only signal that the email is taken.
      if ((result.user?.identities?.length ?? 1) === 0)
        throw new Error('An account with this email already exists. Sign in instead.');
      if (!result.session) return 'confirm-email';
      await this.updateProfile(input.fullName, input.mobile);
      this.loadedUser = '';
      await this.ensureLoaded();
      return 'signed-in';
    } catch (e) {
      throw this.accountError(e);
    }
  }
  private accountError(e: unknown): Error {
    const text = this.message(e);
    if (/user_profiles_phone_key|duplicate key/i.test(text))
      return new Error('That mobile number is already registered to another account.');
    // The project still uses Supabase's built-in sender, which only allows a few
    // signup emails per hour for the whole project.
    if (/over_email_send_rate_limit|email rate limit exceeded/i.test(text))
      return new Error(
        'The signup email could not be sent: Supabase’s built-in sender is limited to a few emails per hour. Turn off “Confirm email” in Authentication → Sign In / Providers → Email, or connect your own SMTP sender, then try again.',
      );
    if (/email_address_invalid|invalid format/i.test(text))
      return new Error('That email address was rejected. Use a regular address such as you@gmail.com.');
    if (/already registered|email_exists/i.test(text))
      return new Error('An account with this email already exists. Sign in instead.');
    return new Error(text);
  }
  async logout() {
    await this.auth.logout();
    this.clear();
  }
  /** Creates the caller's first salon through a server-validated RPC. */
  async createSalon(name: string) {
    if (!name.trim()) throw new Error('Enter a salon name.');
    if (this.saving()) throw new Error('A save is already in progress.');
    this.saving.set(true);
    this.error.set('');
    try {
      await this.data.rpc('create_my_salon', { p_name: name.trim() });
      this.needsOnboarding.set(false);
      this.loadedUser = '';
      await this.ensureLoaded();
    } catch (e) {
      this.error.set(this.message(e));
      throw e;
    } finally {
      this.saving.set(false);
    }
  }
  async createServiceEntry(
    payload: {
      employeeId: string;
      customerId?: string;
      customerName?: string;
      selectedServices: SalonService[];
      discount?: number;
      paymentMethod: PaymentMethod;
      notes?: string;
    },
    requestId: string = crypto.randomUUID(),
  ): Promise<ServiceEntry> {
    const id = await this.mutation(() =>
      this.data.rpc('create_service_entry', {
        p_salon: this.salon().id,
        p_employee: payload.employeeId,
        p_customer: payload.customerId === 'cust_walkin' ? null : (payload.customerId ?? null),
        p_items: payload.selectedServices.map((s) => ({ service_id: s.id, quantity: 1 })),
        p_discount: payload.discount ?? 0,
        p_notes: payload.notes ?? '',
        p_request: requestId,
      }),
    );
    const entry = this.serviceEntries().find((e) => e.id === id);
    if (!entry)
      throw new Error('Saved, but invoice refresh failed. Reload payments before retrying.');
    return entry;
  }
  async collectPayment(
    invoiceId: string,
    amount: number,
    method: PaymentMethod,
    confirmation: string,
    requestId: string,
    split?: { cash: number; upi: number },
  ) {
    if (method === 'pending') return;
    const parts =
      method === 'split'
        ? [
            { method: 'cash', amount: split?.cash ?? 0 },
            { method: 'upi', amount: split?.upi ?? 0 },
          ]
        : [{ method, amount }];
    if (
      parts.some((p) => !Number.isFinite(p.amount) || p.amount <= 0) ||
      Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100) !== Math.round(amount * 100)
    )
      throw new Error('Payment parts must be positive and add up to the amount.');
    await this.mutation(() =>
      this.data.rpc('record_payment', {
        p_salon: this.salon().id,
        p_entry: invoiceId,
        p_parts: parts,
        p_confirmation: confirmation,
        p_request: requestId,
      }),
    );
  }
  async addEmployee(p: {
    name: string;
    role: Employee['role'];
    phone: string;
    commissionRate: number;
  }) {
    return this.mutation(() =>
      this.data.insert('employees', {
        salon_id: this.salon().id,
        full_name: p.name,
        designation: p.role,
        phone: p.phone,
        commission_rate: p.commissionRate,
      }),
    );
  }
  async updateEmployee(id: string, p: Partial<Employee>) {
    return this.mutation(() =>
      this.data.update('employees', id, this.salon().id, {
        ...(p.name !== undefined ? { full_name: p.name } : {}),
        ...(p.phone !== undefined ? { phone: p.phone } : {}),
        ...(p.role !== undefined ? { designation: p.role } : {}),
        ...(p.active !== undefined ? { active: p.active } : {}),
        ...(p.commissionRate !== undefined ? { commission_rate: p.commissionRate } : {}),
      }),
    );
  }
  /**
   * Server-side employee login provisioning (Edge Function, service role):
   * creates the Auth account, links it to the staff record and adds an audited
   * membership row. Returns the one-time temporary password for handover.
   */
  async createEmployeeAccount(p: {
    employeeId: string;
    email: string;
    role: 'manager' | 'receptionist' | 'employee' | 'accountant';
  }): Promise<{ temporaryPassword: string }> {
    const { data, error } = await this.data.client.functions.invoke('manage-employee-account', {
      body: {
        action: 'create',
        salonId: this.salon().id,
        employeeId: p.employeeId,
        email: p.email.trim(),
        role: p.role,
      },
    });
    if (error) throw error;
    const result = data as { error?: string; temporaryPassword?: string };
    if (result?.error) throw new Error(result.error);
    if (!result?.temporaryPassword) throw new Error('Account service did not return credentials.');
    return { temporaryPassword: result.temporaryPassword };
  }
  /** Owner-assisted password recovery: issues a new temporary password. */
  async resetEmployeePassword(employeeUserId: string): Promise<{ temporaryPassword: string }> {
    const { data, error } = await this.data.client.functions.invoke('manage-employee-account', {
      body: {
        action: 'reset_password',
        salonId: this.salon().id,
        userId: employeeUserId,
      },
    });
    if (error) throw error;
    const result = data as { error?: string; temporaryPassword?: string };
    if (result?.error) throw new Error(result.error);
    if (!result?.temporaryPassword) throw new Error('Account service did not return credentials.');
    return { temporaryPassword: result.temporaryPassword };
  }
  /** Suspends/restores the row in `salon_members` — audited, server-side. */
  async setMemberActive(userId: string, active: boolean) {
    const result = await this.mutation(async () => {
      await this.data.rpc('set_member_active', {
        p_salon: this.salon().id,
        p_user: userId,
        p_active: active,
      });
      return null;
    });
    // A suspended member must also lose their open sessions; RLS already
    // contained data access, this removes the live browsing session too.
    // Best effort only: the suspension itself has already succeeded.
    if (!active) {
      try {
        await this.data.client.functions.invoke('manage-employee-account', {
          body: { action: 'revoke_session', salonId: this.salon().id, userId },
        });
      } catch {
        /* revocation detail surfaces in the audit log, not as a UI error */
      }
    }
    return result;
  }
  async setMemberRole(userId: string, role: 'manager' | 'receptionist' | 'employee' | 'accountant') {
    return this.mutation(async () => {
      await this.data.rpc('set_member_role', {
        p_salon: this.salon().id,
        p_user: userId,
        p_role: role,
      });
    });
  }
  /** Owner-visible membership states for the employee login management UI. */
  readonly memberStatuses = signal<Map<string, { active: boolean; role: string }>>(new Map());
  async loadMemberStatuses(): Promise<void> {
    const { data, error } = await this.data.client
      .from('salon_members')
      .select('user_id,role,active')
      .eq('salon_id', this.salon().id);
    if (error) throw error;
    this.memberStatuses.set(
      new Map(
        ((data ?? []) as { user_id: string; role: string; active: boolean }[]).map((m) => [
          m.user_id,
          { active: m.active, role: m.role },
        ]),
      ),
    );
  }
  async addCustomer(p: { name: string; phone: string; notes?: string }) {
    return this.mutation(() =>
      this.data.insert('customers', {
        salon_id: this.salon().id,
        full_name: p.name,
        phone: p.phone,
        notes: p.notes ?? '',
      }),
    );
  }
  async updateCustomer(id: string, p: { name: string; phone: string; notes?: string }) {
    return this.mutation(() =>
      this.data.update('customers', id, this.salon().id, {
        full_name: p.name,
        phone: p.phone,
        notes: p.notes ?? '',
      }),
    );
  }
  async addService(p: { name: string; category: string; price: number; durationMinutes: number }) {
    return this.mutation(() =>
      this.data.insert('services', {
        salon_id: this.salon().id,
        name: p.name,
        category_id: this.categories().find((c) => c.name === p.category)?.id,
        price: p.price,
        duration_minutes: p.durationMinutes,
      }),
    );
  }
  async updateService(id: string, p: Partial<SalonService>) {
    return this.mutation(() =>
      this.data.update('services', id, this.salon().id, {
        ...(p.category !== undefined
          ? { category_id: this.categories().find((c) => c.name === p.category)?.id }
          : {}),
        ...(p.name !== undefined ? { name: p.name } : {}),
        ...(p.price !== undefined ? { price: p.price } : {}),
        ...(p.durationMinutes !== undefined ? { duration_minutes: p.durationMinutes } : {}),
        ...(p.active !== undefined ? { active: p.active } : {}),
      }),
    );
  }
  async addExpense(p: {
    title: string;
    category: string;
    amount: number;
    paidUsing: Expense['paidUsing'];
    date: string;
    notes?: string;
  }) {
    return this.mutation(() =>
      this.data.insert('expenses', {
        salon_id: this.salon().id,
        description: p.title,
        category_id: this.expenseCategories().find((c) => c.name === p.category)?.id,
        amount: p.amount,
        payment_method: p.paidUsing,
        expense_date: p.date,
        notes: p.notes ?? '',
      }),
    );
  }
  async updateExpense(
    id: string,
    p: {
      title: string;
      category: string;
      amount: number;
      paidUsing: Expense['paidUsing'];
      date: string;
      notes?: string;
    },
  ) {
    return this.mutation(() =>
      this.data.update('expenses', id, this.salon().id, {
        description: p.title,
        category_id: this.expenseCategories().find((c) => c.name === p.category)?.id,
        amount: p.amount,
        payment_method: p.paidUsing,
        expense_date: p.date,
        notes: p.notes ?? '',
      }),
    );
  }
  async voidServiceEntry(id: string, reason: string) {
    return this.mutation(() =>
      this.data.rpc('void_service_entry', {
        p_salon: this.salon().id,
        p_entry: id,
        p_reason: reason,
      }),
    );
  }
  async voidPayment(id: string, reason: string) {
    return this.mutation(() =>
      this.data.rpc('void_payment', {
        p_salon: this.salon().id,
        p_payment: id,
        p_reason: reason,
      }),
    );
  }
  async deleteExpense(id: string) {
    return this.mutation(() => this.data.remove('expenses', id, this.salon().id));
  }
  async deleteAppointment(id: string) {
    return this.mutation(() => this.data.remove('appointments', id, this.salon().id));
  }
  async rescheduleAppointment(
    id: string,
    p: { date: string; time: string; endTime: string; employeeId: string; serviceName: string },
  ) {
    return this.mutation(() =>
      this.data.update('appointments', id, this.salon().id, {
        appointment_date: p.date,
        start_time: p.time,
        end_time: p.endTime,
        employee_id: p.employeeId,
        notes: p.serviceName,
      }),
    );
  }
  async updateServiceCategory(id: string, p: { name?: string; active?: boolean }) {
    return this.mutation(() =>
      this.data.update('service_categories', id, this.salon().id, p),
    );
  }
  async addExpenseCategory(name: string) {
    if (!name.trim()) throw new Error('Enter a category name.');
    return this.mutation(() =>
      this.data.insert('expense_categories', {
        salon_id: this.salon().id,
        name: name.trim(),
      }),
    );
  }
  async renameExpenseCategory(id: string, name: string) {
    if (!name.trim()) throw new Error('Enter a category name.');
    return this.mutation(() =>
      this.data.update('expense_categories', id, this.salon().id, { name: name.trim() }),
    );
  }
  async closeBusinessDay(countedCash: number, openingCash = 0) {
    await this.mutation(() =>
      this.data.rpc('close_business_day', {
        p_salon: this.salon().id,
        p_date: this.today(),
        p_opening: openingCash,
        p_counted: countedCash,
      }),
    );
    return this.dailyClosing();
  }
  async addAppointment(p: {
    time: string;
    endTime: string;
    customerId: string;
    employeeId: string;
    serviceName: string;
    date: string;
  }) {
    return this.mutation(() =>
      this.data.insert('appointments', {
        salon_id: this.salon().id,
        customer_id: p.customerId,
        employee_id: p.employeeId,
        appointment_date: p.date,
        start_time: p.time,
        end_time: p.endTime,
        notes: p.serviceName,
      }),
    );
  }
  async updateAppointmentStatus(id: string, status: Appointment['status']) {
    return this.mutation(() => this.data.update('appointments', id, this.salon().id, { status }));
  }
  async markNotificationRead(id: string) {
    return this.mutation(() =>
      this.data.update('notifications', id, this.salon().id, { read_at: new Date().toISOString() }),
    );
  }
  async markAllNotificationsRead() {
    await this.mutation(async () => {
      const { error } = await this.data.client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('salon_id', this.salon().id)
        .is('read_at', null);
      if (error) throw error;
    });
  }
  async updateSalonProfile(p: Partial<Salon>) {
    await this.mutation(async () => {
      await this.data.update('salons', this.salon().id, this.salon().id, {
        name: p.name,
        phone: p.phone,
        address: p.city,
        opening_hours: {
          opening: p.openingTime ?? this.salon().openingTime,
          closing: p.closingTime ?? this.salon().closingTime,
        },
        language: p.language,
        timezone: p.timezone,
      });
      this.salon.update((s) => ({ ...s, ...p }));
      if (p.language) this.translation.setLanguage(p.language);
    });
  }
  canAccess(route: string) {
    if (['/closing', '/reports', '/expenses', '/expenses/new'].includes(route))
      return this.canManage();
    if (route === '/settings/salon') return this.currentUser().role === 'owner';
    if (['/customers', '/services/new', '/payments'].includes(route)) return this.canOperate();
    return true;
  }
  async addCategory(name: string) {
    if (!name.trim()) throw new Error('Enter a category name.');
    return this.mutation(() =>
      this.data.insert('service_categories', {
        salon_id: this.salon().id,
        name: name.trim(),
        active: true,
      }),
    );
  }
  async updateProfile(name: string, phone = this.profilePhone()) {
    const user = this.auth.session()?.user;
    if (!user) throw new Error('Sign in required');
    if (!name.trim()) throw new Error('Enter your name.');
    const mobile = phone.replace(/\D/g, '');
    const normalised = mobile.length === 12 && mobile.startsWith('91') ? mobile.slice(2) : mobile;
    if (normalised && normalised.length !== 10)
      throw new Error('Enter a 10-digit mobile number.');
    const { data: profile, error: readError } = await this.data.client
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (readError) throw readError;
    const patch = { full_name: name.trim(), phone: normalised };
    const { error } = profile
      ? await this.data.client.from('user_profiles').update(patch).eq('id', user.id)
      : await this.data.client.from('user_profiles').insert({ id: user.id, ...patch });
    if (error) throw error;
    this.profilePhone.set(normalised);
    this.currentUser.update((u) => ({ ...u, name: name.trim(), initials: initials(name) }));
  }
  async report(from: string, to: string) {
    return this.data.report(this.salon().id, from, to);
  }
  async searchCustomers(search: string, page: number) {
    const result = await this.data.customersPage(this.salon().id, search, page);
    return {
      rows: result.rows.map((c) => mapCustomer(c, this.serviceEntries())),
      total: result.total,
    };
  }
}
