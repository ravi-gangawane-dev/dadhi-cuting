import { businessDate } from '../services/business-date';
import {
  Appointment,
  Customer,
  DailyClosingRecord,
  Employee,
  Expense,
  NotificationItem,
  PaymentTransaction,
  Salon,
  SalonService,
  ServiceEntry,
} from '../../shared/models/salon.models';
import {
  AppointmentRow,
  CategoryRow,
  ClosingRow,
  CustomerRow,
  EmployeeRow,
  EntryRow,
  ExpenseRow,
  ItemRow,
  NotificationRow,
  PaymentRow,
  SalonRow,
  ServiceRow,
} from './database.types';
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
const time = (value: string, tz: string) =>
  new Date(value).toLocaleTimeString('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
export const emptySalon: Salon = {
  id: '',
  name: '',
  nameMarathi: '',
  tagline: '',
  taglineMarathi: '',
  phone: '',
  city: '',
  openingTime: '09:00',
  closingTime: '21:00',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  language: 'en',
};
export const emptyClosing: DailyClosingRecord = {
  id: '',
  date: '',
  grossSales: 0,
  expenses: 0,
  netResult: 0,
  servicesCount: 0,
  openingCash: 0,
  cashReceived: 0,
  cashExpenses: 0,
  expectedCash: 0,
  countedCash: 0,
  variance: 0,
  closedBy: '',
  closedAt: '',
  status: 'open',
};
export function mapSalon(r: SalonRow): Salon {
  const hours = r.opening_hours as { opening?: string; closing?: string };
  return {
    id: r.id,
    name: r.name,
    nameMarathi: r.name_marathi,
    tagline: r.tagline,
    taglineMarathi: r.tagline_marathi,
    phone: r.phone,
    city: r.address,
    openingTime: hours.opening ?? '09:00',
    closingTime: hours.closing ?? '21:00',
    currency: 'INR',
    timezone: r.timezone,
    language: r.language,
  };
}
export function mapEmployee(r: EmployeeRow, entries: ServiceEntry[], today: string): Employee {
  const own = entries.filter(
    (e) => e.employeeId === r.id && e.businessDate === today && e.status === 'completed',
  );
  return {
    id: r.id,
    name: r.full_name,
    initials: initials(r.full_name),
    role: r.designation as Employee['role'],
    roleDisplay: r.designation.replaceAll('_', ' '),
    roleDisplayMarathi: r.designation.replaceAll('_', ' '),
    phone: r.phone,
    active: r.active,
    commissionRate: r.commission_rate,
    servicesToday: own.reduce((n, e) => n + e.services.reduce((s, i) => s + i.quantity, 0), 0),
    salesToday: own.reduce((s, e) => s + e.total, 0),
    joinedDate: r.created_at.slice(0, 10),
  };
}
export function mapCustomer(r: CustomerRow, entries: ServiceEntry[] = []): Customer {
  const own = entries.filter((e) => e.customerId === r.id && e.status === 'completed');
  return {
    id: r.id,
    name: r.full_name,
    initials: initials(r.full_name),
    phone: r.phone,
    visitsCount: own.length,
    lifetimeSpend: own.reduce((s, e) => s + e.total, 0),
    lastVisit:
      own
        .map((e) => e.businessDate)
        .sort()
        .at(-1) ?? 'No visits',
    badge: own.length ? 'Returning customer' : 'New customer',
    notes: r.notes,
  };
}
export function mapService(r: ServiceRow, categories: CategoryRow[]): SalonService {
  return {
    id: r.id,
    name: r.name,
    category: (categories.find((c) => c.id === r.category_id)?.name ??
      'Hair') as SalonService['category'],
    price: r.price,
    durationMinutes: r.duration_minutes,
    active: r.active,
    codeLetter: r.name[0] ?? 'S',
  };
}
export function mapEntry(
  r: EntryRow,
  items: ItemRow[],
  payments: PaymentRow[],
  employees: EmployeeRow[],
  customers: CustomerRow[],
  tz: string,
): ServiceEntry {
  const receipts = payments.filter((p) => p.service_entry_id === r.id);
  const paid = receipts.reduce((s, p) => s + p.amount, 0);
  return {
    id: r.id,
    invoiceId: r.id,
    businessDate: r.service_date,
    time: time(r.created_at, tz),
    employeeId: r.employee_id,
    employeeName: employees.find((e) => e.id === r.employee_id)?.full_name ?? 'Staff',
    customerId: r.customer_id ?? 'cust_walkin',
    customerName:
      customers.find((c) => c.id === r.customer_id)?.full_name ??
      (r.customer_id ? 'Customer' : 'Walk-in customer'),
    services: items
      .filter((i) => i.service_entry_id === r.id)
      .map((i) => ({
        serviceId: i.service_id,
        name: i.service_name,
        price: i.unit_price,
        quantity: i.quantity,
      })),
    subtotal: r.subtotal,
    discount: r.discount_amount,
    total: r.total_amount,
    paymentMethod: receipts.length > 1 ? 'split' : (receipts[0]?.payment_method ?? 'pending'),
    paymentStatus: paid >= r.total_amount ? 'paid' : paid > 0 ? 'partially_paid' : 'pending',
    status: r.status,
    notes: r.notes,
    timestamp: r.created_at,
  };
}
export function mapPayments(
  rows: PaymentRow[],
  entries: ServiceEntry[],
  tz: string,
): PaymentTransaction[] {
  const receipts: PaymentTransaction[] = rows.map((r) => {
    const e = entries.find((e) => e.id === r.service_entry_id);
    return {
      id: r.id,
      invoiceId: r.service_entry_id,
      serviceEntryId: r.service_entry_id,
      customerName: e?.customerName ?? '',
      employeeName: e?.employeeName ?? '',
      amount: r.amount,
      method: r.payment_method,
      status: 'paid',
      time: time(r.paid_at, tz),
      date: r.paid_at,
      reference: r.confirmation,
    };
  });
  // Pending rows are derived balances, never fictional payment receipts.
  for (const e of entries.filter((e) => e.status === 'completed')) {
    const paid = rows.filter((p) => p.service_entry_id === e.id).reduce((s, p) => s + p.amount, 0);
    const outstanding = Math.round((e.total - paid) * 100) / 100;
    if (outstanding > 0)
      receipts.push({
        id: `balance-${e.id}`,
        invoiceId: e.id,
        serviceEntryId: e.id,
        customerName: e.customerName,
        employeeName: e.employeeName,
        amount: outstanding,
        method: 'pending',
        status: 'pending',
        time: e.time,
        date: e.timestamp,
      });
  }
  return receipts.sort((a, b) => b.date.localeCompare(a.date));
}
export function mapExpense(r: ExpenseRow, categories: Omit<CategoryRow, 'active'>[]): Expense {
  return {
    id: r.id,
    title: r.description,
    category: categories.find((c) => c.id === r.category_id)?.name ?? 'Other',
    amount: r.amount,
    paidUsing: r.payment_method,
    date: r.expense_date,
    notes: r.notes,
    codeLetter: r.description[0] ?? 'E',
  };
}
export function mapClosing(r: ClosingRow, tz: string): DailyClosingRecord {
  return {
    id: r.id,
    date: r.closing_date,
    grossSales: r.gross_sales,
    expenses: r.expenses,
    netResult: r.gross_sales - r.expenses,
    servicesCount: r.services_count,
    openingCash: r.opening_cash,
    cashReceived: r.cash_collected,
    cashExpenses: r.cash_expenses,
    expectedCash: r.expected_cash,
    countedCash: r.counted_cash,
    variance: r.difference,
    closedBy: r.closed_by,
    closedAt: time(r.created_at, tz),
    status: 'closed',
  };
}
export function mapAppointment(
  r: AppointmentRow,
  employees: EmployeeRow[],
  customers: CustomerRow[],
): Appointment {
  return {
    id: r.id,
    time: r.start_time.slice(0, 5),
    date: r.appointment_date,
    customerId: r.customer_id,
    customerName: customers.find((c) => c.id === r.customer_id)?.full_name ?? 'Customer',
    employeeId: r.employee_id,
    employeeName: employees.find((e) => e.id === r.employee_id)?.full_name ?? 'Staff',
    serviceName: r.notes,
    status: r.status,
  };
}
export function mapNotification(r: NotificationRow, today: string, tz: string): NotificationItem {
  return {
    id: r.id,
    title: r.title,
    body: r.message,
    time: time(r.created_at, tz),
    group: businessDate(new Date(r.created_at), tz) === today ? 'today' : 'earlier',
    isRead: !!r.read_at,
    type: r.type as NotificationItem['type'],
  };
}
