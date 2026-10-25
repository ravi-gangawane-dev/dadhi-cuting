export function businessDate(date: Date = new Date(), timeZone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function periodStart(today: string, period: 'today' | 'week' | 'month' | 'year'): string {
  if (period === 'today') return today;
  if (period === 'month') return today.slice(0, 7) + '-01';
  if (period === 'year') return today.slice(0, 4) + '-01-01';
  const d = new Date(today + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
