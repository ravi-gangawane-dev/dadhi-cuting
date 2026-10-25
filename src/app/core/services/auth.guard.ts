import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SalonStoreService } from './salon-store.service';
export const authGuard: CanActivateFn = async (route) => {
  const store = inject(SalonStoreService);
  const router = inject(Router);
  try {
    await store.ensureLoaded();
    // Signed-in accounts that have no salon yet must finish onboarding first.
    if (store.needsOnboarding()) {
      return route.data['onboarding'] ? true : router.createUrlTree(['/onboarding']);
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
