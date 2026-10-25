import { otpErrorMessage } from './auth-errors';

describe('otpErrorMessage', () => {
  it('explains an unverified number', () => {
    expect(otpErrorMessage({ code: 'otp_disabled' })).toContain('not verified');
    expect(otpErrorMessage({ code: 'phone_not_confirmed' })).toContain('not verified');
  });
  it('explains rate limits and bad codes', () => {
    expect(otpErrorMessage({ code: 'over_sms_send_rate_limit' })).toContain('Too many codes');
    expect(otpErrorMessage({ status: 429 })).toContain('Too many attempts');
    expect(otpErrorMessage({ code: 'otp_expired' })).toContain('expired');
    expect(otpErrorMessage({ code: 'invalid_otp' })).toContain('not correct');
  });
  it('points at the missing SMS provider configuration', () => {
    expect(otpErrorMessage({ message: 'Error sending sms: provider not configured' })).toContain(
      'not configured',
    );
    expect(otpErrorMessage({ status: 500, message: 'Unable to get SMS provider' })).toContain(
      'SMS provider',
    );
  });
  it('falls back to the server message', () => {
    expect(otpErrorMessage({ message: 'Database error saving new user' })).toBe(
      'Database error saving new user',
    );
    expect(otpErrorMessage(null)).toContain('Something went wrong');
  });
});
