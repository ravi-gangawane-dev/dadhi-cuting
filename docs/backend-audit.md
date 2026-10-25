# Backend audit — 24 October 2026

Audited before implementation. Angular 22.2, standalone lazy-loaded components, Signals, Tailwind 4, Vitest. Supabase JS 2.118 is already installed but unused. No environment configuration, SQL migrations, connected database, route guards or Netlify configuration found. The repository has extensive pre-existing staged changes; preserve them.

| Module | Current Data Source | UI Status | Backend Status | Required Changes | Priority |
|---|---|---|---|---|---|
| Auth | Always-authenticated signal; phone-length check | Login buttons lack handlers | Not Working | Real auth, recovery, session restoration, guards | P0 |
| Salon/profile | INITIAL_SALON | Existing reactive form | Mock Only | Membership-scoped persistence and storage | P0 |
| Employees | In-memory signals | Add/profile/edit | Mock Only | CRUD, archive, RLS | P1 |
| Customers | In-memory signals | List/search/profile/add | Mock Only | CRUD, paging, history | P1 |
| Catalog | In-memory signals | Add/list/search | Mock Only | Categories, prices, archive | P1 |
| Service entries | In-memory objects | Multi-service selector | Mock Only | Atomic RPC; server prices and discount validation | P0 |
| Payments | Mutates existing transaction to paid, ignoring amount | Cash/UPI/split/pending | Not Working | Immutable receipts, partial balance, idempotency | P0 |
| Expenses | In-memory objects | Add/list | Mock Only | Persistence, date/category filters | P0 |
| Dashboard | Hardcoded HTML amounts and customer names | Approved layout | Mock Only | Actual aggregates and recent entries | P0 |
| Closing | Fixed opening/count cash and delay | Existing reconciliation layout | Mock Only | Input cash, timezone, atomic close and history | P0 |
| Reports | Synthetic multipliers and fixed chart arrays | Period selector/chart | Mock Only | Actual period aggregates | P0 |
| Appointments | In-memory objects | List/status actions; no booking form | Mock Only | Persist records/status and add booking form | P1 |
| Notifications | In-memory records | Read/unread | Mock Only | Server records and recipient isolation | P1 |
| Storage | None | No working upload | Missing | Private bucket, validation, signed URLs | P1 |
| Deployment | Angular build only | SPA | Missing | Netlify redirect and public config generation | P1 |

Existing specs principally assert component creation; they do not exercise financial or security behavior. Forms have uneven validation. Business dates and labels are hardcoded in multiple screens. No localStorage business persistence found. An unused Observable repository interface exists; the store is the actual facade used by components.

Live schema inspection is blocked until a development project is supplied. Migrations must first be reviewed against that project's schema; do not blindly apply if equivalent tables exist. No remote database changes are authorized by an assumed empty schema.
