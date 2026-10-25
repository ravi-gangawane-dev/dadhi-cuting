# Supabase setup and deployment

The Angular code is integrated, but the hosted database has **not** been migrated.
The supplied publishable key is accepted by the project's API. Read-only probes on
24 October 2026 returned `PGRST205` for `salons`, `salon_members`, and `employees`.
The OpenAPI discovery endpoint requires privileged access. These probes cannot
rule out equivalent tables under other names or schemas.

## 1. Inspect the project before applying SQL

Use the authenticated Supabase connection or the project's SQL Editor. Run
`supabase/inspect.sql`. Compare existing tables and policies with the migrations.
If equivalent tables exist, adapt the migrations and mappings instead of creating
duplicates. The migrations intentionally fail on name collisions. No table is
dropped and no existing business record is deleted.

For an empty application schema, apply these files in order:

1. `supabase/migrations/202610240001_core.sql` — 16 business tables, indexes, RLS,
   column grants, immutable audit records, administrator-only owner provisioning.
2. `supabase/migrations/202610240002_operations.sql` — atomic invoice/payment/closing
   functions, report aggregation, closed-day expense protection, notifications.
3. `supabase/migrations/202610240003_storage.sql` — private storage bucket/policies.
4. `supabase/migrations/202610240004_integrity.sql` — finite money constraints,
   timezone validation, overlapping appointment protection.

Alternatively, after schema review, use an authenticated Supabase CLI session:

```powershell
npx supabase login
npx supabase link --project-ref qtsvejbzvdizavoevnoi
npx supabase db push --dry-run
npx supabase db push
```

Authenticate locally; do not put database passwords, access tokens, or secret keys
in Angular, shell history, committed files, or this chat.

## 2. Provision the first owner

Self-service: a signed-in account with no active membership is routed to `/onboarding`.
Entering a salon name calls `public.create_my_salon(name)`, which runs as the
authenticated caller (`auth.uid()`) and atomically creates the salon, an `owner`
membership, the profile row and the default service/expense categories. It refuses
to run for signed-out callers or accounts that already belong to a salon, and a
transaction-level lock prevents a double submit from creating two salons. The salon
can be renamed later from Salon Profile. The SQL path below remains for
administrators who provision staff accounts.

Create or invite an email/password user through Supabase Auth. Copy that user's UUID.
Run this in the privileged SQL Editor, substituting the real Auth user UUID:

```sql
select public.provision_salon('AUTH-USER-UUID'::uuid, 'Your salon name');
```

This transaction creates the salon, an owner membership, a user profile, and the
initial service/expense categories. It cannot be called by anonymous or signed-in
browser users. Adding an employee job title never grants account permissions.

Additional account access is provisioned by a trusted administrator after inviting
the Auth user. Use the returned salon UUID:

```sql
insert into public.salon_members(salon_id,user_id,role)
values ('SALON-UUID','AUTH-USER-UUID','receptionist');
insert into public.user_profiles(id,full_name)
values ('AUTH-USER-UUID','Staff name') on conflict (id) do nothing;
-- For an employee account, use role='employee' above, then link its staff record:
update public.employees set user_id='AUTH-USER-UUID'
where salon_id='SALON-UUID' and id='EMPLOYEE-UUID';
```

Owner/manager accounts manage operational records. Receptionists manage customers,
appointments, invoices and receipts. Employees read their linked work and the
catalog; they cannot record payments or modify salon configuration. Membership
changes and links to Auth accounts are intentionally not exposed as browser writes.
If a user has multiple active salons, the app selects their oldest membership;
an interactive salon switcher is not included.

## 3. Auth and browser configuration

`src/environments/environment.ts` contains only the supplied public URL and
publishable key. `@supabase/supabase-js` was already installed. Production builds
can override these public values through Netlify environment variables:

```text
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

`scripts/configure-environment.mjs` accepts only an HTTPS URL and publishable key,
never a service-role/secret key. Use separate development and production projects
and set each deployment's values explicitly.

In Supabase Auth URL Configuration, set the production Site URL and allow:

- `http://localhost:4200/auth/login?recovery=1`
- `https://YOUR-SITE.netlify.app/auth/login?recovery=1`

Add a custom HTTPS domain if used. Configure password policy and a working email
sender. Recovery emails return to the existing login screen, which switches to
password update mode on Supabase's `PASSWORD_RECOVERY` event. Email delivery and
this callback must still be exercised against the hosted project.

The SDK manages the Auth session; business records are not persisted in browser
localStorage. Logout clears the salon cache and redirects to login.

## 3a. Sign in with a mobile number

Auth identities remain email-based. A user stores a mobile number on their profile
(Settings → Mobile number, saved by `public.user_profiles.phone`). The login field
accepts either an email address or a 10-digit mobile number (a leading `91` country
code is dropped, and spaces/dashes are ignored).

For a mobile number the browser calls `public.email_for_mobile(p_mobile)`, a definer
function reachable by `anon`, which returns the confirmed account's email for the
matching profile phone. The browser then signs in with that email and the entered
password. The function returns `null` for unknown numbers and for anything that is
not exactly 10 digits after normalisation, and a unique index on the normalised
phone keeps one number bound to one account.

Trade-off to keep in mind: anyone who knows a registered mobile number can learn the
email address behind it through this call. Phone numbers are the login identifier, so
that lookup has to exist in the browser. If that becomes unacceptable, replace the
RPC with an Edge Function that performs the lookup and `signInWithPassword` server
side and returns only the session.

## 3b. Forgot password by SMS OTP

Forgot password on the login screen asks for the registered mobile number, sends a
6-digit code, verifies it, then lets the user set a new password. It uses Supabase's
built-in phone OTP, so no SMS credential ever reaches the browser. The email reset
link is still available behind "Send a reset link to my email instead".

Two dashboard steps are required before codes are actually delivered:

1. Authentication → Providers → **Phone**: enable it.
2. Authentication → Providers → Phone → **SMS provider**: add Twilio, Twilio Verify,
   Vonage, MessageBird or Textlocal credentials. For Indian numbers the provider
   account also needs DLT registration, otherwise the operator drops the SMS.

A number can reset a password only after it is verified for the account:

- Settings → Mobile number → **Verify for OTP** calls `auth.updateUser({ phone })` and
  confirms the code with `verifyOtp({ type: 'phone_change' })`. Saving the number
  alone (used for mobile + password sign-in) does not attach it to the Auth identity.
- Reset requests call `signInWithOtp({ phone, shouldCreateUser: false })`, so an
  unknown or unverified number is refused instead of creating an account. The app
  reports that case as "This number is not verified for the account yet".
- After `verifyOtp({ type: 'sms' })` the user holds a session for that account; the
  dialog then writes the new password with `updateUser({ password })` and signs out.

Until the provider is configured the dialog stops with a clear message instead of
silently failing: Supabase answers `Unable to get SMS provider`, which the app reports
as "SMS sending is not configured for this project yet".

### Email code fallback

"Send the code to my email instead" requests `signInWithOtp({ email })`, verifies with
`verifyOtp({ type: 'email' })` and then sets the password the same way. It needs no SMS
account and no redirect allowlist, because nothing is clicked — the user types the
code. One project setting is required: replace Supabase's default Magic Link body with
one that prints `{{ .Token }}`, for example:

```html
<h2>Your DadhiCutting code</h2>
<p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
```

Without `{{ .Token }}` the mail contains only a link, and the code field has nothing to
accept. Supabase's built-in sender only reaches project team members; add custom SMTP
before relying on this for salon staff.

## 4. Financial definitions

- Revenue means completed service totals after discounts, on the salon's business
  date. It is billed revenue, not receipts.
- Collected means recorded receipts, grouped by receipt date in the salon timezone.
- Pending means each completed invoice total minus its receipts, across all dates.
  Pending list rows are derived balances, not payment records.
- Visits means completed service entries, including walk-ins. Average ticket is
  net billed revenue divided by visits. Service performance allocates an invoice's
  discount proportionally to its line items.
- Closing expected cash = entered opening cash + cash receipts − cash expenses.
  Variance = counted cash − expected cash. Closing snapshots cannot be overwritten.
- New invoices, current-day receipts and expense edits share salon-row locks with
  closing. Closed expense dates cannot be edited or moved. An old unpaid invoice
  can be paid on a later open business day; the old closing is preserved.
- Cash, UPI and card are **manually confirmed receipts**. There is no payment
  gateway, automated UPI settlement, WhatsApp delivery or push provider.
- Idempotency keys survive retries within a form instance. The server rejects
  conflicting payload reuse and overpayment. Reloading an unsaved form starts a
  new request; check invoice/payment history after uncertain network outcomes.

## 4a. Corrections

Financial documents cannot be edited or deleted directly. Three audited paths exist for
mistakes, all owner/manager only and all refused once the business day is closed:

- `void_payment(payment, reason)` reverses one mis-keyed receipt. The invoice returns to
  its outstanding balance and the reversal is written to `audit_logs`.
- `void_service_entry(invoice, reason)` voids an unpaid invoice. It refuses while any
  receipt is attached — reverse the receipts first.
- Receipts, invoices and closings in a closed day remain immutable; a past-day mistake
  still needs an administrator.

Expenses and appointments may be deleted by their permitted roles. Expense deletion is
blocked on a closed day; both deletions write an `audit_logs` row.

## 5. Files and safe archiving

The `salon-private` bucket is private, maximum 5 MB. UI uploads validate size, MIME
and common file signatures. Image formats: JPEG, PNG, WebP. Expense attachments
also permit PDF. Objects use `<salon>/<logo|employees|expenses>/<random UUID>` paths.
Owners/managers have scoped storage access; only owners replace salon logos.
Signed links expire after five minutes; reopening the screen obtains a fresh link.
Replacement saves the new database reference before removing the old object.
Upload compensation removes a new object if saving its reference fails. Network
failures during cleanup may leave an orphan for administrator cleanup.

Upload salon logos from Salon Profile and employee photos from Employee Profile.
Save an expense first, then use its Edit / attachment action. Customer photos were
not present in the existing UI and are not added. Employees and services are
archived, not deleted, preserving historical invoices and prices.

## 6. Local verification and Netlify

```powershell
npm ci
npm run build
npm test -- --watch=false
npm run test:db
npm run test:browser
```

Browser checks require Microsoft Edge by default; set `PLAYWRIGHT_CHANNEL=chrome`
if Chrome is installed instead. They serve the built SPA on 127.0.0.1:4173 and
intercept Supabase requests with an isolated fixture. They do not test hosted Auth
or create real transactions. Database checks use PGlite PostgreSQL with minimal
Auth/Storage stand-ins; they execute real SQL/RLS, but do not emulate Supabase
Storage's HTTP service, email delivery or multi-connection lock contention.

Netlify configuration builds Angular and publishes `dist/DadhiCuting/browser` with
a SPA fallback. Run a deployment smoke test on nested routes and password recovery
after migrations, owner provisioning and redirect configuration. No Netlify site
was deployed during this change.

## 7. Hosted acceptance still required

Use two development salons and owner, manager, receptionist and employee test
accounts. Repeat login, CRUD, archive, visit history, full/partial/split receipt,
expense, dashboard, closing and report flows. Verify cross-salon reads and writes
with real JWTs, simultaneous receipt/closing requests, lost-response retries,
password reset delivery, file uploads/replacement/signed links, and direct nested
Netlify routes. Do not use production financial records for these tests.

Customer list searching, sorting and paging execute on the backend. The shared
facade still loads historical records in 500-row transport pages for existing
profile/selector contracts; this is correct but eager. Large salons should replace
that cache with per-feature paginated history/selector queries before scale testing.
