# DadhiCutting — end-to-end backend integration report

Date: 24 October 2026 (updated) · Project ref `qtsvejbzvdizavoevnoi` · Angular 22.2 · `@supabase/supabase-js` 2.118

## 1. Architecture

```
Component (presentation only)
  → SalonStoreService (facade: signals, loading/saving/error, role checks)
    → SalonDataService (typed CRUD, paging, RPC)  →  Supabase PostgREST
    → StorageService (upload, signed URLs)       →  Supabase Storage (private)
    → AuthService (session, login, recovery)     →  Supabase Auth
```

Components never call Supabase directly. Money writes go only through RPCs
(`create_service_entry`, `record_payment`, `close_business_day`, and now the correction
paths). Aggregates come from `report_summary` (security invoker, so RLS still applies).
`create_my_salon` handles first-run onboarding; `provision_salon` is administrator-only.

## 2. Environment and configuration

| Item | State |
|---|---|
| Client config | `src/environments/environment.ts` — public URL + `sb_publishable_` key only |
| Secret keys in client | None |
| Production override | `scripts/configure-environment.mjs` rewrites `environment.ts` from `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`; rejects non-HTTPS and non-publishable keys |
| Angular `fileReplacements` | Not used, intentionally: Netlify injects production values at build time |
| Netlify | `netlify.toml` — build script, publish `dist/DadhiCuting/browser`, SPA fallback |
| Auth redirect URLs | Dashboard-only setting (localhost + Netlify domain) — **not verifiable from the repo** |

## 3. Database (applied to the hosted project)

| Migration | Contents |
|---|---|
| `202610240001_core.sql` | 16 tables, tenant FKs, indexes, RLS enablement, column grants, audit trigger, `provision_salon` |
| `202610240002_operations.sql` | invoice/receipt/closing RPCs, `report_summary`, open-day locks, expense-day guard, notifications |
| `202610240003_storage.sql` | private `salon-private` bucket (5 MB), image/PDF policies |
| `202610240004_integrity.sql` | finite-money checks, timezone validation, overlapping appointments |
| `202610240005_onboarding.sql` | `create_my_salon` self-service owner onboarding |
| `202610240006_corrections.sql` | `void_service_entry`, `void_payment`, audited deletes for expenses/appointments, closed-day guard on expense deletion |

Tables (16): `salons`, `user_profiles`, `salon_members`, `employees`, `customers`,
`service_categories`, `services`, `service_entries`, `service_entry_items`, `payments`,
`expense_categories`, `expenses`, `daily_closings`, `appointments`, `notifications`,
`audit_logs`.

Public functions (8): `create_my_salon`, `provision_salon`, `create_service_entry`,
`record_payment`, `close_business_day`, `report_summary`, `void_service_entry`,
`void_payment`. Private helpers: `has_role`, `own_employee`, `touch`, `audit`,
`audit_delete`, `lock_open_day`, `expense_day`, `expense_delete_day`, `notify`.

Server-side invariants: prices read from `services`, `total = subtotal − discount`,
discount ≤ subtotal, quantities 1–100, receipt methods cash/upi/card, positive 2-decimal
amounts, overpayment rejected, idempotency keys, closed days locked, one closing per
salon/day, appointment overlap rejected, audit rows written by trigger.

Correction rules (new): a receipt can be reversed only on an open business day; an invoice
can be voided only when it has no receipts; both write an audit row and a notification.
Voided invoices are `cancelled`, excluded from revenue/outstanding and from customer,
employee and dashboard service lists.

## 4. Security model

- RLS on all 16 tables (45 policies: 15 explicit + 25 generated + 3 storage + 2 delete).
- Owner: salon config, staff, catalog, expenses, closing, audit, corrections.
- Manager: operations, catalog, expenses, closing, corrections.
- Receptionist: customers, appointments, invoices, receipts, appointment deletion.
- Employee: linked work and catalog read only; cannot take payments or correct them.
- Identity is always `auth.uid()`; membership changes are not browser-writable.
- Storage private, 5-minute signed URLs, owner-only logos.
- `provision_salon` and all correction RPCs are revoked from `anon`.

## 5. Module status

| Module | Backend path | Status |
|---|---|---|
| Login / logout / session restore | Supabase Auth; `email_for_mobile` for number sign-in | Working (unit + fixture + hosted check) |
| Password reset / update | Mobile SMS OTP or email code (`signInWithOtp`/`verifyOtp`/`updateUser`) | Working in code; delivery needs an SMS provider or the `{{ .Token }}` email template |
| Onboarding | `create_my_salon` | Working (DB harness) |
| Dashboard | `report_summary`; staff-performance widget from loaded entries | Working (fixture) |
| Employees | CRUD + archive | Working (fixture) |
| Customers | CRUD, server search + paging | Working (fixture) |
| Catalog | services + categories; categories can be added, renamed, archived | Working |
| Service entry | `create_service_entry` | Working (fixture) |
| Payments | `record_payment`; receipt reversal + invoice void in UI | Working (DB harness) |
| Expenses | CRUD, filters, delete, category add/rename, attach on create | Working (fixture) |
| Daily closing | `close_business_day` | Working (fixture) |
| Reports | `report_summary` with presets, custom range, CSV export | Working (fixture) |
| Appointments | book, reschedule, delete, status | Working |
| Notifications | records + read state | Working |
| Storage | logo, employee photo, expense attachment (create and edit) | Working in code; hosted upload unverified |

## 6. Verification executed

| Check | Command | Result |
|---|---|---|
| Production build | `npm run build` | Pass (bundle-budget warning only) |
| Unit/component tests | `npm test` | **39 files / 47 tests pass** |
| Database + RLS | `npm run test:db` | **32 checks pass** (PGlite) |
| Browser flows (fixture API) | `npm run test:browser` | **13 checks pass** |
| Hosted tables | REST probes | 16/16 return 401 (exist, RLS-protected) |
| Hosted RPCs | REST probes | 8/8 return 401 for anon (exist, non-public) |
| Hosted deletes | DELETE probes | 401 for anon (grants limited to authenticated roles) |
| Migrations | `supabase db push` | Up to date (6 migrations) |
| Dev server smoke | signed-out `/dashboard` | Redirects to `/auth/login`, no console errors |

New database checks this round: receipt reversal restores outstanding balance and writes
an audit row; an unpaid invoice voids while a paid one is protected; appointment
reschedule + delete with audit; expense delete on an open day; receptionist cannot void
financial documents; a closed day blocks receipt reversal and expense deletion. The
browser fixture additionally drives the receipt-reversal dialog end to end (button →
reason → RPC → refreshed balance).

Not executed: hosted Auth with real accounts, cross-salon isolation with real JWTs,
storage upload/download, password-recovery email delivery, Netlify deployment.

## 7. Scope decisions and remaining work

### Confirmed out of scope — will not be implemented
Recorded by product decision on 24 October 2026. These are intentionally not code work
for this project; they are not defects in the integrated app.

1. Netlify deployment and the Supabase Auth Site URL / redirect allowlist (deployment
   configuration, not application code). Note: until the allowlist is set, password
   reset links will not return to the app.
2. Audit-log viewer (`audit_logs` continue to be written by triggers and RPCs).
3. Ageing report of outstanding balances.
4. Customer `gender` capture and Marathi name columns for services/expenses.
5. Customer photos.
6. WhatsApp / push notification delivery (in-app records only, as built).
7. Payment gateway or automated UPI settlement (receipts remain manually confirmed).
8. Past-day corrections (voiding stays blocked on a closed day).
9. Offline retry queue, rate limiting/CAPTCHA, and a CI schema-drift gate.
10. Per-feature paging/streaming for history (the 500-row transport paging remains).

### Remaining implementation
- Multi-salon staff: the app picks the oldest active membership; an interactive salon
  switcher is still not implemented.
- Idempotency keys are per form instance, so reloading an unsaved form starts a new key.

### Verification still outstanding (no code change)
- Hosted acceptance run: two salons, one account per role, real JWTs — cross-salon
  reads/writes, role denials, correction RPCs, storage signed URLs, recovery email.
- Browser fixtures cannot catch contract drift against hosted data.

## 8. Residual risks

- The void-invoice dialog has no browser-fixture check; its server rules are covered by
  the PGlite harness. The receipt-reversal dialog is covered end to end.
- `src/app/mock-data/` remains in the repository but is imported nowhere.
- Financial definitions are documented in `docs/supabase-setup.md` §4/§4a.
