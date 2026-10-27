# DadhiCutting — Owner API Integration Report

Date: 27 October 2026 · Documents every backend API the Owner-facing app integrates with, with the actual executed request shapes. "Live" = executed against `https://...supabase.co` this cycle or in the 25–27 Oct passes; "Harness" = executed in the deterministic offline fixture.

## 1. Integration surface

| API | Transport | Used by | Status | Evidence |
|---|---|---|---|---|
| Supabase Auth (`/auth/v1/token?grant_type=password`, `/recover`, `/verify`, `/logout`, `updateUser({password})`, `updateUser({data})`) | HTTPS + `supabase-js` | login, recovery, logout, dashboard temp-password prompt | **Working (live)** | Password grant + recovery executed this cycle; old/new password probes returned `400`/`200` |
| `salon_members` / `salons` REST (RLS) | PostgREST | store topology, memberships, switchSalon | **Working (live)** | double-membership owner listed both salons; staff cross-salon reads → `[]` |
| RPC `create_my_salon(name)` | PostgREST | onboarding | **Working (live+harness)** | gated by `salon_self_onboarding`; live registry row present; 4 harness checks incl. admin-central-disable |
| RPC `report_summary(salon,from,to)` | PostgREST | dashboard today + weekly widget, reports | **Working (live+harness)** | live `chart` series consumed by the new widget; single-RPC bounded fetch, no client aggregation |
| RPC `feature_state(salon)` | PostgREST | guards, feature pages | **Working (live, hardened this cycle)** | stranger probe returned `{}` after `202610250005`; own salon 15 keys |
| RPC `is_platform_admin()` | PostgREST | platformGuard | **Working (live)** | owner nav → `/dashboard` redirect |
| RPC `set_member_active` / `set_member_role` | PostgREST | staff management | **Working (harness+live history)** | audit actions visible in activity history |
| RPC `salon_feature_set` / `platform_feature_set` | PostgREST | owner / Super Admin | **Working (live)** | SALON_FEATURE audit rows; staff denial → 400 "Not authorized" |
| Edge Function `manage-employee-account` (`create`/`reset_password`/`revoke_session`) | HTTPS, owner-JWT-authorized, CORS allowlist | staff account management | **Working (live)** | full cycle + `CREATE_LOGIN` etc. in `platform_audit_logs`/`audit_logs` |
| Edge Function `platform-admin-ops` (`create_salon`/`invite_owner`/`set_member`/flag ops) | HTTPS, Super-Admin-only, CORS allowlist | provisioning | **Working (live)** | this cycle: `create_salon` with an existing owner email resolved idempotently, produced the second membership, and wrote the `CREATE_SALON` platform-audit row |
| Storage `salon-private` (upload/show) | Storage API + RLS policies | salon logo, employee photos, expenses | **Working (live)** | 70-byte PNG → storage object; public URL renders after signed retrieval; folder policy enforced |
| `user_profiles` REST | PostgREST | settings profile | **Working (harness+live)** | prior passes |
| `audit_logs` REST (owner-only read) | PostgREST | activity history | **Working (live)** | owner sees trail; staff → `[]` |

## 2. CORS / origins

Edge Functions serve explicit `Access-Control-Allow-Origin` reflection limited to `https://dadhi-cuting.netlify.app` and `http://localhost:4200`. Live function calls this cycle were made from the production origin and passed preflight — no wildcard exposure found.

## 3. Failure behaviour observed

- Denials surface as PostgREST `400` with `P0001 … "Not authorized"` (as-designed; the app maps exceptions to readable toasts).
- Cross-salon REST reads do not error — they return empty sets (RLS row-filtering), which the store treats as "not your salon"; the switcher only offers memberships the API returned, so cross-tenant leakage cannot reach the UI.
- Auth failures: wrong password → `400 invalid_credentials` (verified); expired recovery links land on the login screen.

## 4. Honest status

All Owner-facing integrations are **Working**. Nothing is Partial; nothing Blocked. The only correction made at integration level this cycle was `feature_state` scoping (see `OWNER_RLS_SECURITY.md`). No new REST/Edge endpoint was added — every gap from the audit was closed by reusing existing APIs.
