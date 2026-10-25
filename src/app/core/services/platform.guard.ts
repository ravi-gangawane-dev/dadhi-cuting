import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { PlatformAuthService } from './platform-auth.service';

/**
 * Guard for /platform-admin. Requires: Supabase session, backend-confirmed
 * platform administrator row, and an MFA (AAL2) session. Signed-in users who
 * fail the backend check land on the dashboard, not an error page.
 */
export const platformGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const platform = inject(PlatformAuthService);
  const router = inject(Router);
  await auth.ready;
  if (!auth.session()) return router.createUrlTree(['/auth/login']);
  await platform.refresh();
  const state = platform.accessState();
  if (state === 'unknown') return router.createUrlTree(['/auth/login']);
  if (state === 'not-admin') return router.createUrlTree(['/dashboard']);
  if (state === 'mfa-needed') return router.createUrlTree(['/platform-admin/mfa']);
  return true;
};

/**
 * Login-only guard for the MFA enrollment page itself: a signed-in platform
 * administrator without MFA must be able to reach it.
 */
export const platformSetupGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const platform = inject(PlatformAuthService);
  const router = inject(Router);
  await auth.ready;
  if (!auth.session()) return router.createUrlTree(['/auth/login']);
  await platform.refresh();
  if (platform.isAdmin() !== true) return router.createUrlTree(['/dashboard']);
  if (platform.mfaReady()) return router.createUrlTree(['/platform-admin']);
  return true;
};
