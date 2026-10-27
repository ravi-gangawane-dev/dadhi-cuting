# DadhiCutting — Owner RLS & Security Report

Date: 27 October 2026 · Method: policy inspection per migration + **executed live probes** (REST/RPC/router) this cycle. Denials below were not assumed — each was sent to the production project and the response recorded.

## 1. Data-plane isolation (row level security)

| Probe (executed live) | Result | Verdict |
|---|---|---|
| Staff session → REST `salons?id=eq.<owner's other salon>` | `[]` | ✅ salon row hidden (`salon_read` policy) |
| Staff session → REST `service_entries?salon_id=eq.<other salon>` | `[]` | ✅ operational data hidden |
| Staff session → REST `employees?salon_id=eq.<other salon>` | `[]` | ✅ staff records hidden |
| Staff session → RPC `feature_state(<other salon>)` | `{}` | ✅ metadata hidden after `202610250005` (before the fix this returned 15 flag entries — found and closed; see §3) |
| Staff session → RPC `feature_state(<own salon>)` | 15 keys | ✅ members unaffected by hardening |
| Staff session → REST `audit_logs?select=…` | `[]` | ✅ audit trail is owner-only |
| Owner session → REST reads of both owned salons | both visible | ✅ multi-salon reads legitimately work (switcher depends on it) |

Structural guarantees behind these results:

- Every operational table filters `salon_id` through `private.has_role(salon_id, …)` (active membership required; suspended accounts exist but `has_role` requires `active`).
- `salon_members` has **no INSERT policy**: promotions/membership creation only via security-definer functions (`provision_salon` service-role-only, `create_my_salon` gated, `platform-admin-ops` Super-Admin-only).
- `set_member_role` refuses owner-role targets and refuses to touch owner rows — used as the promotion blocker.
- Suspended members: `has_role` false → all salon data vanishes at the row level *even before* the route guard reacts.

## 2. Function/route-plane authorization

| Probe (executed live) | Result | Verdict |
|---|---|---|
| Owner browser navigation → `/platform-admin` | redirected to `/dashboard` | ✅ `platformGuard` fail-closed |
| Staff → RPC `platform_feature_set(salon_self_onboarding,false)` | `400 P0001 "Not authorized"` | ✅ super-admin-only setter |
| Super Admin → `platform_audit_logs` REST | full rows incl. `CREATE_SALON{name, ownerEmail}` of the salon created this cycle | ✅ auditable provisioning; REVOKE keeps everyone else out |
| Super Admin → `create_salon(email of existing owner)` | idempotent resolve, no duplicate auth user, second owner membership + audit | ✅ no account duplication path |
| `create_my_salon` under flag off / lifecycle `disabled` / missing row | exception (fail closed), incl. anonymous callers | ✅ harness-denied 5 ways; anon always denied (`grant execute` to `authenticated` only) |
| Platform-admin account attempting `create_my_salon` | refused ("Platform administrators do not own salons") | ✅ privilege containment |

## 3. Finding & fix this cycle

**F-1 — `feature_state` metadata disclosure (LOW→fixed).** The function was a plain registry/override lookup grantable by any `authenticated` session for *any* salon UUID, exposing module labels, lifecycles, and per-salon override state cross-salon. Measured live before the fix (stranger → 15 entries). Closed with additive migration `202610250005_feature_state_scope.sql`: the function now returns `'{}'` unless the caller is an active member of that salon or a platform admin. Re-verified live post-fix (stranger → `{}`, member → 15, admin → 15; harness 60/60 includes all three). **No open data-plane findings remain from this cycle's probes.**

## 4. Attack-surface notes (inspected, not exploitable)

- OAuth/recovery deep links are consumed only via the configured allow-listed redirect origins (`supabase/config.toml` site URL + redirect URLs — corrected in an earlier cycle and re-verified by the successful recovery E2E).
- Storage: private bucket; read policy = owner/manager of the owning salon; upload/delete role-differentiated; upload type/size checks duplicated client-side (magic-byte sniffing) — defense in depth, not a policy substitute.
- Edge Functions validate the caller's role server-side on every action; they never trust the client payload's user/salon IDs for authorization decisions.
- No private keys, service-role tokens, or personal data exist in the SPA bundle or reports.

## 5. Status

Data isolation, function authorization, and provisioning governance are all **Working** and live-probed. The single security finding of the cycle is fixed and regression-locked by the harness (60/60). Remaining honest limitation: this report covers the Owner threat model; a dedicated pen-test (credential stuffing, rate-limit checks at the Auth edge) is **Not Tested** here because it is outside what could be executed against the shared test project without platform-settings changes.
