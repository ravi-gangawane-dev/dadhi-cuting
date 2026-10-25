import { isMobile, normaliseMobile, toE164 } from './mobile';

describe('mobile helpers', () => {
  it('normalises spacing, dashes and the country code', () => {
    expect(normaliseMobile('98765 43210')).toBe('9876543210');
    expect(normaliseMobile('+91 98765-43210')).toBe('9876543210');
    expect(normaliseMobile('919876543210')).toBe('9876543210');
    expect(normaliseMobile('')).toBe('');
  });
  it('accepts only ten digit numbers', () => {
    expect(isMobile('98765 43210')).toBe(true);
    expect(isMobile('+91 98765 43210')).toBe(true);
    expect(isMobile('98765')).toBe(false);
    expect(isMobile('owner@dadhicutting.com')).toBe(false);
  });
  it('converts to the E.164 form Supabase Auth expects', () => {
    expect(toE164('98765 43210')).toBe('+919876543210');
    expect(toE164('')).toBe('');
  });
});
