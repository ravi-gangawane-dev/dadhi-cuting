import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SalonStoreService } from './salon-store.service';
import { FeatureAccessService } from './feature-access.service';

/**
 * Feature entitlement guard. The auth guard has already resolved the salon;
 * this one checks the backend-computed `available` value for the route's
 * `data.feature` key and defers to the server-side verdict.
 */
export const featureGuard: CanActivateFn = async (route) => {
  const store = inject(SalonStoreService);
  const flags = inject(FeatureAccessService);
  const router = inject(Router);
  const key = route.data['feature'] as string | undefined;
  if (!key || !store.salon().id) return true;
  await flags.ensureLoaded(store.salon().id);
  if (flags.flags()[key]?.available) return true;
  flags.lastDenied.set(key);
  return router.createUrlTree(['/dashboard']);
};
