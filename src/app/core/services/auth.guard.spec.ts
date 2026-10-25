import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { authGuard } from './auth.guard';
import { SalonStoreService } from './salon-store.service';
describe('Authentication and role guard', () => {
  const run = (store: unknown, roles?: string[], data: Record<string, unknown> = {}) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SalonStoreService, useValue: store }],
    });
    return TestBed.runInInjectionContext(() =>
      authGuard(
        { data: { roles, ...data } } as unknown as ActivatedRouteSnapshot,
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
          currentUser: () => ({ role: 'owner' }),
        },
        ['owner'],
      ),
    ).toBe(true));
  it('sends an account without a salon to onboarding', async () => {
    const result = await run({
      ensureLoaded: async () => {},
      needsOnboarding: () => true,
      currentUser: () => ({ role: '' }),
    });
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/onboarding');
  });
  it('keeps a signed-in owner without a salon on the onboarding route', async () => {
    const result = await run(
      {
        ensureLoaded: async () => {},
        needsOnboarding: () => true,
        currentUser: () => ({ role: '' }),
      },
      undefined,
      { onboarding: true },
    );
    expect(result).toBe(true);
  });
});
