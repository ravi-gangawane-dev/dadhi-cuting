# DadhiCutting — Production Readiness Report

Date: 25 October 2026. Branch `main`, all changes uncommitted on top of `1a08313`.

## Overall verdict: **Code-ready · Deployment BLOCKED on explicit operator approval**

The Super Admin system, ownership flows, employee account management, role/permission enforcement, and dynamic feature flags are implemented and fully verified offline (52/52 DB checks, 59/59 unit, 15 browser checks, build green). Nothing has been pushed to the hosted Supabase project: every live-environment operation requires the operator's credentials and explicit approval, and cannot be performed by the agent.

## 1. Go-live checklist (operator, in order)

| # | Action | Command / location | Risk | Rollback |
|---|---|---|---|---|
| 1 | Commit the working tree | `git add -A && git commit` on `main` | none | — |
| 2 | Apply the two new migrations | `supabase db push` or SQL editor: `202610250001_platform_rbac.sql`, `202610250002_feature_flags.sql` | Low — both additive; CHECK extension validated offline | Drop-safety: no destructive statements; feature RPC rewrites are `create or replace` |
| 3 | Deploy Edge Functions | `supabase functions deploy manage-employee-account`; `supabase functions deploy platform-admin-ops` | Low — callers verified against DB before service-role use | Delete function (browser then surfaces a clean error) |
| 4 | Provision the Super Admin | `npm run bootstrap:admin` (operator's own env credentials; interactive; audited) | Controlled: requires typed project-ref confirmation | Remove row from `platform_admins` (writes stay service-role even later) |
| 5 | First login + MFA enrollment | Visit app, sign in, enroll TOTP at `/platform-admin/mfa` | none | — |
| 6 | Verify the matrix live | Create a salon, a staff login, flip one flag per salon (expect denial), flip back | Low | Flag flip-back |
| 7 | Netlify deploy of the new build | Existing pipeline (`netlify.toml` SPA rules already cover the new routes) | Low | Previous deploy |

## 2. Feature readiness matrix

| Capability | Code | Offline proof | Live proof |
|---|---|---|---|
| Platform admin identity + MFA gate | ✔ | ✔ (harness + unit) | Pending steps 4–5 |
| Platform portal (dashboard/salons/salon detail/users/features/audit/settings) | ✔ | ✔ (UI/typed queries; unit) | Pending step 6 |
| Super-Admin-only flag control (registry + salon overrides) | ✔ | ✔ (harness) | Pending step 6 |
| Flag enforcement in policies + financial RPCs | ✔ | ✔ (harness) | Pending step 2 |
| Owner membership management (suspend/restore/role) | ✔ | ✔ (harness) | Pending step 2 |
| Employee login provisioning (create + temp password + first-login change, reset) | ✔ | Partially (types/flows; Edge not deployed) | Pending step 3 |
| Accountant role (read-only financial) | ✔ | ✔ (harness) | Pending step 2 |
| Suspension → `/account-locked` routing | ✔ | ✔ | Pending step 2 |
| Salon onboarding hardening | ✔ | ✔ (harness) | Pending step 2 |
| Bootstrap tooling | ✔ | Syntax-verified only (by design) | Pending step 4 |

## 3. Operational notes

- **Monitoring**: `platform_audit_logs` (indices on `created_at`, `action`) is the place to watch; add an alert on unexpected `GRANT_OWNER` / `SET_MEMBER` actions.
- **Super Admin lockout risk**: if the admin loses the TOTP device, recovery requires an operator with service-role access to reset the factor; document the break-glass procedure before go-live.
- **Hosted limits**: Edge Functions need the platform-provided service variables only; no extra secrets; nothing to rotate in-repo.
- **Password policy**: ensure the Auth config enforces a minimum length (temporary passwords are 12 chars from a no-ambiguity alphabet).
- **Backups**: standard Supabase PITR/backup cadence applies; migrations are additive and reversible by design.

## 4. Known limitations (non-blocking)

1. Token-level revocation for suspended users is not yet `auth.admin.signOut`-wired (RLS containment covers data; see `SUPABASE_SECURITY_REPORT.md` §7).
2. Force-change of temporary staff passwords is UX-enforced, not native (documented).
3. Initial-bundle budget warning (595 kB vs 500 kB) — cosmetic, pre-existing trend.

## 5. What "done" will mean after step 6

- Super Admin: ✔ provable live (portal + audit trail)
- Employee accounts: ✔ provable live (login as a provisioned staff member, forced change, owner reset)
- Role matrix: ✔ provable live (deny tests per role)
- Feature flags: ✔ provable live (flip → denial → flip-back)
All of the above are already proven by the offline harness; the live pass is confirmation, not implementation.
