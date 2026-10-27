import { mapEmployee, mapEntry, mapPayments } from './salon-mappers';
import { EmployeeRow, EntryRow, PaymentRow, ItemRow } from './database.types';

describe('Employee mapping', () => {
  it('carries the uploaded photo url for the owner UI', () => {
    const row: EmployeeRow = {
      id: 'employee',
      salon_id: 'salon',
      user_id: null,
      full_name: 'Sandip',
      phone: '',
      designation: 'barber',
      avatar_url: 'https://example.test/employees/photo.png',
      active: true,
      commission_rate: 30,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };
    expect(mapEmployee(row, [], '2026-10-27').avatarUrl).toBe(
      'https://example.test/employees/photo.png',
    );
  });
});
describe('Invoice and receipt mapping', () => {
  const entry: EntryRow = {
    id: 'invoice',
    salon_id: 'salon',
    employee_id: 'staff',
    customer_id: null,
    service_date: '2026-10-24',
    status: 'completed',
    subtotal: 200,
    discount_amount: 20,
    total_amount: 180,
    notes: '',
    request_id: 'request',
    request_payload: {},
    created_by: 'owner',
    created_at: '2026-10-24T06:00:00Z',
    updated_at: '2026-10-24T06:00:00Z',
  };
  const receipt: PaymentRow = {
    id: 'receipt',
    salon_id: 'salon',
    service_entry_id: 'invoice',
    amount: 50,
    payment_method: 'cash',
    status: 'paid',
    confirmation: 'Manual',
    request_id: 'request',
    part: 1,
    paid_at: '2026-10-24T06:01:00Z',
    created_by: 'owner',
    created_at: '2026-10-24T06:01:00Z',
  };
  const items: ItemRow[] = [
    {
      id: 'item',
      salon_id: 'salon',
      service_entry_id: 'invoice',
      service_id: 'service',
      service_name: 'Original name',
      unit_price: 200,
      quantity: 1,
      line_total: 200,
    },
  ];
  it('preserves historical prices and partial balances without altering receipts', () => {
    const mapped = mapEntry(entry, items, [receipt], [], [], 'Asia/Kolkata');
    expect(mapped.paymentStatus).toBe('partially_paid');
    expect(mapped.services[0].name).toBe('Original name');
    const rows = mapPayments([receipt], [mapped], 'Asia/Kolkata');
    expect(rows.find((r) => r.status === 'paid')?.amount).toBe(50);
    expect(rows.find((r) => r.status === 'pending')?.amount).toBe(130);
  });
  it('does not invent payments for unpaid or zero-value entries', () => {
    const mapped = mapEntry(entry, items, [], [], [], 'Asia/Kolkata');
    expect(mapped.paymentStatus).toBe('pending');
    expect(mapPayments([], [mapped], 'Asia/Kolkata').every((r) => r.status === 'pending')).toBe(
      true,
    );
    expect(mapPayments([], [{ ...mapped, total: 0 }], 'Asia/Kolkata')).toEqual([]);
  });
  it('removes derived pending balances after full payment', () => {
    const paid = { ...receipt, amount: 180 };
    const mapped = mapEntry(entry, items, [paid], [], [], 'Asia/Kolkata');
    expect(mapped.paymentStatus).toBe('paid');
    expect(mapPayments([paid], [mapped], 'Asia/Kolkata')).toHaveLength(1);
  });
});
