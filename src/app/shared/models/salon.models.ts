export type PaymentMethod = 'upi' | 'cash' | 'card' | 'split' | 'pending';
export type PaymentStatus = 'paid' | 'partially_paid' | 'pending' | 'voided';
export type ServiceEntryStatus = 'completed' | 'in_progress' | 'cancelled';
export type EmployeeRole = 'owner' | 'manager' | 'senior_barber' | 'barber' | 'stylist' | 'cashier';
export type AppointmentStatus = 'Booked' | 'Done' | 'Cancelled';

export interface Salon {
  id: string;
  name: string;
  nameMarathi: string;
  tagline: string;
  taglineMarathi: string;
  phone: string;
  city: string;
  openingTime: string;
  closingTime: string;
  currency: string;
  timezone: string;
  language: 'en' | 'mr';
}

export interface Employee {
  id: string;
  name: string;
  initials: string;
  role: EmployeeRole;
  roleDisplay: string;
  roleDisplayMarathi: string;
  phone: string;
  active: boolean;
  /** Auth account linked by the Owner through the server-side provisioning flow. */
  userId: string | null;
  /** Uploaded photo (salon-private bucket), when the owner added one. */
  avatarUrl: string | null;
  commissionRate: number; // e.g. 30 for 30%
  servicesToday: number;
  salesToday: number; // In Rupees
  avatarBg?: string;
  joinedDate: string;
}

export interface Customer {
  id: string;
  name: string;
  initials: string;
  phone: string;
  isWalkIn?: boolean;
  visitsCount: number;
  lifetimeSpend: number; // In Rupees
  lastVisit: string;
  badge: string;
  notes?: string;
}

export interface SalonService {
  id: string;
  name: string;
  nameMarathi?: string;
  category: 'Hair' | 'Beard' | 'Combo' | 'Facial' | 'Wellness' | 'Treatment';
  categoryMarathi?: string;
  durationMinutes: number;
  price: number; // In Rupees
  active: boolean;
  codeLetter: string;
}

export interface ServiceItem {
  serviceId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ServiceEntry {
  id: string;
  invoiceId: string;
  businessDate: string; // YYYY-MM-DD
  time: string; // e.g. "10:32 AM"
  employeeId: string;
  employeeName: string;
  customerId: string;
  customerName: string;
  services: ServiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: ServiceEntryStatus;
  notes?: string;
  timestamp: string;
}

export interface PaymentTransaction {
  id: string;
  invoiceId: string;
  serviceEntryId: string;
  customerName: string;
  employeeName: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  time: string;
  date: string;
  reference?: string;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  categoryMarathi?: string;
  amount: number;
  paidUsing: 'cash' | 'upi' | 'card' | 'bank_transfer';
  date: string;
  notes?: string;
  codeLetter: string;
}

export interface DailyClosingRecord {
  id: string;
  date: string;
  grossSales: number;
  expenses: number;
  netResult: number;
  servicesCount: number;
  openingCash: number;
  cashReceived: number;
  cashExpenses: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  closedBy: string;
  closedAt: string;
  status: 'closed' | 'open';
}

export interface Appointment {
  id: string;
  time: string; // e.g. "10:00 AM"
  date: string;
  customerId: string;
  customerName: string;
  serviceName: string;
  employeeId: string;
  employeeName: string;
  status: AppointmentStatus;
}

export interface NotificationItem {
  id: string;
  title: string;
  titleMarathi?: string;
  body: string;
  time: string;
  group: 'today' | 'earlier';
  isRead: boolean;
  type: 'payment' | 'expense' | 'closing' | 'customer' | 'pending';
}

/** One salon membership of the signed-in account (multi-salon owners included). */
export interface UserMembership {
  salonId: string;
  salonName: string;
  role: string;
  active: boolean;
}

export interface DashboardKPIs {
  revenueToday: number;
  servicesCompleted: number;
  expensesToday: number;
  netEarnings: number;
  collectedToday: number;
  pendingAmount: number;
  upiTotal: number;
  cashTotal: number;
  openingCash: number;
  expectedCash: number;
}
