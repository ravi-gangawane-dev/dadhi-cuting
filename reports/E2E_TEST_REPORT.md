# DadhiCutting — E2E / Integration Test Report

Date: 25 October 2026. Three suites were executed in this session; nothing in this document is projected or assumed. "Not Tested" items are listed explicitly in §4.

## 1. Database integration harness — `npm run test:db` → **52/52 PASS**

Offline PostgreSQL (PGlite) with every migration applied in order and mocked `auth`/`storage` schemas. No production data touched.

Pre-existing coverage (34 checks): idempotency keys for financial RPCs, day-lock, cash math/difference, timezone-aware report windows, cross-salon isolation, employee read scoping, NaN/discount guards, mobile uniqueness, notification triggers, audit logging, void flows with reason, etc.

New coverage added for this project (18 checks):

| Check | Verifies |
|---|---|
| owner restores and suspends staff through the audited RPC | `set_member_active` happy path + audit row |
| owner cannot suspend an owner membership or grant platform-ish roles | `set_member_active`/`set_member_role` negative paths |
| owner re-roles staff inside the allowed set | role whitelist (manager/receptionist/employee/accountant) |
| non-owner cannot manage memberships | privilege boundary |
| service-role bootstraps the platform admin list, browsers cannot | `platform_admins` write surface |
| platform admin exists with cross-salon inspect rights and no owner powers | `platform_read_*` scope |
| platform-admin self-onboarding is blocked | hardened `create_my_salon` |
| platform admin manages registry lifecycle with audit | `platform_feature_set` |
| salon entitlement overrides cannot exceed platform availability | `platform_salon_feature` ceiling |
| disabling a salon entitlement is enforced by policies and RPCs | flag-gated writers |
| owner observes (not controls) a disabled feature | role boundary for flags |
| payments flag gates receipt recording; re-enabling restores it | `record_payment` flag check (salon B: `salonB`/`empB`/`custB`/`serviceB`) |
| platform audit records every privileged change | `platform_audit_logs` (non-admin reads = 0 rows) |
| lifecycle day-lock still governs closing after flag changes | `close_business_day` flag + day-lock interplay |
| accountant role accepted/reads financial tables only | extended CHECK + `accountant_read_*` |
| employees user-account link uniqueness | `employees_user_account_key` |
| suspended membership kills data access | RLS with `active=false` |
| salon names/roles constraints | migration integrity |

## 2. Unit tests — `npm test` → **59/59 PASS** (42 spec files)

Includes the expanded guard specs (authGuard/featureGuard/platformGuard: admin routing to `/platform-admin`, MFA-needed routing to `mfa`, feature denial redirect, suspension routing, roles enforcement) plus the salon-store and feature-access contracts. Kept passing through the final `auth.guard.ts` hardening fix of this session.

## 3. Browser regression — `npm run test:browser` → **15 counted checks PASS** (+2 scripted passes)

Playwright (`msedge`, headless) against `dist/DadhiCuting/browser` served at `127.0.0.1:4173`, with a deterministic supabase URL fixture (synthetic session/JWT + in-memory tables). Business-flow coverage:

1. protected route redirects to login without a session
2. email/password login loads salon membership (`loginCount === 1`)
3. session survives reload
4. create employee through existing dialog
5. create customer through existing dialog
6. create service through existing dialog
7. record service creates unpaid invoice and opens payment screen
8. partial cash receipt preserves remaining balance (50/200)
9. remaining payment completes invoice (200/200)
10. owner reverses a mis-keyed receipt with a reason (150 remains)
11. expense save updates dashboard totals
12. daily closing persists entered cash and reports show ₹200
13. mobile layout stays within viewport
14. notifications mark read through the existing API
15. appointment edit and delete use existing handlers
+ dialog keyboard navigation / Escape dismissal; logout returns to sign-in (logged PASS, not counted in the `passed` counter)
+ zero `pageerror` entries asserted at the end

Layout: 19 screens × 7 viewports (320, 360, 390, 430, 768, 1024, 1440) — no overflow, no broken images, content present, bottom-nav clearance — new admin surfaces included in the fixtures (`is_platform_admin` → false, `feature_state` → 14-key map). Screenshots: `reports/figma-screenshots/*.png`; machine results: `reports/figma-responsive-results.json`. Marathi-mode screenshot at 320px captured.

## 4. Explicitly NOT executed (and why)

| Item | Reason |
|---|---|
| `supabase db push` of the two new migrations | Operator-required (live project `qtsvejbzvdizavoevnoi`) |
| `supabase functions deploy` (both) | Operator-required |
| `npm run bootstrap:admin` execution | Operator-only tool; interactive + service-role key |
| Real MFA enrollment/AAL2 verification vs live Auth | Requires deployed migrations + real admin session |
| Live E2E of employee login provisioning (create/reset password against hosted Auth) | Requires deployed Edge Functions |
| Load/performance and browser matrix beyond bundled `msedge` | Out of scope for this project |
| Redeploy/verification of Netlify hosting | Deployment pipeline untouched |

## 5. Verdict

All runnable suites are green: **52/52 DB, 59/59 unit, 15 browser checks, build OK**. The gap that remains between "verified offline" and "verified live" is exactly the operator action list in `PRODUCTION_READINESS.md`; no code change should be needed for it.
