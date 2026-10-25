import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { authGuard } from './auth.guard';
import { SalonStoreService } from './salon-store.service';
import { PlatformAuthService } from './platform-auth.service';

const platformStub = {
  session: () => null,
  refresh: async () => {},
  isAdmin: () => false,
  accessState: () => 'not-admin' as const,
};

describe('Authentication and role guard', () => {
  const run = (
    store: unknown,
    roles?: string[],
    extra: { route?: Record<string, unknown>; platform?: Record<string, unknown> } = {},
  ) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SalonStoreService, useValue: store },
        { provide: PlatformAuthService, useValue: { ...platformStub, ...(extra.platform ?? {}) } },
      ],
    });
    return TestBed.runInInjectionContext(() =>
      authGuard(
        { data: { roles, ...(extra.route ?? {}) } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
  };
  it('awaits session restoration and redirects unauthenticated users', async () => {
    const store = {
      ensureLoaded: async () => {
        throw new Error('Sign in');
      },
      error: { set: () => {} },
      message: () => 'Sign in',
    };
    const result = await run(store);
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/auth/login');
  });
  it('blocks a receptionist from manager routes', async () => {
    const result = await run(
      {
        ensureLoaded: async () => {},
        needsOnboarding: () => false,
        accountSuspended: () => false,
        currentUser: () => ({ role: 'receptionist' }),
      },
      ['owner', 'manager'],
    );
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/dashboard');
  });
  it('admits an authorized owner after state has loaded', async () =>
    expect(
      await run(
        {
          ensureLoaded: async () => {},
          needsOnboarding: () => false,
          accountSuspended: () => false,
          currentUser: () => ({ role: 'owner' }),
        },
        ['owner'],
      ),
    ).toBe(true));
  it('sends an account without a salon to onboarding', async () => {
    const result = await run({
      ensureLoaded: async () => {},
      needsOnboarding: () => true,
      accountSuspended: () => false,
      currentUser: () => ({ role: '' }),
    });
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/onboarding');
  });
  it('sends a suspended account to the account-locked screen', async () => {
    const result = await run({
      ensureLoaded: async () => {},
      needsOnboarding: () => false,
      accountSuspended: () => true,
      currentUser: () => ({ role: 'employee' }),
    });
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/account-locked');
  });
  it('routes a confirmed platform administrator into the portal', async () => {
    const result = await run(
      {
        ensureLoaded: async () => {},
        needsOnboarding: () => true,
        accountSuspended: () => false,
        currentUser: () => ({ role: '' }),
      },
      undefined,
      {
        route: {},
        platform: { isAdmin: () => true, accessState: () => 'mfa-needed' },
      },
    );
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/platform-admin/mfa');
  });
});