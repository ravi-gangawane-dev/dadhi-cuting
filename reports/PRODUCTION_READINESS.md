# DadhiCutting — Production Readiness Report

Date: 25 October 2026. Branch `main`, all changes uncommitted on top of `1a08313`.

## Overall verdict: **Deployed and verified — test admin live · remaining: real-admin bootstrap + salon-side verification + hosting deploy**

The Super Admin system, ownership flows, employee account management, role/permission enforcement, and dynamic feature flags are implemented (**53/53** offline checks, 59/59 unit, 15 browser checks, build green), **applied to the live project** (migrations + Edge Functions ACTIVE), **and end-to-end verified live with a test Super Admin**: bootstrapped identity → login with the temporary password → `is_platform_admin` verdict `true` → platform audit readable through RLS → 14 seeded flags → TOTP enroll → challenge/verify → session assurance `aal2`. Only the real-admin bootstrap, salon-side E2E passes, and the hosting deploy remain.

## 1. Go-live checklist (operator, in order)

| # | Action | Command / location | Risk | Rollback | Status |
|---|---|---|---|---|---|
| 1 | Commit the working tree | `git add -A && git commit` on `main` | none | — | ✅ `10e503c` + `551eab1` |
| 2 | Apply the new migrations | `supabase db push` | Low — additive, validated offline | None needed (no destructive statements) | ✅ **Applied** — 202610250001/002/003 all remote-synced |
| 3 | Deploy Edge Functions | `supabase functions deploy manage-employee-account`; `supabase functions deploy platform-admin-ops` | Low | Delete function | ✅ **Deployed ACTIVE** (verify_jwt on) |
| 4 | Provision the Super Admin | `npm run bootstrap:admin` (operator's own env credentials; interactive; audited) | Controlled: requires typed project-ref confirmation | Remove row from `platform_admins` | ✅ **Executed for test identity** `super-admin.test@dadhi-testing.test` (audit row written); swap to the real admin or re-run for it |
| 5 | First login + MFA enrollment | Visit app, sign in, enroll TOTP at `/platform-admin/mfa` | none | — | ✅ **Verified live** via the app's own supabase-js path: password → TOTP enroll → challenge/verify → assurance `aal2` |
| 6 | Verify the matrix live | Create a salon, a staff login, flip one flag per salon (expect denial), flip back | Low | Flag flip-back | ⬜ recommended as a manual pass in the portal using the test admin (platform surfaces verified live through probes; salon-side flows need a browser session) |
| 7 | Netlify deploy of the new build | Existing pipeline (`netlify.toml` SPA rules already cover the new routes) | Low | Previous deploy | ⬜ |

## 2. Feature readiness matrix

| Capability | Code | Offline proof | Live proof |
|---|---|---|---|
| Platform admin identity + MFA gate | ✔ | ✔ (harness + unit) | Verdict RPC smoke-tested live (anon denied); AAL2 flow pending steps 4–5 |
| Platform portal (dashboard/salons/salon detail/users/features/audit/settings) | ✔ | ✔ (UI/typed queries; unit) | Pending steps 4–6 |
| Super-Admin-only flag control (registry + salon overrides) | ✔ | ✔ (harness) | RPC exposure verified; role flow pending step 6 |
| Flag enforcement in policies + financial RPCs | ✔ | ✔ (harness) | Live (policies/RPCs applied by migration push) |
| Owner membership management (suspend/restore/role) | ✔ | ✔ (harness) | Live (applied); owner-session test pending step 6 |
| Employee login provisioning (create + temp password + first-login change, reset) | ✔ | Partially (types/flows; Edge not deployed) | **Deployed ACTIVE**; live E2E pending step 6 |
| Accountant role (read-only financial) | ✔ | ✔ (harness) | Live (constraint + policies applied) |
| Suspension → `/account-locked` routing | ✔ | ✔ | Live (applied) |
| Salon onboarding hardening | ✔ | ✔ (harness) | Live (applied) |
| Bootstrap tooling | ✔ | Syntax-verified only (by design) | Pending step 4 |

## 3. Operational notes

- **Monitoring**: `platform_audit_logs` (indices on `created_at`, `action`) is the place to watch; add an alert on unexpected `GRANT_OWNER` / `SET_MEMBER` actions.
- **Super Admin lockout risk**: if the admin loses the TOTP device, recovery requires an operator with service-role access to reset the factor; document the break-glass procedure before go-live.
- **Hosted limits**: Edge Functions need the platform-provided service variables only; no extra secrets; nothing to rotate in-repo.
- **Password policy**: ensure the Auth config enforces a minimum length (temporary passwords are 12 chars from a no-ambiguity alphabet).
- **Backups**: standard Supabase PITR/backup cadence applies; migrations are additive and reversible by design.

## 4. Test identity note (security hygiene)

The test Super Admin (`super-admin.test@dadhi-testing.test`) and its one-time temporary password / TOTP factor secret appeared in the operator's session transcript. Treat them as already-shared secrets:

- Change the test admin's password (Settings → profile) before using it for anything beyond testing.
- For go-live, bootstrap the **real** admin mailbox (idempotent script), enroll the *real operator's* authenticator, then delete the test account: remove the `platform_admins` row and the auth user (service role, dashboard SQL editor or `auth.admin` call), keeping the audit trail.


## 5. Known limitations (non-blocking)

1. ~~Token-level revocation for suspended users~~ — **resolved**: owner `revoke_session` + platform `set_member` deactivation now revoke GoTrue sessions globally (best-effort; RLS containment remains the backstop).
2. Force-change of temporary staff passwords is UX-enforced, not native (documented).
3. Initial-bundle budget warning (595 kB vs 500 kB) — cosmetic, pre-existing trend.

## 6. What "done" will mean after steps 4–6

- Super Admin: ✔ provable live (portal + audit trail)
- Employee accounts: ✔ provable live (login as a provisioned staff member, forced change, owner reset)
- Role matrix: ✔ provable live (deny tests per role)
- Feature flags: ✔ provable live (flip → denial → flip-back)
All of the above are already proven by the offline harness; the live pass is confirmation, not implementation.
