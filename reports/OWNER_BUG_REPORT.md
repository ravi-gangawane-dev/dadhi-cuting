# DadhiCutting — Owner Bug Report

Date: 27 October 2026 · Findings collected while executing the Owner-implementation cycle. Severity: **HIGH** (breaks owners) · **MEDIUM** (wrong data/safety risk) · **LOW** (cosmetic/UX). Every entry names its fix commit or is explicitly left open.

## 1. Fixed during this cycle

| ID | Severity | Finding (observed, not assumed) | Fix & verification |
|---|---|---|---|
| B-1 | **MEDIUM** | `feature_state(p_salon)` exposed any salon's feature metadata (labels, lifecycle, per-salon overrides) to any authenticated session asking with a foreign salon UUID | Fixed in `202610250005_feature_state_scope.sql` (member-or-platform-admin only, else `{}`); live probe re-run: stranger → `{}`, member → 15; harness 60/60 |
| B-2 | LOW→now Working | Owner self-onboarding ran from any fresh account with no central kill-switch | Registry gate `salon_self_onboarding` (enabled by default per product) with fail-closed behaviour; harness 4 checks; live registry verified |
| B-3 | LOW | Multi-salon owners silently got `created_at`-first salon with no way to change it | Switcher shipped (`Settings → Your salons`, persisted choice); live-verified both directions + reload |
| B-4 | LOW | Dashboard revenue chart absent | "Last 7 days" widget shipped, verified rendering with multi-day data (screenshot evidence); hides with single-day data by design (not a bug — empty-state honesty) |
| B-5 | LOW | Provisioned staff had no guided first-password change | Dashboard prompt shipped; live flow + server-side old/new password probes passed |

## 2. Open items (intentionally not fixed in this cycle)

| ID | Severity | Finding | Why open |
|---|---|---|---|
| O-1 | LOW | Activity history shows the newest 20 rows only (design limit, no pagination) | Owner-facing trail is a summary; full trail remains queryable in `audit_logs`. If you want it, pagination is a small follow-up. |
| O-2 | LOW | Employee photo upload needs a page refresh before the header image swaps (employee list is not live-listened) | Cosmetic; mapper + storage verified. Realtime channel could remove it. |
| O-3 | INFO | Playwright fixture `report_summary` returns a one-point chart from inherently single-day fixture data, so the dashboard widget relies on the dedicated interposition check for visual coverage | Documented; the interposition check (new) covers the visual path deterministically |
| O-4 | MEDIUM (process) | The vendor "test admin" (`super-admin.test@…`) still holds Super Admin rights on the production project, and the handover bootstrap to the real admin's mailbox hasn't run (`npm run bootstrap:admin`) — **needs explicit authorization + the real admin's mailbox** | Awaiting user instruction; deletion/transfer deferred since handover must precede it. Unrelated to owner-role code. |
| O-5 | LOW | Weekly chart semantics follow `report_summary`'s calendar-date aggregation; salons whose timezone-specific overnight business makes "day" ambiguous continue to use the RPC's definition | Consistency with the Reports module is intentional; no change without a data decision |

## 3. Not reproducible / no bug

- Reports of "duplicate provisioning" were re-tested idempotency paths (harness + live `create_salon` re-run with an existing owner) — behaviour correct, no duplicates.
- Auth error surfaces, suspension messages, and redirect loops from the prior cycle did not regress (browser suite 16/16 includes the guard checks).

## 4. Bug budget

**Open product bugs affecting owners: 0 HIGH, 0 MEDIUM (product), 4 LOW/INFO (O-1/O-2/O-3/O-5 cosmetic-by-design), plus 1 open operational item (O-4) that requires your explicit authorization.** The single MEDIUM security finding (B-1) is fixed, regression-tested, and live-verified.
