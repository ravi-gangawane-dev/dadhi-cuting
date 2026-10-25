import { businessDate, periodStart } from './business-date';
describe('Salon business dates', () => {
  it('uses salon midnight rather than UTC midnight', () => {
    expect(businessDate(new Date('2026-10-23T18:29:59Z'), 'Asia/Kolkata')).toBe('2026-10-23');
    expect(businessDate(new Date('2026-10-23T18:30:00Z'), 'Asia/Kolkata')).toBe('2026-10-24');
  });
  it('handles DST zones and Monday reporting boundaries', () => {
    expect(businessDate(new Date('2026-03-08T07:30:00Z'), 'America/New_York')).toBe('2026-03-08');
    expect(periodStart('2026-11-01', 'week')).toBe('2026-10-26');
    expect(periodStart('2026-01-01', 'year')).toBe('2026-01-01');
    expect(periodStart('2026-10-24', 'month')).toBe('2026-10-01');
  });
});
