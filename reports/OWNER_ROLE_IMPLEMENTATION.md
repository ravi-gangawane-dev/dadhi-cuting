# DadhiCutting — Salon Owner Role: Implementation Report

Date: 27 October 2026 · Branch `main` (commits `255b2ba`, `058578f`, `7c44a47`) · Every item below was actually executed and verified; nothing in this report is aspirational.

## 1. What was implemented this cycle

The Phase-1 audit (`reports/OWNER_ROLE_INITIAL_AUDIT.md`) found one Missing and four Partial items plus one policy decision. All were addressed without duplicating any existing table, route, or RPC:

| # | Gap (from audit) | Resolution | Type |
|---|---|---|---|
| G1 | Public owner self-registration uncontrolled | New registry flag `salon_self_onboarding` (15th feature flag) + `create_my_salon` hardened to fail closed when the flag is missing/disabled; Super Admin can switch public salon creation off centrally; default preserved (`enabled`, `platform_enabled=true`) | Additive migration `202610250004_owner_role_additions.sql` |
| G2 | Multi-salon owner had no salon picker | "Your salons" section in Settings listing every membership (role, suspended state, Current/Switch), persisted per-user choice, full reload on switch | UI + store logic |
| G3 | Dashboard revenue chart missing | "Last 7 days" widget reusing the existing `app-chart-container`, fed by the existing `report_summary` RPC's `chart` series (last 7 salon dates; no new backend) | UI only |
| G4 | Employee activity-history UI missing | Owner-only "Activity history" section on the employee profile, reading the pre-existing owner-only `audit_logs` RLS grant (actions by the member + privileged actions against their employee/membership rows, newest 20) | UI + one store helper |
| G5 | Employee avatar upload missing | Reused existing `StorageService` + `app-file-upload` → `salon-private/employees/<salon>/<uuid>.png`; photo shown on the profile (fallback initials) | UI wiring of existing infra |
| G6 | Temporary-password UX (provisioned staff sign in with a one-time password) | Dashboard prompt "Change your temporary password" driven by the provisioning metadata hint `must_change_password`; password change + server-side hint clear via `auth.updateUser` | UI + AuthService helper |
| G7 | (Found during live probes) `feature_state` leaked per-salon flag metadata cross-salon | Function re-created member-scoped: members of the salon and Super Admins only; strangers get `{}` (fail closed) | Additive migration `202610250005_feature_state_scope.sql` |
| D2 | Owner granting owner-role to staff (audit said already-implemented) | Confirmed `set_member_role` (`202610250001_platform_rbac.sql`) forbids owner-role targets and touching owner memberships; no change needed | Audit correction only |

## 2. File/change map

| File | Change |
|---|---|
| `supabase/migrations/202610250004_owner_role_additions.sql` | new: gate migration (flag + hardened `create_my_salon`) |
| `supabase/migrations/202610250005_feature_state_scope.sql` | new: member-scoped `feature_state` |
| `src/app/shared/models/salon.models.ts` | new `UserMembership` model; `Employee.avatarUrl` |
| `src/app/core/services/salon-store.service.ts` | `memberships` signal, persisted active-salon choice, `switchSalon()`, `weeklyChart` signal + weekly `report()` fetch, `memberActivity()`, `memberId` captured in `memberStatuses` |
| `src/app/core/services/auth.service.ts` | `clearMustChangePassword()` |
| `src/app/core/data-access/salon-mappers.ts` | maps `avatar_url` |
| `src/app/features/settings/settings.component.ts|.html` | "Your salons" switcher |
| `src/app/features/dashboard/dashboard.component.ts|.html` | chart widget + temp-password prompt + handler |
| `src/app/features/employees/employee-profile/employee-profile.component.ts|.html` | activity history + avatar display/upload |
| `scripts/test-database.mjs` | 7 new checks (4 gate, 3 feature_state scoping) + registry count 14→15 → **60/60** |
| `scripts/test-browser.mjs` | new check "dashboard renders the last-7-days revenue trend" → **16/16** |

## 3. Verification summary (all executed)

- **Build**: `npm run build` green, no budget warning.
- **Unit tests**: `npm test` → **60/60** (42 files), including the new avatar-mapper assertion.
- **DB harness** (per-migration PGlite fixture): `node scripts/test-database.mjs` → **60/60**.
  New gate checks: self-onboarding stays available by default; Super-Admin central off; disabled lifecycle fails closed; restoring the flag re-enables. New scoping checks: member sees own salon's 15 flags; stranger probing another salon gets `{}`; platform admin still reads any salon.
- **Browser harness** (Playwright + deterministic API fixture): `node scripts/test-browser.mjs` → **16/16**, including the new multi-day revenue trend check with evidence screenshot `reports/figma-screenshots/19_dashboard_chart.png`.
- **Live production verification**: see `reports/OWNER_E2E_TEST_RESULTS.md` (recovery flow, multi-salon switching, activity history, avatar upload, temp-password change, and the full security-denial matrix). Both migrations applied to the live project with `supabase db push` (no legacy migration touched).

## 4. Honest status of this cycle

- **Working** (implemented + verified locally and live): G1 gate, G2 switcher, G3 chart widget (data path verified live from `report_summary`; visual rendering verified in the fixture harness because the live salon has only one day of data), G4 activity history, G5 avatar, G6 temp-password prompt, G7 scoping.
- **Not done on purpose**: no owner-facing coarse "permissions editor" (D3 decision from the audit — permissions stay role-based, 5 fixed roles, enforced by RLS; a per-employee permission engine was deliberately not built).
- **Known minor finding fixed**: feature_state metadata disclosure (G7). The pre-fix live probe result and the post-fix `{}` re-verification are both recorded in `reports/OWNER_RLS_SECURITY.md`.

## 5. Rebuild/duplication check

No existing table, route, component, RPC, bucket, or Edge Function was duplicated. The switcher reuses `salon_members`/`salons` reads; the chart reuses `report_summary.chart`; activity history reuses the existing `audit_logs` table + owner-only read policy; the avatar reuses the existing `StorageService`, `app-file-upload`, and storage policies; the temp-password prompt reuses `auth.updateUser`.
