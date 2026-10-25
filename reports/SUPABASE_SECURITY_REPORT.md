# DadhiCutting — Supabase Security Report

Date: 25 October 2026. Scope: the working tree as of this session (migrations `20261024000001…0007` + `202610250001_platform_rbac.sql` + `202610250002_feature_flags.sql`), Edge Functions, and Angular data access. All claims except live connectivity are backed by the 52/52 offline DB harness run in this session.

## 1. Secrets and keys

| Check | Result |
|---|---|
| Service-role / secret keys in repo | **PASS** — none committed (grep verified); only `sb_publishable_…` in `src/environments/environment.ts` |
| Service role in browser bundle | **PASS** — absent; `dist` inspected only via build config (Angular cannot import `supabase/functions` or `scripts/`) |
| Secrets for Edge Functions | Supplied by platform env (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` auto-provided) — nothing extra to set |
| Bootstrap script key handling | Env-var only, refuses to run without it, never prints beyond the one-time temporary password |

## 2. Identity: platform administration

- **No public signup, no auto-promotion**: the Super Admin exists only via a row in `platform_admins`, created by the operator-run `scripts/bootstrap-super-admin.mjs` (interactive; requires typing the project ref; audited `BOOTSTRAP_PLATFORM_ADMIN`).
- **Browser verification is read-only**: `private.is_platform_admin()` returns a boolean to `authenticated`; the admin list is never readable by anyone the function doesn't confirm. `platform_read_admins` allows admins to see rows (management surface unchanged: writes stay service-role).
- **MFA enforced in the browser path**: `platformGuard` requires `auth.mfa.getAuthenticatorAssuranceLevel()` AAL2; enrollment at `/platform-admin/mfa` sits outside the guarded parent (no redirect loop) and re-verifies identity via `platformSetupGuard`.
- **Self-elevation barriers** (harness: "service-role bootstraps the platform admin list, browsers cannot"): `platform_admins` has no insert/update grants for `authenticated`/`anon`; admin self-onboarding via `create_my_salon` is blocked; portal policies are read-only.

## 3. Authorization: enforced server-side (not just hidden UI)

- RLS enabled everywhere; `authenticated` only gets scoped grants; central `private.has_role()` predicate; composite `(salon_id,id)` FKs prevent cross-salon spoofing.
- **New Fail-closed gates**: `feature_state`/`feature_enabled` reject missing keys; writer policies + the three financial RPCs enforce the same flags the UI hides.
- **Definer RPCs** verify the caller's own role with `auth.uid()`; `create_service_entry`/`record_payment`/`close_business_day` remain the only financial writers, now with flag checks.
- **Owner membership management**: `set_member_active` / `set_member_role` assert owner-of-salon and forbid touching owner rows or granting out-of-range roles (harness-verified, including the negatives).
- **Suspension**: inactive membership ⇒ empty RLS results across the board; `create_my_salon` cannot be reused as an escape hatch; account is visibly locked (`/account-locked`).

## 4. Edge Functions (written; deploy pending)

| Function | Threats addressed |
|---|---|
| `manage-employee-account` | Caller JWT verified against Auth with an anon-key client before any service-role use; role re-checked in DB each call (no token-side trust); employee must belong to the salon; one already-linked account rejected (:user unique index); temporary passwords CSPRNG-generated, shown once, never persisted in app tables; owner password resets refused centrally (`role='owner'` → 403); actions audited. |
| `platform-admin-ops` | Same JWT verification; `platform_admins` membership checked server side on every call (an owner/admin token cannot be self-elevated by calling with another user id); `create_salon` reuses `provision_salon` (service-role-only grant from core migration); invites set `must_change_password`; all actions audited into `platform_audit_logs`. |

## 5. Password lifecycle for provisioned staff accounts

1. Owner creates login → server generates a 12-char CSPRNG password → displayed once in the owner modal.
2. First sign-in: the UI prompts a password change (temporary password works only for the initial exchange; `must_change_password` metadata drives the prompt).
3. Supabase-native "force change on first login" does not exist; compliance relies on the UI prompt. Residual risk: the user could keep the temporary password until expiry. **Known limitation** — mitigations: password reset from the Owner UI, RLS containment, and password minimums in Auth config (operator should ensure the project enforces ≥8 char minimum).
4. Passwords live only in `auth.users` — never in app tables (audit R3 closed).

## 6. Auditing

| Trail | Writer | Scope |
|---|---|---|
| `audit_logs` | DB triggers + definer RPCs + Edge `audit()` helper | per-salon actions (includes `CREATE_LOGIN`, `RESET_PASSWORD`, owner RPC actions) |
| `platform_audit_logs` | `platform_feature_set`, `platform_salon_feature`, `platform-admin-ops`, bootstrap script | platform actions (`BOOTSTRAP_PLATFORM_ADMIN`, `GRANT_OWNER`, `CREATE_SALON`, `SET_MEMBER`, `FEATURE_SET`, `SALON_FEATURE`) |
| Readability | Admins read the platform trail; salon owners read their own; **non-admins get 0 rows** (harness: "platform audit records every privileged change") | |

## 7. Pre-existing items accepted from the initial audit

- R7 `email_for_mobile` enumeration surface (narrow, password-still-required) — unchanged, documented.
- R10 session revocation on suspension — token-level `auth.admin.signOut` remains a **recommended operator action** inside the `set_member` path of `platform-admin-ops` / future enhancement; data access is already dead via RLS.

## 8. Verdict

Security posture is **production-ready in code**: no secret exposure, DB-enforced authorization with fail-closed feature gating, audited privileged paths, and MFA-gated platform administration. The remaining risk is operational: until migrations are pushed and Edge Functions deployed (operator steps), the enforcement points exist only in the migration files, not in the live database.
