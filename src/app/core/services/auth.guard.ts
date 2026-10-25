import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SalonStoreService } from './salon-store.service';
import { PlatformAuthService } from './platform-auth.service';
export const authGuard: CanActivateFn = async (route) => {
  const store = inject(SalonStoreService);
  const platform = inject(PlatformAuthService);
  const router = inject(Router);
  try {
    await store.ensureLoaded();
    // Platform administrators live in their own portal and never in a salon.
    // A failed admin verdict must not block salon access: the portal guard
    // still fails closed when the verdict is left undetermined.
    await platform.refresh().catch(() => {});
    if (platform.isAdmin() === true) {
      return platform.accessState() === 'mfa-needed'
        ? router.createUrlTree(['/platform-admin/mfa'])
        : router.createUrlTree(['/platform-admin']);
    }
    // Signed-in accounts that have no salon yet must finish onboarding first.
    if (store.needsOnboarding()) {
      return route.data['onboarding'] ? true : router.createUrlTree(['/onboarding']);
    }
    if (store.accountSuspended()) {
      return route.data['account-locked'] ? true : router.createUrlTree(['/account-locked']);
    }
    if (route.data['onboarding']) return router.createUrlTree(['/dashboard']);
    const roles = route.data['roles'] as string[] | undefined;
    return !roles || roles.includes(store.currentUser().role)
      ? true
      : router.createUrlTree(['/dashboard']);
  } catch (e) {
    store.error.set(store.message(e));
    return router.createUrlTree(['/auth/login']);
  }
};