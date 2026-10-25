// Schema-aligned types. Regenerate from the hosted schema after migrations are applied.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Base = { id: string; salon_id: string; created_at: string };
export interface SalonRow {
  id: string;
  name: string;
  phone: string;
  address: string;
  logo_url: string | null;
  opening_hours: Json;
  timezone: string;
  language: 'en' | 'mr';
  name_marathi: string;
  tagline: string;
  tagline_marathi: string;
  created_at: string;
  updated_at: string;
}
export interface EmployeeRow extends Base {
  user_id: string | null;
  full_name: string;
  phone: string;
  designation: string;
  avatar_url: string | null;
  active: boolean;
  commission_rate: number;
  updated_at: string;
}
export interface CustomerRow extends Base {
  full_name: string;
  phone: string;
  gender: string | null;
  notes: string;
  updated_at: string;
}
export interface CategoryRow {
  id: string;
  salon_id: string;
  name: string;
  active: boolean;
}
export interface ServiceRow extends Base {
  category_id: string | null;
  name: string;
  price: number;
  duration_minutes: number;
  active: boolean;
  updated_at: string;
}
export interface EntryRow extends Base {
  customer_id: string | null;
  employee_id: string;
  service_date: string;
  status: 'completed' | 'in_progress' | 'cancelled';
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  notes: string;
  request_id: string;
  request_payload: Json;
  created_by: string;
  updated_at: string;
}
export interface ItemRow {
  id: string;
  salon_id: string;
  service_entry_id: string;
  service_id: string;
  service_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}
export interface PaymentRow extends Base {
  service_entry_id: string;
  amount: number;
  payment_method: 'cash' | 'upi' | 'card';
  status: 'paid';
  confirmation: string;
  request_id: string;
  part: number;
  paid_at: string;
  created_by: string;
}
export interface ExpenseRow extends Base {
  category_id: string | null;
  amount: number;
  expense_date: string;
  description: string;
  notes: string;
  payment_method: 'cash' | 'upi' | 'card' | 'bank_transfer';
  attachment_path: string | null;
  created_by: string;
  updated_at: string;
}
export interface ClosingRow extends Base {
  closing_date: string;
  opening_cash: number;
  cash_collected: number;
  cash_expenses: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  gross_sales: number;
  expenses: number;
  services_count: number;
  closed_by: string;
}
export interface AppointmentRow extends Base {
  customer_id: string;
  employee_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: 'Booked' | 'Done' | 'Cancelled';
  notes: string;
  updated_at: string;
}
export interface NotificationRow extends Base {
  recipient_user_id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
}
export interface MemberRow extends Base {
  user_id: string;
  role: 'owner' | 'manager' | 'receptionist' | 'employee';
  active: boolean;
}
export type Tables = {
  salons: SalonRow;
  user_profiles: {
    id: string;
    full_name: string;
    phone: string;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
  };
  salon_members: MemberRow;
  employees: EmployeeRow;
  customers: CustomerRow;
  service_categories: CategoryRow;
  services: ServiceRow;
  service_entries: EntryRow;
  service_entry_items: ItemRow;
  payments: PaymentRow;
  expense_categories: Omit<CategoryRow, 'active'>;
  expenses: ExpenseRow;
  daily_closings: ClosingRow;
  appointments: AppointmentRow;
  notifications: NotificationRow;
  audit_logs: Base & {
    actor_user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
  };
};
export interface Database {
  public: {
    Tables: {
      [K in keyof Tables]: {
        Row: { [P in keyof Tables[K]]: Tables[K][P] };
        Insert: Partial<{ [P in keyof Tables[K]]: Tables[K][P] }>;
        Update: Partial<{ [P in keyof Tables[K]]: Tables[K][P] }>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
    Functions: {
      create_my_salon: { Args: { p_name: string }; Returns: string };
      email_for_mobile: { Args: { p_mobile: string }; Returns: string | null };
      void_service_entry: {
        Args: { p_salon: string; p_entry: string; p_reason: string };
        Returns: string;
      };
      void_payment: {
        Args: { p_salon: string; p_payment: string; p_reason: string };
        Returns: string;
      };
      create_service_entry: {
        Args: {
          p_salon: string;
          p_employee: string;
          p_customer: string | null;
          p_items: Json;
          p_discount: number;
          p_notes: string;
          p_request: string;
        };
        Returns: string;
      };
      record_payment: {
        Args: {
          p_salon: string;
          p_entry: string;
          p_parts: Json;
          p_confirmation: string;
          p_request: string;
        };
        Returns: string;
      };
      close_business_day: {
        Args: { p_salon: string; p_date: string; p_opening: number; p_counted: number };
        Returns: string;
      };
      report_summary: { Args: { p_salon: string; p_from: string; p_to: string }; Returns: Json };
    };
  };
}
export interface ReportSummary {
  revenue: number;
  services: number;
  visits: number;
  expenses: number;
  outstanding: number;
  methods: Partial<Record<'cash' | 'upi' | 'card', number>>;
  chart: { label: string; value: number }[];
  topServices: { name: string; count: number; revenue: number }[];
  employees: { employee_id: string; revenue: number; visits: number }[];
}
