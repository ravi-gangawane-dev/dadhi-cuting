# DadhiCutting — Super Admin, Ownership, Employee Accounts & Feature Flags Implementation Report

Date: 25 October 2026 · Baseline commit `1a08313` · All work done additively; every change is uncommitted on branch `main` so it can be reviewed as a single diff.

## 1. Scope delivered

All ten phases of the agreed plan were executed: audit → database RBAC → bootstrap tooling → Angular platform core → Super Admin portal → employee account management → feature flags → regression hardening → test evidence → this report.

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Initial audit (`reports/SUPER_ADMIN_INITIAL_AUDIT.md`) | Working |
| 2 | Operator bootstrap script (`scripts/bootstrap-super-admin.mjs`, `npm run bootstrap:admin`) | Working (syntax-verified; **never executed here**) |
| 3 | Migration A `supabase/migrations/202610250001_platform_rbac.sql` | Working (validated offline; **unapplied to any live project**) |
| 4 | Angular platform core: services + guards + routes | Working |
| 5 | Super Admin portal `/platform-admin` (8 screens + MFA enroll) | Working (UI + typed real queries; live-project verification pending operator) |
| 6 | Employee login provisioning (`manage-employee-account` Edge Function + Owner UI) | Partially Working (written and typed end-to-end; **not deployed**, so not testable against the live project) |
| 7 | Feature-flag database + enforcement + UI | Working (validated offline; live verification pending) |
| 8 | Mock-data removal, suspension routing, budget/regression checks | Working |
| 9 | Test evidence collection (this document's numbers) | Working |
| 10 | Final reports (8 documents) | Working |

## 2. What was implemented, by layer

### 2.1 Database (`supabase/migrations/202610250001_platform_rbac.sql`, additive)
- `platform_admins` table: service-role writes only; RLS enabled; every `select` for `authenticated` denied except to confirmed admins (`platform_read_admins`).
- `private.is_platform_admin()` definer function — the browser asks a boolean; the admin list itself is never exposed. Granted to `authenticated` only.
- `salon_members.role` CHECK extended from `owner|manager|receptionist|employee` to include `accountant` (constraint `salon_members_role_check` dropped/re-added).
- Accountant read-only financial policies (`accountant_read_*`) — no writers created for the new role.
- Owner-only definer RPCs `set_member_active(p_salon,p_user,p_active)` and `set_member_role(p_salon,p_user,p_role)`: cannot touch `owner` rows, allowed target roles limited to `manager|receptionist|employee|accountant`; audited into `audit_logs`.
- `platform_audit_logs` (actor, action, entity, details jsonb) with indices on `created_at` and `action` — separate from the salon-scoped `audit_logs`, whose `salon_id` is NOT NULL.
- Read policies `platform_read_*` on `salons`, `salon_members`, `employees`, `user_profiles`, `customers`, `platform_audit_logs` so a confirmed admin can inspect the platform (read-only; no salon business privileges).
- `create_my_salon` hardened: blocks any user holding a membership in **any** salon (active or inactive) and blocks platform admins, so a suspended account cannot sign up a "new" salon.

### 2.2 Database (`supabase/migrations/202610250002_feature_flags.sql`, additive)
- `feature_flags` registry: 14 seeded rows — `dashboard, customers, employees, services, payments, expenses, daily_closing, reports, appointments` (lifecycle `enabled`, platform_available true) and `inventory, whatsapp_notifications, memberships, loyalty, multi_branch` (lifecycle `planned`, platform_enabled false).
- `salon_feature_overrides(salon_id, flag_key, enabled)` unique per salon+flag; an override can only *restrict*, never exceed platform availability.
- `public.feature_state(p_salon) returns jsonb` — one server-evaluated map: lifecycle + platform availability + salon override, aggregated over the registry. Missing/unknown key ⇒ fail closed.
- `private.feature_enabled(p_salon,p_key)` — the per-key verdict used by enforcement hooks.
- Super-Admin-only RPCs `platform_feature_set(p_key, p_platform_enabled, p_lifecycle)` and `platform_salon_feature(p_salon, p_key, p_enabled)`; both audited into `platform_audit_logs`.
- Enforcement hooks in `create_service_entry`, `record_payment`, `close_business_day` (raise when the feature used by that data path is not `available`) and RLS writer policies on `customers`, `employees`, `services`, `service_categories`, `expense_categories`, `expenses`, `appointments`.

### 2.3 Edge Functions (`supabase/functions/`, **written, not deployed**)
| Function | Actions | Security model |
|---|---|---|
| `manage-employee-account` | `create`, `reset_password` | Verifies the caller's own JWT with an anon-key client first; then, with service role, confirms the caller is an **active owner of that salon** before touching anything. Creates the auth user with a CSPRNG temporary password (`email_confirm: true`, `must_change_password` metadata), upserts `user_profiles` + `salon_members`, links `employees.user_id` (unique partial index `employees_user_account_key` prevents dual account assignment). Password is returned exactly once, never stored in app tables. Reset refuses owners (`role === 'owner'` → 403). All actions audited into `audit_logs`. |
| `platform-admin-ops` | `invite_owner`, `create_salon`, `set_member` | Verifies the caller JWT, then checks the `platform_admins` allowlist **server side** before any privileged write. `create_salon` routes through the existing `provision_salon` definer RPC (service-role-only grant from migration `202610240001_core.sql`). Writes `GRANT_OWNER` / `CREATE_SALON` / `SET_MEMBER` rows into `platform_audit_logs`. Existing account emails are reused; missing emails are invited with `must_change_password` metadata. |

### 2.4 Operator tooling
- `scripts/bootstrap-super-admin.mjs`: interactive, service-role key supplied via environment only, requires typing the project ref to confirm, resolves (never duplicates) the auth user, idempotent `platform_admins` insert, optional `--password` flag, writes `BOOTSTRAP_PLATFORM_ADMIN` / `BOOTSTRAP_IDEMPOTENT` audit rows. No public registration and no first-user auto-promotion anywhere in the app.

### 2.5 Angular core
| Artifact | Responsibility |
|---|---|
| `src/app/core/services/platform-auth.service.ts` | Admin verdict via `is_platform_admin` RPC, MFA readiness via `auth.mfa.getAuthenticatorAssuranceLevel()` (AAL2 required), TOTP enroll/challenge/verify helpers. |
| `src/app/core/services/platform.guard.ts` | `platformGuard` (fail closed: unknown verdict or AAL < 2 → deny), `platformSetupGuard` (re-verifies identity, sends admins without a second factor to enrollment). |
| `src/app/core/services/auth.guard.ts` | Writes the salon's flows; now tolerates a failed admin-verdict call (non-fatal) while the platform portal guard still fails closed. |
| `src/app/core/services/feature-access.service.ts` | Loads `feature_state` per salon; `lastDenied` banner signal; no client-side authorization decisions. |
| `src/app/core/services/feature.guard.ts` | Route-level feature gate (`data.feature`), redirect to `/dashboard` with denial reason when not `available`. |
| `src/app/core/data-access/platform-data.service.ts` | Typed paginated real reads (`count`, `salons`, `salon()`, `memberships`, `staff`, `profiles`, `flags`, `salonOverrides`, `audit`). |
| `src/app/core/data-access/database.types.ts` | Hand-extended types: accountant `MemberRow`, `platform_admins`, `platform_audit_logs`, `feature_flags`, `salon_feature_overrides`, new Functions enumerate. |
| `src/app/core/services/salon-store.service.ts` | Suspension awareness (`needsOnboarding` vs `accountSuspended`), `createEmployeeAccount`/`resetEmployeePassword` (Edge invoke), `setMemberActive`/`setMemberRole`, `memberStatuses` for the owner UI, flags reload after `ensureLoaded`. |

### 2.6 Routes & screens
- `/platform-admin` portal (shell + `dashboard`, `salons`, `salons/:id`, `users`, `features`, `audit`, `settings`) all behind `platformGuard`; `/platform-admin/mfa` is registered **before** the guarded parent so an admin without a second factor can enroll without a redirect loop.
- `/account-locked` for suspended salon accounts.
- Feature-coded routes: `services/new`, `catalog/services`, `employees`, `employees/:id`, `customers`, `customers/:id`, `payments`, `payments/collect`, `expenses`, `expenses/new`, `closing`, `reports`, `appointments`. Reports now declares `roles: ['owner','manager','accountant']`.
- Portal components in `src/app/features/platform-admin/`: `platform-dashboard` (real aggregated counts), `platform-salons` (search + pagination), `platform-salon-detail` (owner invite via Edge Function, membership list, per-salon flag overrides), `platform-users`, `platform-features` (lifecycle + platform availability editors), `platform-audit`, `platform-settings`, `platform-mfa`.
- Owner employee-login management inside the existing `employees-list` screen (create-login modal with one-time temporary password display, suspend/restore, password reset) — visible only for `role === 'owner'`.
- Bottom navigation hidden on `/platform-admin` and `/account-locked`; feature-withheld items removed from nav/more-menu when `available === false`; dashboard shows a denial banner via `lastDenied`.

## 3. Verification evidence (executed in this session)

| Suite | Command | Result |
|---|---|---|
| Database integration (offline PGlite, applies all migrations in dependency order) | `npm run test:db` | **52/52 checks PASS** — includes 18 new RBAC/flag/suspension checks (owner membership management, accountant reads, platform-admin inspect rights, blocked self-elevation + admin self-onboarding, registry lifecycle control, "override cannot exceed platform availability", flag-gated policies + RPCs, payments flag regression, platform audit trail, day-lock integrity) |
| Unit (vitest, 42 files) | `npm test` | **59/59 PASS** |
| Production build | `npm run build` | PASS; pre-existing WARNING only: initial bundle 595.04 kB vs 500 kB budget |
| Browser regression (Playwright + deterministic API fixture, `msedge` headless) | `npm run test:browser` | **15 counted checks PASS**, plus "dialog keyboard navigation and Escape dismissal" and "logout returns to sign-in"; 19 screens layout-checked at 7 viewports (320→1440), screenshots in `reports/figma-screenshots/`, machine results in `reports/figma-responsive-results.json` |

One real defect was found and fixed during Phase 9 (see `reports/BUG_REPORT.md`): a transient `is_platform_admin` failure aborted the salon navigation because `authGuard` treated the exception as "unauthenticated".

## 4. Module status classification

| Module | Status | Reason |
|---|---|---|
| Database RBAC (migrations) | **Working** | 52/52 offline checks pass; applies cleanly in order |
| Feature flags (migrations) | **Working** | Same harness; enforcement verified for policies and the three financial RPCs |
| Angular platform core & guards | **Working** | Unit + browser suites green |
| Super Admin portal UI | **Working** | Browser test confirms no broken renders; live data path untested (Blocker B1) |
| Employee login provisioning | **Partially Working** | Code complete and typed; Edge Function **not deployed** (Blocker B2), so no live end-to-end proof |
| MFA enforcement | **Working** (code) / **Not Tested** (live AAL flow) | AAL2 gate implemented; enrollment screen exists; needs a real session to observe TOTP |
| Bootstrap script | **Working** / **Not Tested** | Syntax-checked only, by design (operator-only) |
| Suspension & account-locked flow | **Working** | Harness: suspended members see nothing through RLS; UI routes to `/account-locked` (store test) |

## 5. Operator-required operations — cannot be done by the agent

1. **Apply migrations** to the Supabase project (`qtsvejbzvdizavoevnoi`): `supabase db push` or SQL-editor execution of the two new migration files. Additive; no destructive statements in them.
2. **Deploy Edge Functions**: `supabase functions deploy manage-employee-account` and `supabase functions deploy platform-admin-ops` (no extra secrets needed beyond the platform-provided `SUPABASE_SERVICE_ROLE_KEY`/`ANON_KEY`).
3. **Run the bootstrap**: `npm run bootstrap:admin` with the operator's own credentials in the environment (never committed). 
4. **Enroll MFA** for the Super Admin at `/platform-admin/mfa` with a first login.
5. Optional verification pass on the **live project** (salon creation, flag switching, employee login) after 1–4.

## 6. Honest limitations

- Nothing in this working tree has been exercised against the hosted Supabase project; all database evidence comes from the offline PGlite harness and all UI evidence from the offline browser fixture.
- `git status` shows all changes uncommitted on `main`; a commit should be made before pushing migrations so the working tree matches the database state.
- Password change enforcement relies on `must_change_password` user metadata surfaced in the UI; the temporary password is forced to be changed by the first-login UX, not by a Supabase-native force-change setting (none exists) — documented in `SUPABASE_SECURITY_REPORT.md`.
