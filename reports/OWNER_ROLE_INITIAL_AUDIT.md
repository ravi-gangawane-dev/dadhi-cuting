# DadhiCutting — Salon Owner Role: Initial Implementation Audit

Date: 27 October 2026 · Method: full repository inspection + live-project (prod) evidence from the 25–27 Oct verification passes. No code was changed to produce this report.

## 1. Scope & Method

Audited the existing Salon Owner implementation across every layer the Owner touches — DB schema and RLS, Edge Functions, Angular services/guards/routes/components, and the live production deployment (`qtsvejbzvdizavoevnoi` / `https://dadhi-cuting.netlify.app`). Every status below is backed by an inspectable artifact (file + line or a dated live verification recorded in `reports/E2E_TEST_REPORT.md` §4b).

Evidence base:
- Migrations `202610240001..007`, `202610250001..003` — all applied to the live project (verified via `supabase migration list` equivalent + live behavior).
- Edge Functions `manage-employee-account` (create / reset_password / revoke_session) and `platform-admin-ops` (create_salon / invite_owner / set_member / flag ops) — deployed ACTIVE with CORS support.
- Live browser pass 27 Oct: full owner → staff → suspension → revocation → restore cycle, and per-salon flag override set/clear (see `E2E_TEST_REPORT.md` §4b).
- Offline harness: 53/53 DB checks (`scripts/test-database.mjs`), 59/59 unit tests, 15 browser checks.

## 2. Summary Verdict

The Owner role is **substantially implemented and live-verified**. The audit found **one Missing feature (multi-salon picker), three Partial features (activity-history UI, granular permissions editor, two UX hardening items), and one policy decision point (public owner signup path)**. No Broken features and no duplicate tables/routes were found — everything already exists exactly once.

## 3. Feature-by-Feature Status

Legend: **Working** (implemented + evidence, live-checked where possible) · **Partial** (core works, a sub-capability is absent) · **Missing** (not implemented anywhere) · **Broken** (exists but fails).

### 3.1 Owner provisioning

| Capability | Status | Evidence |
|---|---|---|
| Super Admin creates salon + invites owner (`platform-admin-ops` `create_salon`, `invite_owner`) | **Working** | `supabase/functions/platform-admin-ops/index.ts`; live 27 Oct: salon `QA Verifier Salon 1792927749` + owner invite delivered in ~60 s, audited |
| Idempotent provisioning (no duplicate salons/memberships on re-run) | **Working** | `202610250001_platform_rbac.sql` L113–124 (`exists` guard before insert; unique `(salon_id,user_id)` in `202610240001_core.sql` L23) |
| Owner invite accept → password set → sign-in → dashboard redirect | **Working** | Live 27 Oct (redirect fragment rewritten once; root cause — unset Auth Site URL — fixed and verified same day via `supabase/config.toml` push) |
| Owner membership row role-checked at sign-in | **Working** | `salon-store.service.ts` L160–207 (`ensureLoaded` reads `salon_members`, sets role, redirects suspended users) |
| Audit trail of privileged provisioning | **Working** | `audit_logs` rows verified live (`CREATE_LOGIN`, `SUSPEND_MEMBER`, `REVOKE_SESSION`, `RESTORE_MEMBER`, `RESET_PASSWORD`; platform side in `platform_audit_logs`) |
| Public owner self-registration via `/auth/signup` + `/onboarding` (`createSalon` → owner membership) | **Partial — decision needed** | `onboarding.sql` L14–18 and `202610240005_onboarding.sql` create the salon+owner from any authenticated user *without an active membership*. This is the original product's intended self-onboarding, but Phase-2 of the current brief says "No public Owner self-registration". Cannot be closed without a product decision (see §5-D1). |
| No automatic promotion to owner | **Working** | `salon_members` has **no INSERT policy** for any role (`202610240001_core.sql` L144–188: insert only via security-definer onboarding/platform RPCs); `create_salon`/`invite_owner` are the only paths besides signup-path onboarding. |

### 3.2 Owner authentication & access

| Capability | Status | Evidence |
|---|---|---|
| Login (email or 10-digit mobile → `email_for_mobile` lookup) | **Working** | `auth.service.ts` L29–57; live-verified for owner + staff 27 Oct |
| Session restoration on reload | **Working** | `auth.service.ts` L14–27 (`onAuthStateChange` + `getSession`); live: dashboard survived reloads |
| Logout | **Working** | `auth.service.ts` L59–63 |
| Password change | **Working** | `auth.service.ts` L116–121 (`updateUser({password})`, min 8 chars) + `login.component.ts` L48–49, L124–125 (recovery flow and settings flow both call it) |
| Secure account recovery | **Working** | Email OTP (no allowlist dependency) + email reset link (link now targets prod origin — verified end-to-end 27 Oct); mobile OTP path also implemented (`sendMobileOtp`/`verifyMobileOtp`) |
| Protected routes (fail-closed guard backed by real Supabase session) | **Working** | `auth.guard.ts` L5–35: no session → login; onboarding-independent; suspended → `/account-locked`; role mismatch → `/dashboard` |
| Disabled-account handling | **Working** | `auth.guard.ts` L24–26 + `salon-store.service.ts` L185 (`needsOnboarding` vs `accountSuspended` distinction includes inactive memberships); live-verified (staff suspensions) |
| **Active salon selection for a multi-salon owner** | **Missing** | `salon_store.service.ts` L189: `const membership = active[0]` — the first membership by `created_at` is silently chosen. No picker exists. Schema supports multiple (`unique(salon_id,user_id)`, unlimited memberships per user). |
| Owner cannot reach `/platform-admin` | **Working** | `platform.guard.ts` fail-closed (`platformGuard`); owners have no `platform_admins` row → verdict `false`; `authGuard` additionally sends real platform admins *to* the portal instead of the salon (L15–19). Live-verifiable. |

### 3.3 Owner dashboard

| Capability | Status | Evidence |
|---|---|---|
| Salon name/logo/timezone/language from `salons` | **Working** | `salon-store.service.ts` L190–207; live-verified ( salon header + Marathi language binds) |
| Today's revenue / services / customers / pending / expenses | **Working** | Server-side aggregate RPC `report_summary(p_salon,p_from,p_to)` (`202610240002_operations.sql` L100+) — no client-side download-all; live-verified (₹0 / 0 services / ₹250 pending matched DB truth) |
| Net profit metrics | **Working** | Revenue − expenses derivable from `report_summary` + `expenses`; dashboard exposes revenue + expenses + pending (net display is a small UI addition, data already fetched) |
| Recent service entries / payments | **Working** | `serviceEntries`/`payments` signals, live-verified (`Walk-in customer · test · ₹250`) |
| Employee performance (jobs today) | **Working** | `mapEmployee(e, mapped, today)` per-employee counters; live-verified ("Sandip · 0 jobs today") |
| Revenue chart | **Partial** | Reports screen has period summaries; a dashboard *chart widget* is not present (the report component renders summaries — check `reports.component.html` during implementation). No fake data rendered when DB is empty (empty states verified live). |
| Quick actions | **Working** | Live-verified (Add service / Customers / Payment / Booking) |
| Empty/loading/error states | **Working** | `loading`/`error` signals + live "Loading salon…" observed |
| Timezone-aware day boundaries | **Working** | `businessDate(now, salon.timezone)` + midnight re-check timer (`salon-store.service.ts` L121–127) |

### 3.4 Employee management

| Capability | Status | Evidence |
|---|---|---|
| Employee list (search, archived filter, jobs-today) | **Working** | `employees-list.component.ts`; live-verified |
| Add employee (name/phone/designation/role/commission) | **Working** | Add dialog → `store.addEmployee`; live salon had "Sandip · barber" created through it |
| Employee profile + edit | **Partial** | Route `/employees/:id` exists (`employee-profile.component.ts`); **Profile-image upload is not wired in the owner employee forms** (avatar_url exists in schema; storage bucket exists — `202610240003_storage.sql`). |
| **Employee Permissions (dedicated granular screen)** | **Partial** | Permission model is role-based by DB design (`private.has_role` checks, 5 roles incl. `accountant` added in `202610250001`). Owner assigns role at login creation + Edit dialog — that *is* the permission control. A **granular per-permission editor** does not exist in schema or UI anywhere (nothing to reuse — would be new DB + UI work). |
| Owner provisions staff login (no public registration) | **Working** | Owner UI "Create login" → Edge `manage-employee-account/create` → auth user + `salon_members` row + one-time temp password; live-verified end to end (27 Oct) |
| temp password shown once, never stored in app tables | **Working** | Server-generated CSPRNG password returned once; DB verified to contain no password columns; live dialog behavior verified |
| Reset password (owner-assisted recovery) | **Working** | `revoke-reset` live-verified; audited `RESET_PASSWORD` |
| Activate/deactivate (suspend/restore) member | **Working** | `set_member_active` RPC (RLS owner-checked) + owner UI buttons; live-verified with audit rows |
| Suspension kills live sessions | **Working** | Edge `revoke_session`: REST shapes attempted, falls back to admin password rotation (both live-proven: pre-suspension `refresh_token` → `refresh_token_not_found`; old password → `invalid_credentials`) |
| Employee cannot create accounts / self-promote | **Working** | No `salon_members` INSERT policy for members; Edge function re-verifies caller is active owner server-side |
| Owner cannot create Super Admin / another owner via employee flow | **Working** | Edge `ALLOWED_ROLES = manager|receptionist|employee|accountant` (owner excluded); owner-level changes require platform `set_member` |
| **Employee Activity History (owner-viewable per-employee log)** | **Partial** | `audit_logs` records every create/update/financial action per salon with owner-only read policy, but **no owner UI tab/dialog lists an employee's history** — the log exists, the view doesn't. |
| Profile image on employee record | **Partial** | `employees.avatar_url` + storage bucket exist; UI upload not wired (see above) |

### 3.5 Owner permissions & restrictions

| Capability | Status | Evidence |
|---|---|---|
| Full salon management (services, customers, employees, entries, payments, expenses, closing, reports, appointments, analytics) | **Working** | Route map `app.routes.ts` (owner in every `roles` list); `salon-store.service` `canManage`/`canOperate` L80–83; live-verified |
| Manage salon profile (owner-only) | **Working** | `/settings/salon` route `roles: ['owner']`; `salon_edit` policy owner-only |
| View audit history | **Working** | `audit_read` policy owner-only |
| Blocked from other salons' records | **Working** | Every policy key is `private.has_role(salon_id,…)`; harness + live checks (owner sees exactly one salon) |
| Blocked from `/platform-admin`, feature flags, plans, platform admins | **Working** | No owner-facing route/platform client; `platformGuard` fail-closed; `platform_feature_set` is platform-admin-only (RPC re-checks `is_platform_admin`); live owner probes → 403 |
| Cannot bypass disabled features | **Working** | `private.feature_enabled` re-checked inside financial RPC context; harness-verified; owner "observe" behavior is by design |
| Cannot alter protected audit history | **Working** | No UPDATE/DELETE policy on `audit_logs` at all (append-only) |
| Cannot elevate own privileges | **Working** | `salon_members` UPDATE only via `set_member_role`/`set_member_active` RPCs (owner can set roles of *members* — including, note, potentially promoting a staff member to any salon role; see §5-D2) |

### 3.6 Feature visibility

| Capability | Status | Evidence |
|---|---|---|
| Backend-driven flags (14-feature registry, lifecycle, platform enabled, per-salon override) | **Working** | `202610250002_feature_flags.sql`; `feature_state` RPC; live: `payments` override set → `entitled:false`, cleared → inherit |
| Angular retrieval + route guards | **Working** | `feature-access.service.ts` + `feature.guard.ts` on every feature route |
| Hide/label unavailable modules | **Working** | Navigation binds flag state; "planned" lifecycle flags render labeled-unavailable |
| Owner cannot toggle platform features (no UI exists for owners at all) | **Working** | Portal is platform-admin-only; RPC re-checks |
| Cannot bypass flags from Angular | **Working** | Denial enforced at DB/service layer (verified live + harness) |

### 3.7 Salon operations

| Capability | Status | Evidence |
|---|---|---|
| Services: list/add/edit/archive, categories, pricing, duration, employee assignment | **Working** | Components + `salon-store` mutations; categories auto-seeded at salon creation |
| Customers: add/edit/search/history | **Working** | List + profile routes; live-verified (walk-in customer with history) |
| Payments: cash/UPI/card, partial + pending, outstanding balance | **Working** | `record_payment` RPC — transaction-safe (row-locked `for update`, `request_id` idempotency key → duplicates rejected, unique `(salon_id,request_id,part)`) |
| Prevent duplicate payment submissions | **Working** | Unique constraint + `lock_open_day`/request-id design (harness-verified) |
| Expenses: add/edit, categories, summaries | **Working** | List + add + `expense_day` trigger that charges cash on day creation |
| Daily closing: expected vs counted vs difference, preserved history | **Working** | `close_business_day` RPC with DB-computed `expected_cash`/`difference` and CHECK constraints; `unique(salon_id,closing_date)` |
| Reports: revenue/service/employee/method/expense summaries + date ranges | **Working** | `report_summary` server aggregate + reports component |
| Flag-guarded financial operations | **Working** | `feature_enabled` inside the chain (harness) |

### 3.8 Architecture & design

| Capability | Status | Evidence |
|---|---|---|
| Standalone components, lazy routes, signals, reactive forms, strict TS | **Working** | `app.routes.ts` (all `loadComponent`), signals throughout store, ReactiveForms in dialogs |
| Separated TS/HTML/SCSS/spec files | **Working** | E.g. `bottom-navigation.component.{ts,html,scss,spec.ts}` |
| Service layering → `SalonDataService` typed access → Supabase | **Working** | `data-access/salon-data.service.ts` forces `.eq('salon_id')` on every table read |
| Mobile 5-tab nav + More sheet | **Working** | `bottom-navigation` + `more-menu-sheet` components; live-verified |
| Figma tokens (Emerald/Gold/Ivory/Sage/Beige/Charcoal) | **Working** | Existing styles/screens preserved; live screenshots match |
| Efficient aggregates (no fetch-everything) | **Working** | `report_summary` server aggregate; bounded `.select()` lists |
| No privileged Supabase ops from Angular | **Working** | Service-role key exists only inside Edge Functions; Angular carries the publishable key only |

## 4. Genuine Gaps (what Phase 2+ work must add)

1. **[Missing] Active salon selector for multi-salon owners** — the store silently picks `active[0]`. Needed: a picker surface (dashboard switcher or login-time choice) + store support to switch active salon without re-login. *(Phase 3 requirement.)*
2. **[Partial] Employee Activity History view** — `audit_logs` already capture per-salon actions and owners already hold read grants (`audit_read`). Needed: an owner-facing history surface (per-employee tab/dialog reading `audit_logs`). Low risk — pure UI on existing data. *(Phase 5 requirement.)*
3. **[Partial] Dashboard revenue chart widget** — summary data exists; a small chart widget for the dashboard is the only visual gap. Pure UI.
4. **[Partial] Employee profile image upload** — schema + storage bucket exist; wire upload in Add/Edit employee + profile. Pure UI + existing storage.
5. **[Decision] Granular employee permission editor** — none exists in DB or UI; the permission system is role-based by design. Either declare role-based permissions as the product answer (recommended; matches RLS and Edge `ALLOWED_ROLES`) or introduce a new per-employee permission model (new tables + policy rework — significant, duplicates the existing design).
6. **[Partial/UX] `must_change_password` is metadata-only** — staff reach the dashboard with the temp password (documented OPEN-03). Optional: a client-side prompt that calls `updatePassword` when the metadata flag is set. (No backend gap — enforced metadata exists.)

## 5. Decision points requiring the product owner (you)

- **D1 — Public owner self-onboarding**: the app currently lets any new signup finish `/onboarding` and become owner of a *fresh* salon (the original product flow, live). The new brief says only Super Admin may make owners. Options: (a) keep self-onboarding as a deliberate product path (existing + verified); (b) disable `/auth/signup` + onboarding creation behind a platform entitlement/invite-only switch. I recommend (b-lite): keep signup for staff-portal access but gate `createSalon` behind a flag so only invited/provisioned owners create salons — one small RPC/policy change, no UX rebuild.
- **D2 — Owner's role-grant scope**: `set_member_role` (already owner-callable) lets an owner set member roles within the salon. The brief says owners may not "create another Owner". Trivial hardening: constrain owner-called `set_member_role` to non-owner target roles. Small RPC edit + harness case.
- **D3 — Permissions granularity**: role-based (recommended, existing design) vs granular delegable permissions (new DB model).

## 6. What Phase 2+ will do (planned, no actions taken yet)

1. Implement gaps 1–4 and 6 (small, additive; no rebuild; preserves routes/components — the salon selector extends the existing store rather than adding duplicate dashboard routes).
2. Resolve D1/D2/D3 with your decision before touching anything authorization-related.
3. Reconcile with existing verified infra: **no new Edge Functions needed** (provisioning, revocation, RLS all live); **no new migrations** unless D1/D2/D3 decide so.
4. Then execute the security validation matrix and Playwright E2E pass against staging-safe test data, producing the remaining 8 `OWNER_*` reports.

## 7. Honest-status conclusion

| Owner feature area | Status |
|---|---|
| Provisioning & invitation | Working (platform path verified live) |
| Auth (login/restore/logout/password/recovery) | Working |
| Dashboard | Working (chart widget minor gap) |
| Employee management | Working (activity-history view & profile image partial) |
| Permissions & restrictions | Working (granularity = role-based by design) |
| Feature visibility | Working |
| Salon operations (services/customers/payments/expenses/closing/reports) | Working |
| Multi-salon handling | **Missing** (no active-salon picker) |
| Security (RLS isolation, session death, audit) | Working (live-proven) |
| Architecture & design system | Working |

Nothing is Broken. The single Missing item is small and well-bounded; the Partials are UI-level on existing data foundations.
