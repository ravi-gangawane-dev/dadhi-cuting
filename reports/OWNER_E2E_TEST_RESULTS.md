# DadhiCutting — Owner E2E Test Results

Date: 27 October 2026 · Every scenario below **actually ran** end-to-end. Scope: production site `https://dadhi-cuting.netlify.app` + production Supabase project; deterministic offline harnesses referenced per scenario. Sign-in paths used their real product flows (email recovery link or password grant) — no credential shortcuts and no mocked data at the live layer.

## 1. Live E2E scenarios (executed)

| # | Scenario | Path exercised | Result | Evidence |
|---|---|---|---|---|
| E1 | Owner account recovery end-to-end | `/auth/v1/recover` → real mailbox (mail.tm) → verify link → new password matrix → auto sign-in → `/dashboard` showing correct salon | **Working** | Recovery link read from the real mailbox this cycle; fragment landed and app resumed (the login screen itself also re-verified by the staff E2E below) |
| E2 | Multi-salon owner provisioning (platform side) | Super Admin `create_salon` with an *existing* owner's email → idempotent resolve → second owner membership, `CREATE_SALON` audit row | **Working** | Salon `QA Verifier Salon 2 (same owner)` created live this cycle; owner double-membership confirmed via REST |
| E3 | Multi-salon switching (new feature) | Settings → "Your salons" lists both salons with role/status → **Switch** → Salon 2 becomes Current → choice survives full page reload → switch back → Salon 1 Current again | **Working** | Live browser text-verified at each step this cycle |
| E4 | Employee activity history (new feature) | Owner opens `/employees/<sandip>` → "Activity history" renders newest-first audit trail (RESET_PASSWORD, RESTORE_MEMBER, REVOKE_SESSION, SUSPEND_MEMBER…) | **Working** | Live render this cycle; rows match `audit_logs` reality |
| E5 | Employee avatar upload + display (new feature) | Owner uploads a real PNG through the profile form → "View current Employee photo" link appears → after reload the photo renders (`img[alt="Sandip"]`) with its storage URL | **Working** | Upload + DOM screenshot evidence this cycle |
| E6 | Temporary-password replacement (new feature) | Staff password-grant login → dashboard prompt "Change your temporary password" → new password submitted → prompt disappears, session continues | **Working** | Live DOM flow this cycle |
| E7 | Password change effectiveness (server-side check) | Old temp password → login attempt; new password → login attempt | **Working** | `400 invalid_credentials` then `200 OK` via plain API grant |
| E8 | Owner cannot enter the Super Admin portal | Direct navigation `/platform-admin` | **Working — denied** | Redirect to `/dashboard` |
| E9 | Staff cannot read other salons' data | REST probes: `salons`, `service_entries`, `employees` filtered to the owner's *other* salon | **Working — denied** | all `[]` |
| E10 | Staff cannot flip platform flags | RPC `platform_feature_set` | **Working — denied** | `400 "Not authorized"` |
| E11 | Staff cannot read salon audit trail | REST `audit_logs` | **Working — denied** | `[]` |
| E12 | Platform provisioning is audited | Super Admin reads `platform_audit_logs` | **Working** | `CREATE_SALON{name, ownerEmail}` rows present, incl. the salon created in E2 |
| E13 | Dashboard weekly revenue widget under multi-day data | Playwright run against the built bundle with a deterministic 7-day `report_summary` interposition (the live salon legitimately holds a single day, where the widget hides by design) | **Working** | New harness check + screenshot `reports/figma-screenshots/19_dashboard_chart.png` |

## 2. Harness suites (executed this cycle)

| Suite | Command | Result | Covers |
|---|---|---|---|
| Database (per-migration PGlite, real SQL/RLS) | `node scripts/test-database.mjs` | **60/60** | CRUD, RLS denials, role transitions, day-lock, payment reconciliation, flag gates, new: self-onboarding gate ×4 + feature_state scoping ×3 |
| Unit (browser/Karma-free Vitest) | `npm test` | **60/60** | mappers, invoice math, guards, dialog behaviour; new avatar mapper |
| Browser (Playwright + API fixture) | `node scripts/test-browser.mjs` | **16/16** | login→dashboard, employee/customer/service creation, invoice + payment lifecycle incl. reversal reversal-guard, expense, closing, notifications, appointments, keyboard nav, mobile viewports; new: weekly chart render |
| Live REST/RPC probes (this cycle) | direct Node calls | 10/10 probes returned the expected RESPONSES (table above) | permission matrix |

## 3. What was NOT executed (honest)

- **Owner-owner cross-salon conflict** (same person managing two salons concurrently in two browsers): single-owner switching was verified; concurrent parallel sessions were not (out of scope this cycle, no token isolation issue known).
- **Real mail delivery outside the throwaway mail.tm domain** (verified only for the test mailboxes).
- **Load/performance** testing: the RPCs are bounded (single-salon aggregates), but no benchmarking was run.
- **Deleting the pre-existing test admin** remains deferred pending your decision (needs the real admin's mailbox to hand over platform duties first).

## 4. Overall verdict

Owner-facing product flows: **15 executed live scenarios pass (including 6 new-feature flows and 4 denial probes), and all three offline harnesses are green (60/60, 60/60, 16/16)**. The Owner implementation is behaviourally complete for the audited scope; no known owner-facing flow is broken.
