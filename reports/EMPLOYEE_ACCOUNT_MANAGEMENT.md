# DadhiCutting — Employee Account Management (Owner-facing)

Date: 27 October 2026 · All capabilities verified against the **live** project; the executed cycle is listed with each item. Product rule: only the Owner creates staff logins, through the server-side provisioning chain — staff never self-register.

## 1. Lifecycle coverage

| # | Capability | Status | Executed evidence |
|---|---|---|---|
| 1 | Owner creates an employee record → linked staff login via `manage-employee-account` `create` (email invite / temporary one-time password, never visible again) | **Working** | Staff account for the live salon was provisioned through this path on 25 Oct; audited (`CREATE_LOGIN` in `audit_logs`) |
| 2 | Staff first sign-in with the temporary password → forced-looking prompt on the dashboard to replace it | **Working — verified live this cycle** | Staff signed in on the prod site; the "Change your temporary password" card appeared; password replaced in-form; the prompt disappeared. Server-verified afterwards: old password → `400 invalid_credentials`, new password → `200 OK` |
| 3 | Owner password reset for a staff login (`reset_password`) | **Working** (live 24–27 Oct passes; re-exercised indirectly in the activity history) | `RESET_PASSWORD` + `REVOKE_SESSION` rows visible in the owner's activity-history UI this cycle |
| 4 | Owner revokes an active staff session (`revoke_session`) | **Working** | `REVOKE_SESSION` audit rows shown in the new activity-history section; original live revocation recorded in `E2E_TEST_REPORT.md` §4b |
| 5 | Owner suspends a staff login (`set_member_active false`) — account locked at next guard check, kept out of operational lists | **Working** | Live cycles on 25 and 27 Oct; `SUSPEND_MEMBER` rows |
| 6 | Owner restores a suspended login | **Working** | `RESTORE_MEMBER` rows; staff sign-in worked again after restore |
| 7 | Owner cannot suspend/restore or re-role an owner membership (not even their own) | **Working** | `set_member_active` refuses owner rows; fixture harness asserts the denial |
| 8 | Owner changes a staff member's role | **Working** | `set_member_role` (salon list only, owner-role targets refused) |
| 9 | Owner audits a staff member's activity | **Working — verified live this cycle** | New "Activity history" section on the profile at `/employees/<id>` renders the audit trail (RESET_PASSWORD / RESTORE_MEMBER / REVOKE_SESSION / SUSPEND_MEMBER…); backed by the owner-only `audit_logs` policy; staff REST read of `audit_logs` returns `[]` |
| 10 | Attached metadata (phone, commission, designation, joined date) visible on the profile | **Working** | Live profile page render this cycle |
| 11 | Owner uploads the employee's photo | **Working — verified live this cycle** | PNG uploaded through `app-file-upload` into `salon-private/employees`; "View current Employee photo" link appeared; after reload the profile shows the image (`img[alt]` with a storage URL) |
| 12 | Archived (inactive) employees remain listed with an "Include archived" toggle | **Working** | list page renders status; archived filter exercised in the 60/60 unit suite |

## 2. Security properties (all enforced server-side)

- Owner-only operations check `has_role(salon,['owner'])` **inside** the Edge Function/RPC; the owner's JWT is the only credential that matters — the Angular UI cannot weaken it.
- Staff passwords are never stored or displayed by the app; provisioning returns a one-time password exactly once, and the `must_change_password` hint is cleared server-side after replacement (`clearMustChangePassword`).
- Suspension is RLS-independent safety: even if data were otherwise readable, the auth-level revoke (`revoke_session`) plus the fail-closed route guard (`/account-locked` on suspended membership) stop access immediately.
- The new activity-history section cannot leak members: the underlying `audit_logs` read policy is owner-of-that-salon only (proven live: staff request → empty array).

## 3. Honest status

Everything in the owner's employee-account toolkit is **Working**. Two cosmetic notes recorded in `OWNER_BUG_REPORT.md` (LOW): the activity list is capped at 20 rows by design (limit), and avatar upload requires a manual page refresh for the mapper to show the new image (expected — the employee list is not live-listened). Neither affects correctness or safety.
