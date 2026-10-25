# DadhiCutting — Feature Flag Report

Date: 25 October 2026. Implementation lives in `supabase/migrations/202610250002_feature_flags.sql` (database) + `FeatureAccessService`, `featureGuard`, portal `platform-features` / `platform-salon-detail` (client). Evidence: 52/52 DB harness checks including the 18 new RBAC/flag checks; browser fixture serves the same contract.

## 1. Registry (seeded 14 keys)

| Key | Label | Lifecycle | Platform available | Enforced by |
|---|---|---|---|---|
| `dashboard` | Dashboard | enabled | true | (aggregate UI; `report_summary` under RLS) |
| `customers` | Customers | enabled | true | writer policies on `customers` |
| `employees` | Employees | enabled | true | writer policies on `employees` (+ login management Edge path unaffected) |
| `services` | Services | enabled | true | writer policies on `services`/`service_categories` + `create_service_entry` |
| `payments` | Payments | enabled | true | `record_payment` |
| `expenses` | Expenses | enabled | true | writer policies on `expenses`/`expense_categories` |
| `daily_closing` | Daily Closing | enabled | true | `close_business_day` |
| `reports` | Reports | enabled | true | route guard (aggregates flow through RLS) |
| `appointments` | Appointments | enabled | true | writer policies on `appointments` |
| `inventory` | Inventory | planned | false | not reachable |
| `whatsapp_notifications` | WhatsApp Notifications | planned | false | not reachable |
| `memberships` | Memberships | planned | false | not reachable |
| `loyalty` | Loyalty | planned | false | not reachable |
| `multi_branch` | Multi-Branch | planned | false | not reachable |

## 2. Evaluation semantics (server-authoritative)

```
feature_state(p_salon) = for each registry row:
  overview = { lifecycle, platform_enabled, entitled: salon override?, available }
  available = (lifecycle IN ('enabled','beta'))
              AND platform_enabled
              AND coalesce(override.enabled, true)
```
- Unknown key or missing registry row ⇒ **false** (fail closed).
- The client never decides; `FeatureAccessService` only renders the server map and records `lastDenied` for the dashboard banner.
- Salon owners and all salon roles get **read-only** state; `platform_salon_feature` / `platform_feature_set` re-verify `private.is_platform_admin()` server side and write to `platform_audit_logs` (`FEATURE_SET` / `SALON_FEATURE`).

## 3. Enforcement points

| Layer | Point | Behaviour when flag not available |
|---|---|---|
| Database | writer policies (customers, employees, services, service_categories, expense_categories, expenses, appointments) | INSERT/UPDATE/DELETE rejected (0 affected rows) |
| Database | `create_service_entry` | Raises "…unavailable for this salon" — invoice cannot be recorded |
| Database | `record_payment` | Raises — no receipt can be taken |
| Database | `close_business_day` | Raises — day cannot be closed |
| Angular | `featureGuard` on 13 routes | Redirect to `/dashboard` + `lastDenied` banner |
| Angular | bottom nav / more-menu | Item hidden (`available === false`) |
| Angular | financial UI paths behind guards | Denied before any call (belt) |

Harness proof points: "disabling a salon entitlement is enforced by policies and RPCs", "payments flag gates receipt recording; re-enabling restores it", "owner observes (not controls) a disabled feature", "salon entitlement overrides cannot exceed platform availability", "lifecycle day-lock still governs closing after flag changes".

## 4. Platform admin UX

- `platform-features` screen edits lifecycle (`planned|beta|enabled|disabled|deprecated`) and platform availability per key with live re-read after save.
- `platform-salon-detail` screen sets/clears per-salon overrides (`enabled = null` clears).
- Audit actions visible in `platform-audit` (`FEATURE_SET`, `SALON_FEATURE`).

## 5. Status

| Aspect | Status |
|---|---|
| Database registry + overrides + state function | **Working** (harness) |
| RPC enforcement in financial workflows | **Working** (harness) |
| Policy enforcement on writer tables | **Working** (harness) |
| Portal editors | **Working** (UI); live write path after migrations push — recommended verification |
| Nav hiding & denial banner | **Working** (browser fixture) |
| Live-project flag switch E2E | **Not Tested** — operator applies migrations first |

## 6. Notes

- Launching a planned feature for production = Super Admin flips `platform_enabled` (and lifecycle `planned → enabled`), then any salon override as needed. No code deploy required.
- Rollback = disable platform availability: every dependent RPC/policy rejects immediately, and the UI hides the surface on next load.
