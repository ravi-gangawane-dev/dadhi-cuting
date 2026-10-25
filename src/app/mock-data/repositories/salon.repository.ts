import { Observable } from 'rxjs';
import {
  Salon,
  Employee,
  Customer,
  SalonService,
  ServiceEntry,
  PaymentTransaction,
  Expense,
  DailyClosingRecord,
  Appointment,
  NotificationItem,
  PaymentMethod,
} from '../../shared/models/salon.models';

export interface ISalonRepository {
  getSalon(): Observable<Salon>;
  updateSalon(salon: Partial<Salon>): Observable<Salon>;

  getEmployees(): Observable<Employee[]>;
  getEmployeeById(id: string): Observable<Employee | undefined>;
  addEmployee(employee: Omit<Employee, 'id'>): Observable<Employee>;
  updateEmployee(id: string, updates: Partial<Employee>): Observable<Employee>;

  getCustomers(): Observable<Customer[]>;
  getCustomerById(id: string): Observable<Customer | undefined>;
  addCustomer(customer: Omit<Customer, 'id'>): Observable<Customer>;

  getServices(): Observable<SalonService[]>;
  addService(service: Omit<SalonService, 'id'>): Observable<SalonService>;
  updateService(id: string, updates: Partial<SalonService>): Observable<SalonService>;

  getServiceEntries(): Observable<ServiceEntry[]>;
  createServiceEntry(entry: Omit<ServiceEntry, 'id' | 'invoiceId'>): Observable<ServiceEntry>;

  getPayments(): Observable<PaymentTransaction[]>;
  collectPayment(invoiceId: string, amount: number, method: PaymentMethod): Observable<PaymentTransaction>;

  getExpenses(): Observable<Expense[]>;
  addExpense(expense: Omit<Expense, 'id'>): Observable<Expense>;

  getDailyClosing(): Observable<DailyClosingRecord>;
  closeDay(countedCash: number, closedBy: string): Observable<DailyClosingRecord>;

  getAppointments(): Observable<Appointment[]>;
  addAppointment(appointment: Omit<Appointment, 'id'>): Observable<Appointment>;
  updateAppointmentStatus(id: string, status: 'Booked' | 'Done' | 'Cancelled'): Observable<Appointment>;

  getNotifications(): Observable<NotificationItem[]>;
  markNotificationAsRead(id: string): Observable<void>;
  markAllNotificationsAsRead(): Observable<void>;
}
