# DadhiCutting — Role & Permission Matrix (target state after migration A/B)

Date: 25 October 2026. Every cell marked **DB** is enforced server-side by RLS policies or definer RPC logic — not by hidden navigation. Feature-flag column applies as an additional gate.

## Expected users

| Role | Who holds it |
|---|---|
| Platform Admin (Super Admin) | Only users with a row in `platform_admins`, created exclusively by the operator bootstrap script (`npm run bootstrap:admin`). No public registration, no auto-promotion; platform permission requires MFA (AAL2 + TOTP). |
| owner | App-account creator of a salon (self-serve onboarding) or a Super-Admin invitation (Edge Function `platform-admin-ops/invite_owner`). |
| manager, receptionist | Assigned by the salon owner (`set_member_role`), or pre-provisioned with the login created for a staff member. |
| accountant | **New role** (migration A). Read-only financial visibility, assigned via `set_member_role`. |
| employee | Staff record with a login provisioned through `manage-employee-account` (never self-registered). |

> owner/manager/receptionist/employee/accountant live in `salon_members.role` (CHECK constraint extended in migration A). Platform Admin lives in a separate table, not in `salon_members`.

## Route / capability matrix

Legend: ✔ allowed · ✖ denied · ✖✧ UI hidden (same DB verdict) · 🚩 additionally blocked unless the feature key is `available` in `feature_state`

| Capability (route → feature key) | Platform Admin | owner | manager | receptionist | accountant | employee | DB enforcement |
|---|---|---|---|---|---|---|---|
| `/platform-admin` portal | ✔ after MFA | ✖ | ✖ | ✖ | ✖ | ✖ | `platform_read_*` policies + `platformGuard` (AAL2) |
| `/platform-admin/mfa` enrollment | Setup guard only | ✖ | ✖ | ✖ | ✖ | ✖ | AAL check in `platformSetupGuard`; portal still closed |
| `/account-locked` | n/a | ✔ (only when suspended) | ✔ (suspended) | ✔ (suspended) | ✔ (suspended) | ✔ (suspended) | Store routes on inactive membership; RLS already returns empty sets |
| dashboard → `dashboard` | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ | `report_summary` invoker-rights → RLS |
| customers list/profile → `customers` | ✖ | ✔ 🚩 | ✔ 🚩 | ✔ 🚩 | ✖ | ✖ | `customers` policies role list |
| employees (staff CRUD) → `employees` | ✖ | ✔ 🚩 | ✔ 🚩 | ✖ | ✖ | ✔ own-row 🚩 | `operational_*` roles for writes |
| employee **login** management | ✖ own portal instead | ✔ | ✖ | ✖ | ✖ | ✖ | Edge Function verifies owner-of-salon server side |
| staff record suspend/restore | ✔ via portal | ✔ (`set_member_active`) | ✖ | ✖ | ✖ | ✖ | definer RPC rejects non-owners and owner targets |
| membership role changes | ✔ via portal | ✔ (`set_member_role`; target roles limited to manager/receptionist/employee/accountant) | ✖ | ✖ | ✖ | ✖ | definer RPC |
| services catalog + new entry → `services` | ✖ | ✔ 🚩 (+managers/receptionist) | ✔ 🚩 | ✔ 🚩 | ✖ | ✔ catalog read-only 🚩 | `create_service_entry` RPC allows o/m/r; flag check inside RPC |
| collect payment / payments ledger → `payments` | ✖ | ✔ 🚩 | ✔ 🚩 | ✔ 🚩 | ✖ | ✖ | `record_payment` RPC + `payments` flag check |
| payment void / invoice void | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | `void_payment`/`void_service_entry` RPCs (unchanged) |
| expenses → `expenses` | ✖ | ✔ 🚩 | ✔ 🚩 | ✖ | ✔ **read-only** 🚩 | ✖ | `accountant_read_*` policies (no insert/update grants) |
| expense CRUD | ✖ | ✔ 🚩 | ✔ 🚩 | ✖ | ✖ | ✖ | writer policies with flag check |
| daily closing → `daily_closing` | ✖ | ✔ 🚩 | ✔ 🚩 | ✖ | ✖ | ✖ | `close_business_day` RPC + flag check; day-lock still governs |
| reports → `reports` | ✖ | ✔ 🚩 | ✔ 🚩 | ✖ (no API gap vs UI in target state? see note) | ✔ 🚩 (new) | ✖ | role list extended in route data; financial reads via `accountant_read_*` |
| salon profile settings | ✖ | ✔ | ✖ | ✖ | ✖ | ✖ | owner-only update policy |
| self-onboarding (`create_my_salon`) | ✖ (blocked in RPC) | ✔ (first salon only) | ✖ (already has membership) | ✖ | ✖ | ✖ | hardened RPC rejects any existing membership and admins |
| signup (owner path) | ✖ (admins already have memberships) | ✔ | ✖ | ✖ | ✖ | ✖ | signup is the owner onboarding path, never an employee path |

Note on `reports`: pre-migration the API allowed receptionist reads of financial tables while the UI hid the route; in the target matrix the route declares `roles:['owner','manager','accountant']`, and DB reads of payments/entries remain governed by the existing (and new accountant) read policies. The receptionist alignment is therefore **UI-enforced route + unchanged DB reads**, matching the original audit note; no regression was introduced either way.

## Feature-flag dimension (Super Admin controls; owners observe)

| Flag key | Lifecycle | Platform available | Salon override scope |
|---|---|---|---|
| dashboard, customers, employees, services, payments, expenses, daily_closing, reports, appointments | enabled | true | deny-only (owner cannot re-enable a platform-disabled flag) |
| inventory, whatsapp_notifications, memberships, loyalty, multi_branch | planned | false | no effect until Super Admin enables platform availability |

Evaluation order (`feature_state(p_salon)`): registry lifecycle ∈ {enabled, beta} **AND** platform_enabled **AND** salon override (default true). Unknown/missing key ⇒ **false** (fail closed). Server enforcement points: `create_service_entry`, `record_payment`, `close_business_day`, and writer policies on customers/employees/services/service_categories/expense_categories/expenses/appointments.

## Cross-cutting rules

- A Platform Admin never receives salon business privileges through the portal policies — read/inspect only, zero writes, zero financial RPC access.
- An owner-user **may** also hold platform admin status (the two lists are independent); the guard routes such a user to the platform portal when the verdict is true and AAL2 is met.
- Membership suspension (`salon_members.active=false`) ends all data access immediately via RLS regardless of role; `create_my_salon` cannot be used to escape it, and `loadMemberStatuses` lets owners see the status in the UI (they cannot change their own).
