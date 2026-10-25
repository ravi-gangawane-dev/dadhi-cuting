# DadhiCutting — Bug Report (Super Admin implementation phases)

Date: 25 October 2026. Lists every defect found during this implementation cycle, its root cause, fix, and current state.

## Fixed during this cycle

### BUG-01 — Salon login aborted when the platform-admin verdict failed (found in Phase 9)
- **Symptom**: In `scripts/test-browser.mjs`, the check "email/password login loads salon membership" timed out waiting for `**/dashboard`; the app stayed on `/auth/login` with no error shown.
- **Root cause**: `authGuard` awaited `PlatformAuthService.refresh()` inside its main try/catch. The new `is_platform_admin` RPC returned 404 under the test fixture (no handler existed — pre-existing browser test, new call), the throw was caught, and the guard fell into the "not authenticated" branch, bouncing the user back to the login screen. In production the same shape could occur on any transient RPC failure: a healthy salon user would be pushed back to login.
- **Fix** (two-part):
  1. `src/app/core/services/auth.guard.ts`: the admin verdict refresh is now fail-tolerant (`await platform.refresh().catch(() => {})`) — an undetermined verdict (`isAdmin === null`) continues the salon flow; the platform portal guard still **fails closed** on an unknown verdict.
  2. `scripts/test-browser.mjs`: added faithful fixture handlers for `is_platform_admin` (→ `false`) and `feature_state` (→ 14-key map with available flags matching the registry lifecycle rules).
- **Result**: all 15 browser checks pass; unit regression suites unchanged (59/59).

### BUG-02 — `salon_members_role_check` FOREACH syntax error (build of migration harness) — fixed earlier in the cycle
- **Symptom**: PGlite harness aborted applying Migration A.
- **Root cause**: a `FOREACH a, b IN ARRAY …` loop is invalid plpgsql; replacing with explicit per-table `DROP/CREATE POLICY` statements.
- **Result**: migration applies cleanly in order; all 52 checks pass.

### BUG-03 — Dead mock-data module blocked the Employee model change
- **Symptom**: TypeScript errors when adding `userId` to the `Employee` model surfaced in `src/app/mock-data/`.
- **Root cause**: the folder was unreferenced dead code from the mock era (audit finding R-dup); it still participated in compilation.
- **Fix**: deleted `src/app/mock-data/` after grep-verified zero imports; production build green.

### BUG-04 — Budget warning (pre-existing, still open)
- `npm run build`: WARNING — initial bundle 595.04 kB vs 500 kB budget (a warning, not an error; pre-existing style plateau that grew with the new portal chunks which are all lazy).
- Not a functional defect; recommended follow-up: raise the budget or extract more of the shared bundle.

## Fixed pre-existing (legacy) issues retained from reports

- Hardcoded HTML dashboard amounts — already resolved before this cycle (real `report_summary` bindings), re-verified.
- Salon A's business-day-day-lock tests re-seeded to salon B for the payments-flag gate to avoid day-lock interference — test-isolation issue, not production.

### BUG-05 — `is_platform_admin` verdict unreachable from the browser (found in Phase 10 live smoke test)
- **Symptom**: After pushing Migration A to the live project, an anon REST probe returned `PGRST202 — could not find the function public.is_platform_admin` instead of a permission error.
- **Root cause**: `is_platform_admin()` was created only in the **`private` schema**, which PostgREST does not expose, so the Angular call `client.rpc('is_platform_admin')` (→ `/rest/v1/rpc/is_platform_admin`) could never resolve against a real project. The offline harness missed it because it tests the *policies* invoking `private.is_platform_admin()` directly; `platformGuard` failed closed so nothing broke locally.
- **Fix**: additive migration `supabase/migrations/202610250003_platform_admin_verdict_rpc.sql` re-exports the verdict as `public.is_platform_admin()` — a thin security-definer wrapper over the `private` helper, revoked from `public`/`anon`, granted to `authenticated`. Two new harness checks pin down public visibility, non-admin `false`, and anon denial.
- **Result**: harness now **53/53**; live REST probe shows the function exists and anon is denied (`42501`) as designed.

## Open / none-blocking

| ID | Description | Severity | Status |
|---|---|---|---|
| OPEN-01 | Fixture is synthetic: live-project validation of `feature_state`, employee login provisioning, MFA remains blocked on operator deploy steps (see `PRODUCTION_READINESS.md`). | Blocker (project-level, not code) | Tracked |
| OPEN-02 | Session-token revocation on suspension (`auth.admin.signOut`) not yet wired into the `set_member` Edge path; RLS already cuts data access. | Low | Recommended enhancement |
| OPEN-03 | Temporary-password change enforcement is UI-driven (`must_change_password` metadata); Supabase has no native force-change. | Low | Documented; owner reset path + minimum-password config mitigate |
| OPEN-04 | Initial bundle budget warning (see BUG-04). | Cosmetic | Backlog |

## Regression evidence

After the last code change (BUG-01 fix), the full verification loop was re-run in this session, and again after BUG-05's fix: `npm run test:db` **53/53**, `npm test` 59/59, `npm run build` (success + known warning), `npm run test:browser` 15/15 counted checks + visual sweep of 19 screens × 7 viewports with zero `pageerror`; plus live REST probes confirming the deployed RPC exposure.
