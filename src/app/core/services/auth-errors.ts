/** Supabase phone-OTP failures are cryptic; map the common ones to next steps. */
export function otpErrorMessage(error: unknown): string {
  const e = error as { code?: string; status?: number; message?: string; error_description?: string };
  switch (e?.code) {
    case 'otp_disabled':
    case 'signup_disabled':
      return 'This number is not verified for the account yet. Verify it in Settings → Mobile number, or use the email reset link.';
    case 'phone_not_confirmed':
      return 'This number is not verified for the account yet.';
    case 'over_sms_send_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many codes requested. Wait a few minutes and try again.';
    case 'otp_expired':
      return 'That code has expired. Request a new one.';
    case 'invalid_otp':
    case 'otp_verification_failed':
      return 'That code is not correct. Check the SMS and try again.';
    default: {
      if (e?.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
      const text = e?.message || e?.error_description || '';
      if (/sms/i.test(text) && /(provider|unable|error sending|not configured)/i.test(text))
        return 'SMS sending is not configured for this project yet. Add an SMS provider in Supabase → Authentication → Providers.';
      return text || 'Something went wrong. Try again.';
    }
  }
}
