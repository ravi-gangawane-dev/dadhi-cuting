# DadhiCutting — API Integration Report

Date: 25 October 2026. Every data path used by the browser is enumerated here with its status. Unless another artifact is cited, verification came from the executed suites in this session: 52/52 DB checks, 59/59 unit tests, 15 browser checks + 19 screens × 7 viewports, production build.

Live-project verification categories: `Working` = proven in this session · `Verified offline` = harness/fixture prove the contract; needs live confirmation after operator deploy steps · `Not Tested` = no execution possible here.

## 1. REST tables (PostgREST via supabase-js)

| Table | Selects | Inserts | Updates | Deletes | Grants/RLS posture | Status |
|---|---|---|---|---|---|---|
| `salons` | ✔ store, platform portal (+`count exact`) | ✔ onboarding RPC only | ✔ owner (salon profile) | ✖ | `platform_read_salons` added (A) | Working |
| `salon_members` | ✔ membership resolve (all rows incl. inactive; suspension detection), owner status list, portal | ✔ Edge Function only | ✔ owner RPC / Edge / platform | ✖ | RLS + composite FKs | Working (suspension-aware reads verified offline) |
| `user_profiles` | ✔ name/phone resolution, portal reads | ✔ signup/onboarding, Edge upsert | ✔ profile save | ✖ | portal read policy added | Working |
| `employees` | ✔ list, portal (`user_id` link) | ✔ owner | ✔ owner | ✔ owner | flag-gated writers | Working (unique `employees_user_account_key` enforced in harness) |
| `customers` | ✔ | ✔ | ✔ | ✔ | flag-gated writers (`customers` key) | Working |
| `service_categories` / `services` | ✔ ✔ | ✔ ✔ | ✔ ✔ | ✔ ✔ | flag-gated writers (`services`) | Working |
| `service_entries` / `service_entry_items` | ✔ list + items | ✔ via `create_service_entry` RPC only | ✔ void via RPC | ✖ | flag check inside RPC | Working |
| `payments` | ✔ | ✔ via `record_payment` RPC only | ✔ void via RPC | ✖ | RPC + `payments` flag | Working |
| `expenses` / `expense_categories` | ✔ ✔ | ✔ ✔ (owner/manager) | ✔ ✔ | ✔ | flag-gated writers; accountant read-only | Working |
| `daily_closings` | ✔ | ✔ via `close_business_day` RPC | ✖ | ✖ | RPC + `daily_closing` flag + day-lock | Working |
| `appointments` | ✔ | ✔ | ✔ scheduled edits | ✔ | flag-gated writers (`appointments`) | Working |
| `notifications` | ✔ | ✔ (server triggers) | ✔ mark-read | ✖ | salon-scoped | Working |
| `audit_logs` | ✔ owner read | ✔ triggers only | ✖ | ✖ | unchanged | Working |
| `platform_admins` | ✔ read for confirmed admins only | ✖ browser (script/Edge only) | ✖ browser | ✖ | service-role writes; browser asks `is_platform_admin()` instead | Verified offline |
| `platform_audit_logs` | ✔ admins only | ✔ portal RPCs/Edge/script | ✖ | ✖ | grant `select` to `authenticated` only; RLS `platform_admin_inspect` | Working (harness: non-admin reads return 0 rows) |
| `feature_flags` | ✔ portal | ✖ (seeded in migration) | ✔ via `platform_feature_set` RPC | ✖ | no direct writes | Working |
| `salon_feature_overrides` | ✔ portal | ✔ via `platform_salon_feature` RPC | ✔ same RPC | ✔ (clear override) | no direct writes | Working |

## 2. Database functions (RPCs)

| Function | Purpose | Permissions | Enforcement | Status |
|---|---|---|---|---|
| `report_summary(p_salon,p_from,p_to)` | Dashboard/reports aggregates | authenticated | invoker-rights → RLS | Working |
| `create_service_entry(p_salon,p_employee,p_customer,p_items,p_discount,p_notes,p_request,p_date?)` | Invoice creation, server totals, idempotency | authenticated (o/m/r asserted) | + `services` flag check (202610250002) | Working |
| `record_payment(p_salon,p_entry,p_parts,p_confirmation,p_session,p_request)` | Receipts, idempotency, confirmation reuse guard | authenticated | + `payments` flag check | Working |
| `void_payment` / `void_service_entry` | Reversal with reason audit | authenticated (asserted roles) | unchanged | Working |
| `close_business_day(...)` | Day-lock, cash reconciliation | authenticated (o/m) | + `daily_closing` flag check | Working |
| `email_for_mobile(p_mobile)` | Mobile→email sign-in resolution | authenticated (+anon historically) | unchanged (audit finding R7 accepted) | Working |
| `provision_salon(p_owner,p_name)` | Server salon creation | **service_role only** (revoked elsewhere) | unchanged | Working |
| `create_my_salon(p_name)` | Owner onboarding | authenticated | **hardened (A)**: rejects users with any membership; rejects platform admins | Working |
| `is_platform_admin()` (private.* → callable) | Browser admin verdict | authenticated | read-only definer | Working |
| `set_member_active(p_salon,p_user,p_active)` | Owner suspend/restore | owner-of-salon only (asserted server side) | refuses owner rows; audited | Working |
| `set_member_role(p_salon,p_user,p_role)` | Owner role assignment | owner-of-salon only | roles limited to manager/receptionist/employee/accountant | Working |
| `feature_state(p_salon)` | Feature entitlement map (jsonb) | authenticated | fail-closed unknown keys | Working |
| `platform_feature_set(p_key,p_platform_enabled,p_lifecycle)` | Registry control | platform admin (asserted) | audited | Working |
| `platform_salon_feature(p_salon,p_key,p_enabled)` | Salon override control | platform admin | cannot exceed platform availability; audited | Working |

## 3. Supabase Auth APIs

| Path | Use | Status |
|---|---|---|
| `signInWithPassword` (email or mobile-resolved email) | Login | Working |
| `signUp` + `emailRedirectTo` | Owner onboarding | Working |
| OTP flows (email/mobile), mobile link + confirm, reset password, update password | Recovery/mobile identity | Working |
| `mfa.enroll/challenge/verify`, `getAuthenticatorAssuranceLevel` | Platform MFA (AAL2) | Verified offline (These are verifier-only APIs; the AAL2 gate logic is unit-tested; a real TOTP enrollment needs a live project — **Not Tested**) |
| `admin.createUser/inviteUserByEmail/updateUserById/listUsers` | Edge Functions + bootstrap script only (service role) | **Not Tested** (blocked on deploy) |

## 4. Edge Functions

| Function | Actions invoked from | Verification approach | Status |
|---|---|---|---|
| `manage-employee-account` | `SalonStoreService.createEmployeeAccount`, `resetEmployeePassword` (via `functions.invoke`) | caller JWT verified with anon-key client; owner-of-salon assert; scoped service-role writes; audit | **Not Tested** vs live — written + typechecked; requires deploy (operator step) |
| `platform-admin-ops` | `platform-salon-detail` (owner invite, salon creation, member control) | caller JWT verify; `platform_admins` server-side check; `provision_salon` reuse; platform audit rows | **Not Tested** vs live — same |

## 5. Environment & configuration

- `src/environments/environment.ts` holds only `supabaseUrl` + `sb_publishable_…` key for project `qtsvejbzvdizavoevnoi`. No secret or service-role key is referenced by any browser-bundled file (re-checked in Phase 9).
- `netlify.toml` SPA catch-all covers `/platform-admin/*`, `/account-locked`, and deep links.

## 6. Summary

| Category | Count | Status |
|---|---|---|
| REST tables integrated | 18 | 15 Working, 3 Verified offline (`platform_admins`, `platform_audit_logs` admin surfaces, `salon_feature_overrides` direct) |
| RPCs | 15 | All Working (DB-path verified); live-project confirmation recommended after migrations push |
| Auth API paths | 10 | 9 Working, MFA live flow Not Tested |
| Edge Functions | 2 | Written; Not Tested live (deploy blocked on operator) |

No hardcoded business records, totals, emails, phone numbers, or user IDs exist in any integration path; the browser test uses a deterministic synthetic fixture and the DB harness uses generated UUIDs.
