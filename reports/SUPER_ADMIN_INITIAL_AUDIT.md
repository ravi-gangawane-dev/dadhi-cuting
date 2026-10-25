# DadhiCutting — Super Admin / RBAC / Feature Flags Initial Audit

Date: 25 October 2026 · Auditor: pre-implementation review of the working tree at commit `1a08313` ("update new repor"). No production or remote changes were made during this audit.

## 1. Technology and project structure

| Item | Finding |
|---|---|
| Angular | v22.2, standalone components, lazy `loadComponent` routes, Signals, new control flow |
| Styling | Tailwind 4 (PostCSS) + per-component SCSS, shared component library in `src/app/shared/components` |
| Auth | Supabase JS 2.118 (`@supabase/supabase-js`), email/password + email/mobile OTP paths (`src/app/core/services/auth.service.ts`) |
| Database | Supabase PostgreSQL with RLS, 7 migrations in `supabase/migrations/` (core, operations, storage, integrity, onboarding, corrections, mobile-login) |
| Config | Only publishable key in `src/environments/environment.ts` (verified: no service-role/secret in repo) |
| Hosting | Netlify SPA (`netlify.toml` with `/* → /index.html`-style redirect configured) |
| State | `SalonStoreService` is the single app facade (signals for salon/employees/customers/entries/payments/expenses/closings/appointments/notifications + `report_summary` RPC) |

## 2. Routes and guards

`src/app/app.routes.ts` — all business routes behind `authGuard`; `data.roles` declares `owner|manager|receptionist|employee` for payments, customers, expenses, closing, reports, salon settings. Gaps:

- The route guard only *redirects* on role mismatch; it cannot block API calls, but the database RLS + definer RPCs do enforce the same role lists (verified in migrations) — this is the correct layering.
- No `/platform-admin` area exists. No guard checks platform-admin status or MFA level.
- The `roles` list does not know about `accountant` (role does not exist yet anywhere).
- Public `auth/signup` panel self-registers a user who may then create a salon via `create_my_salon` and become its **owner** (self-serve SaaS model — legitimate, and distinct from platform administration; must never be promotable to platform admin).

## 3. Authentication flow

- `auth.service.ts`: sign-in accepts email or 10-digit mobile (mobile resolved server-side by definer RPC `email_for_mobile`; no username-enumeration surface beyond a null return).
- Sign-up via `auth.signUp` + confirmation email, `create_my_salon` onboarding RPC creates the caller's first salon (idempotent-ish, advisory-locked, refuses a second salon).
- Recovery: email OTP / mobile OTP / reset link paths exist. Mobile linking (`linkMobile`, `confirmLinkedMobile`) and phone-unique constraint are in place.
- **Missing**: no MFA enrollment/verification anywhere, no AAL check, no platform-admin identity concept, no employee self-registration (correct — the signup panel creates an owner-account, not an "employee login", which is acceptable but the distinction is implicit only).

## 4. Database schema and RLS (migrations 202610240001–0007)

Existing tables: `salons`, `user_profiles` (has `phone`), `salon_members` (roles `owner|manager|receptionist|employee` via CHECK, `active`), `employees` (has nullable `user_id` link to auth.users), `customers`, `service_categories`, `services`, `service_entries` (+`service_entry_items`), `payments`, `expense_categories`, `expenses`, `daily_closings`, `appointments`, `notifications`, `audit_logs`.

RLS posture is strong:

- RLS enabled on every table; `authenticated` only gets scoped grants; `private.has_role(uuid, text[])` is the central definer predicate; column-level `grant` lists limit mutation surface.
- Financial writers are definer RPCs (`create_service_entry`, `record_payment`, `close_business_day`, `void_service_entry`, `void_payment`) with idempotency keys, day-locking (`lock_open_day`), NaN guards, server-side totals, audit + notification triggers.
- Employee restrictions are enforced in DB: employees read only their linked rows, see the catalog, cannot read payments or other customers' data, and cannot invoke financial writers.
- Cross-salon FKs are composite (`(salon_id, id)` references) — spoofing a foreign salon id fails.
- `audit_logs` are server-generated via triggers; owners can read their salon's audit trail.

Gaps / risks found:

| # | Risk / gap | Severity | Notes |
|---|---|---|---|
| R1 | No platform-level role. `salon_members.role` CHECK and all policies/services know only salon roles; nothing distinguishes a Super Admin. | High | Super Admin cannot exist today; no way to provision salons/owners centrally except SQL-editor use of `provision_salon` with service role. |
| R2 | No feature-flag storage. Modules ship enabled by the mere presence of routes/policies; nothing can disable e.g. Reports per salon. | High | Requirement #6 unmet. |
| R3 | Employees are *staff records* only: `employees.user_id` exists but no flow creates an auth account, so staff cannot log in. `salon_members` rows for staff do not exist and the UI cannot create them. | High | Requires server-side provisioning (service role) — Edge Function + Owner UI. |
| R4 | No MFA support, so "MFA required for platform administration" cannot be enforced. | High | Needs enroll UI + guard on AAL. |
| R5 | Owners cannot suspend a *membership* (`salon_members.active`) — only the `active` column of the `employees` staff record. Deactivating the staff record does not revoke login. | High | Needs owner-scoped definer RPC; DB check `own_*` policies key off `employees.user_id …` link + role. |
| R6 | `audit_logs.salon_id` is NOT NULL → platform-level actions (provisioning salons, changing global flags) cannot be audited in a portable way. | Medium | Needs separate `platform_audit_logs`. |
| R7 | `email_for_mobile` is granted to `anon` and returns account emails for a mobile number — theoretically a (narrow) enumeration probe; low risk because only exact-verified 10-digit numbers resolve and sign-in still needs the password. | Low | Accept; do not add logging-free enumeration; keep `shouldCreateUser:false`. |
| R8 | `salons` update policy is owner-only while `canAccess('/settings/salon')` agrees; profile edit of employees' names is allowed to manager/receptionist by `operational_*` roles for `employees` (owner, manager only). Consistent. | Info | — |
| R9 | Accountant role absent from the CHECK constraint and from every policy role list. | Medium | Must extend constraint + financial-read policies only. |
| R10 | Session revocation: logout uses `auth.signOut()`. Global revoke (supersession of refresh tokens for suspended users) is not enforced by any app-side logic; a suspended membership is enforced by RLS anyway (every query keys on active membership). | Medium | Suspension via RLS is sufficient for data access; document token revocation using `auth.admin.signOut` in the Edge Function (service role) when suspending. |

## 5. Current roles & permissions matrix (as-found)

| Route | owner | manager | receptionist | employee | DB enforcement |
|---|---|---|---|---|---|
| dashboard | ✔ | ✔ | ✔ | ✔ | (dashboard is an aggregate UI; numbers come from `report_summary` respecting RLS) |
| customers (+ profile) | ✔ | ✔ | ✔ | ✖ | policy role list ✔ |
| services catalog / new entry | ✔ | ✔ | ✔ (via RPC) | ✔ catalog read only | `create_service_entry` RPC allows o/m/r; employees read catalog only ✔ |
| payments page / collect | ✔ | ✔ | ✔ | ✖ | `record_payment` RPC ✔ |
| expenses / new | ✔ | ✔ | ✖ | ✖ | policies ✔ |
| closing | ✔ | ✔ | ✖ | ✖ | `close_business_day` ✔ |
| reports | ✔ | ✔ | ✖ | ✖ | `report_summary` is invoker-rights → RLS applies; financial tables readable by o/m/r — receptionist is *not* blocked from reports data via API (UI hides it). Minor gap vs. matrix; acceptable but flag. |
| salon profile settings | ✔ | ✖ | ✖ | ✖ | owner-only update policy ✔ |
| employees list | ✔ | ✔ | ✖ | ✖ | policies ✔ (staff CRUD) |

## 6. Mock / static data

- `src/app/mock-data/` (`initial-mock-data.ts`, `repositories/salon.repository.ts`) is **dead code** — zero imports found (`grep mock-data` over `src` returned nothing). Safe to delete after real replacements verified (Phase 7 cleanup).
- Component `.html` templates no longer hardcode dashboard figures (dashboard has real bindings backed by `report_summary`); the old "hardcoded HTML amounts" issue from `docs/backend-audit.md` (24 Oct) has been resolved in the meantime.
- No hardcoded credentials, salon records, or fabricated totals found in live code paths.

## 7. Existing test infrastructure

- `scripts/test-database.mjs`: PGlite-based integration harness that applies every migration, fakes `auth`/`storage` schemas and runs ~30 security/behaviour assertions (idempotency, roles, cross-salon isolation, employee restrictions, timezone, closing math, mobile uniqueness). Fast, offline, no production data — this is the right harness to extend.
- `scripts/test-browser.mjs`: browser smoke tests (22 KB) for the UI.
- Playwright 1.64 + vitest 5 + jsdom; ~20 superficial component `.spec.ts` files (creation-only).
- `ng test` builder wired in `angular.json`.

## 8. Edge Functions / backend compute

- No `supabase/functions` directory. All privileged flows today rely on DB definer RPCs which is fine for data, but **user provisioning (creating auth accounts, granting/rescinding platform roles) cannot be done by any DB RPC exposed to the browser** — a service-role Edge Function (or operator-run script) is required.

## 9. Duplication / dead code

- `mock-data/` folder: unused (safe removal after re-verification).
- `ISalonRepository` Observable interface: unused design artifact (keep until Phase 7 cleanup is verified).

## 10. Conclusion — what exists and what is required

Reusable, working: auth + guards, schema + RLS, definer RPCize financial workflows, dashboard real data, shared component kit, DB test harness. Do not touch them beyond additive changes.

Required additions (in dependency order):

1. Migration A (RBAC): `platform_admins` + `private.is_platform_admin()`, extend role CHECK to `accountant`, accountant financial-read policies, owner-scoped membership management RPC (`set_member_active`), platform audit table.
2. Migration B (flags): `feature_flags` registry + `salon_feature_overrides` + `feature_state`/`feature_enabled` + Super-Admin-only setters + enforcement hooks in existing RPCs/policies.
3. Edge Function `create-employee-account` (+ suspend/password-reset admin calls) — server-side only, requires deployment & secrets → operator approval.
4. Angular: platform gate (guard + MFA), `/platform-admin` portal (real queries only), Owner employee-account UI, feature facade gating routes/data.
5. `scripts/bootstrap-super-admin.mjs` — operator-run, service-role key from environment, prompts for identity, idempotent, audited; **never executed by the agent without explicit approval**.
6. Extend `test-database.mjs` with RBAC/flag/suspension assertions; run offline harness; production migration push and Edge deployment flagged for explicit operator approval.
