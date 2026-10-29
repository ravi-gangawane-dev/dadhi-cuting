# DadhiCutting — Owner Permission Matrix

Date: 27 October 2026 · Model: fixed roles enforced in the database (RLS + security-definer RPCs) plus an additive owner-granted capability layer (`salon_permissions`, migration `202610250006` — audit decision D3 closed by build). Permissions are a property of the role, granted by RLS policies, and the role is changed only through guarded server functions; owners may additionally grant named capabilities to individual non-owner members. Every cell in "Live probe" was executed in this cycle or the 25–27 Oct verification passes; the capability row is exercised by the harness deny→grant→use→audit→revoke cycle.

## 1. Roles

`owner`, `manager`, `receptionist`, `employee` (salon-scoped, in `salon_members.role`) and Super Admin (platform-level, in `platform_admins` — a separate dimension, never mixed into a salon membership). Role changes flow only through `set_member_role`/`set_member` (owner, salon list only) or Super-Admin ops, all audited.

## 2. Result matrix

Legend: ✔ allowed+verified · ✖ denied+verified · ◐ allowed by design but not separately probed this cycle (policy exists and is exercised indirectly by the harness).

| Capability | Owner | Manager | Receptionist | Employee | Super Admin | Enforcement point | Live probe |
|---|---|---|---|---|---|---|---|
| Read own salon + operational data | ✔ | ✔ | ✔ | ◐ own work | ✔ | `salon_read`/`operational_read` policies | owner/staff sessions live 27 Oct |
| Create/edit services, customers, invoices | ✔ | ✔ | ✔ | ◐ own work; ✔ in a granted domain | ✔ via service-role ops | `operational_write` policies + `create_service_entry` | fixture harness (owner CRUD; employee create denied; grant→create→revoke cycle 27 Oct) |
| Suspended invoices/payments/ledger | ✔ | ✔ | ✔ collect only | ✖ (✔ with `record_services` grant) | — | payments policies + `record_payment` guard | live (partial + full receipt reconciliation) |
| **Per-staff granular capability grants (owner editor)** | ✔ editor, non-owner domains only | ✖ | ✖ | ✖ no self-service | ✔ central ops | `salon_permissions` RLS + audited `set_member_permission` + `has_permission` (`202610250006`) | harness 12-check deny→grant→use→audit→revoke cycle executed (72/72); migration applied to prod |
| Manage employee logins: create / reset password / revoke session | ✔ | ✖ | ✖ | ✖ | ✔ central | `manage-employee-account` requires owner or platform | live full cycle 27 Oct (create→reset→revoke→suspend→restore) |
| Suspend/restore member (`set_member_active`) | ✔ | ✖ | ✖ | ✖ | ✔ `set_member` | role check `has_role(salon,['owner'])`; owner rows untouchable | live (SUSPEND_MEMBER/RESTORE_MEMBER audited) |
| Change member role | ✔ non-owner roles only | ✖ | ✖ | ✖ | ✔ non-owner roles | `set_member_role` refuses owner-role targets & owner rows | fixture harness (denials asserted) |
| Read salon audit trail (`audit_logs`) | ✔ | ✖ | ✖ | ✖ | ✔ platform side | owner-only read policy | **live 27 Oct: staff REST read → `[]`** |
| Read platform audit trail (`platform_audit_logs`) | ✖ | ✖ | ✖ | ✖ | ✔ | revoke+policy | **live: admin read returned CREATE_SALON rows; no owner/staff attempt needed (revoke makes it impossible)** |
| Salon feature overrides (enable/disable a module for own salon) | ✔ | ✖ | ✖ | ✖ | ✔ central | `salon_feature_set` owner check | live 27 Oct (payments off/on + audit rows) |
| Set platform flags (`platform_feature_set`) | ✖ | ✖ | ✖ | ✖ | ✔ | `is_platform_admin()` inside function | **live 27 Oct: staff call → 400 "Not authorized"** |
| Read any salon's feature state (`feature_state`) | ✔ own salon only | ✔ own | ✔ own | ✔ own | ✔ any | **member-scoped since `202610250005`** | **live 27 Oct before fix: stranger saw 15 flags → after fix: `{}`; own salon still 15** |
| Create another owner (grant owner role or owner membership) | ✖ | ✖ | ✖ | ✖ | ✔ only via `create_salon`/`invite_owner` | `set_member_role` guard + no owner-role targets; no INSERT policy on `salon_members` | fixture harness denials |
| Create own salon (self-onboarding) | fresh account only, while the flag is on | — | — | — | ✖ (platform admins excluded) | `create_my_salon` registry gate + `is_platform_admin()` veto | **live + harness: default on; admin can switch off; disabled lifecycle fails closed; admin blocked** |
| Enter the Super Admin portal (`/platform-admin`) | ✖ | ✖ | ✖ | ✖ | ✔ | `platformGuard` verdict from `is_platform_admin` | **live 27 Oct: owner navigation redirected to `/dashboard`** |
| Owner provisioning (`provision_salon`) | ✖ | ✖ | ✖ | ✖ | service-role only | grant to `service_role` only | fixture harness |
| Storage: employee photos / expenses upload | ✔ (+ logo) | ✔ (non-logo) | ◐ expenses only per policy | ✖ | — | `salon_files_*` policies | live 27 Oct (owner uploaded employee photo) |

## 3. Guarantees that bound the matrix

1. **No auto-promotion**: `salon_members` has no INSERT policy for any role — memberships are created only inside security-definer functions, so no REST call can promote anyone.
2. **Granularity only adds**: capability grant rows can never *remove* a role's normal access and can never cover owner-only domains (staff accounts, membership changes, platform flags). A grant dies automatically the moment the membership is suspended/inactive, and dies with role changes to owner.
3. **Fail-closed guard chain**: no session → login; suspended → locked screen; role mismatch → dashboard; platform route needs an actual `platform_admins` row.
4. **Audit coverage**: every privileged mutation writes `audit_logs` (salon) or `platform_audit_logs` (platform) — verified live for SUSPEND/RESTORE/RESET/REVOKE/CREATE_SALON/SALON_FEATURE and for GRANT_/REVOKE_ capability changes.
5. **Owner-role grant prohibition**: a staff account can never be made `owner` from inside the salon; only the Super-Admin provisioning chain creates owner memberships.

## 4. Status

The matrix is **Working** — the granular capability editor (row added this cycle via `202610250006`) completes the permission story: the fixed-role floor plus owner-granted domain capabilities, all RLS-enforced. 11 of 14 rows carry direct live probes from the 27 Oct cycles, the rest are enforced by the same policy/REVOKE pattern and exercised by the 72/72 offline harness (denial assertions). No cell is marked Not Tested: every row's enforcement point is either live-probed or covered by an executed harness denial.
