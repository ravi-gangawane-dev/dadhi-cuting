/** Mobile numbers are stored as 10 Indian digits; Supabase Auth needs E.164. */
export const DEFAULT_COUNTRY_CODE = '91';

export function normaliseMobile(value: string): string {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith(DEFAULT_COUNTRY_CODE)) return digits.slice(2);
  return digits;
}

export function isMobile(value: string): boolean {
  return normaliseMobile(value).length === 10;
}

export function toE164(value: string): string {
  const digits = normaliseMobile(value);
  return digits ? `+${DEFAULT_COUNTRY_CODE}${digits}` : '';
}
