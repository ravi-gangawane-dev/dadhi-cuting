import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
process.on('uncaughtException', (e) => {
  console.error(e.message, e.detail ?? '', e.where ?? '');
  process.exit(1);
});
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
`);
for (const file of readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  console.log('Migration applied: ' + file);
}
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('PASS ' + name);
}
const owner = '10000000-0000-0000-0000-000000000001',
  other = '10000000-0000-0000-0000-000000000002',
  staff = '10000000-0000-0000-0000-000000000003',
  reception = '10000000-0000-0000-0000-000000000004';
await db.exec(
  `insert into auth.users(id) values('${owner}'),('${other}'),('${staff}'),('${reception}');
   update auth.users set email = id::text || '@test.local';`,
);
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const salon = await scalar('select public.provision_salon($1,$2)', [owner, 'Test salon A']);
const salonB = await scalar('select public.provision_salon($1,$2)', [other, 'Test salon B']);
await db.exec(
  `insert into public.salon_members(salon_id,user_id,role) values('${salon}','${staff}','employee'),('${salon}','${reception}','receptionist');`,
);
const as = async (user) =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${user}',false);set role authenticated;`,
  );
const denied = async (sql, args = []) => assert.rejects(() => db.query(sql, args));
await as(owner);
const employee = await scalar(
  "insert into public.employees(salon_id,full_name) values($1,'Barber') returning id",
  [salon],
);
const customer = await scalar(
  "insert into public.customers(salon_id,full_name) values($1,'Customer') returning id",
  [salon],
);
const service = await scalar(
  "insert into public.services(salon_id,name,price,duration_minutes) values($1,'Haircut',200,30) returning id",
  [salon],
);
const req = '20000000-0000-0000-0000-000000000001';
const create = "select public.create_service_entry($1,$2,$3,$4,20,'',$5)";
const args = [
  salon,
  employee,
  customer,
  JSON.stringify([{ service_id: service, quantity: 2 }]),
  req,
];
let entry;
await check('owner CRUD and server-calculated discounted invoice', async () => {
  entry = await scalar(create, args);
  assert.equal(
    Number(await scalar('select total_amount from public.service_entries where id=$1', [entry])),
    380,
  );
});
await check('service-entry retry is idempotent', async () =>
  assert.equal(await scalar(create, args), entry),
);
await check('idempotency rejects changed invoice payload', async () => {
  await denied(create, [salon, employee, null, args[3], req]);
});
await check('invalid item rolls back entire invoice', async () => {
  const count = await scalar('select count(*) from public.service_entries');
  await denied(create, [
    salon,
    employee,
    customer,
    JSON.stringify([
      { service_id: service, quantity: 1 },
      { service_id: crypto.randomUUID(), quantity: 1 },
    ]),
    crypto.randomUUID(),
  ]);
  assert.equal(await scalar('select count(*) from public.service_entries'), count);
});
await check('direct financial inserts and total edits denied', async () => {
  await denied('update public.service_entries set total_amount=0 where id=$1', [entry]);
  await denied(
    "insert into public.payments(salon_id,service_entry_id,amount,payment_method,confirmation,request_id,part) values($1,$2,1,'cash','x',$3,1)",
    [salon, entry, crypto.randomUUID()],
  );
});
const pay = 'select public.record_payment($1,$2,$3,$4,$5)';
const payArgs = [
  salon,
  entry,
  JSON.stringify([{ method: 'cash', amount: 100 }]),
  'Manual cash receipt',
  crypto.randomUUID(),
];
await check('partial payment and repeated tap yield one receipt', async () => {
  await scalar(pay, payArgs);
  await scalar(pay, payArgs);
  assert.equal(await scalar('select count(*) from public.payments'), 1);
});
await check('overpayment and negative payment denied', async () => {
  for (const amount of [281, -1])
    await denied(pay, [
      salon,
      entry,
      JSON.stringify([{ method: 'upi', amount }]),
      'verified manually',
      crypto.randomUUID(),
    ]);
});
await check('missing receipt confirmation denied', async () => {
  await denied(pay, [
    salon,
    entry,
    JSON.stringify([{ method: 'upi', amount: 1 }]),
    '',
    crypto.randomUUID(),
  ]);
});
await check('split receipt transaction completes remaining balance', async () => {
  await scalar(pay, [
    salon,
    entry,
    JSON.stringify([
      { method: 'cash', amount: 80 },
      { method: 'upi', amount: 200 },
    ]),
    'manually checked',
    crypto.randomUUID(),
  ]);
  assert.equal(Number(await scalar('select sum(amount) from public.payments')), 380);
});
const today = await scalar("select (now() at time zone 'Asia/Kolkata')::date::text");
await scalar(
  "insert into public.expenses(salon_id,amount,expense_date,description,payment_method) values($1,30,$2,'Supplies','cash') returning id",
  [salon, today],
);
await check('report uses exact revenue, receipts, and expenses', async () => {
  const r = await scalar('select public.report_summary($1,$2,$2)', [salon, today]);
  assert.equal(r.revenue, 380);
  assert.equal(r.services, 2);
  assert.equal(r.outstanding, 0);
  assert.equal(r.methods.cash, 180);
  assert.equal(r.expenses, 30);
});
await check('NaN amounts and null RPC payloads rejected', async () => {
  await denied(
    "insert into public.expenses(salon_id,amount,expense_date,description,payment_method) values($1,'NaN',$2,'Invalid','cash')",
    [salon, today],
  );
  await denied(create, [salon, employee, customer, null, crypto.randomUUID()]);
  await denied(pay, [salon, entry, null, 'Manual', crypto.randomUUID()]);
});
await check('appointment overlap rejected without rejecting adjacent bookings', async () => {
  const q =
    'insert into public.appointments(salon_id,customer_id,employee_id,appointment_date,start_time,end_time) values($1,$2,$3,$4,$5,$6) returning id';
  await scalar(q, [salon, customer, employee, today, '10:00', '10:30']);
  await denied(q, [salon, customer, employee, today, '10:15', '10:45']);
  await scalar(q, [salon, customer, employee, today, '10:30', '11:00']);
});
const invoiceB = await scalar(create, [
  salon,
  employee,
  customer,
  JSON.stringify([{ service_id: service, quantity: 1 }]),
  crypto.randomUUID(),
]);
await check('receipt reversal restores the outstanding balance', async () => {
  const payReq = crypto.randomUUID();
  await scalar(pay, [
    salon,
    invoiceB,
    JSON.stringify([{ method: 'cash', amount: 180 }]),
    'manual check',
    payReq,
  ]);
  const paid = await scalar('select id from public.payments where request_id=$1', [payReq]);
  await scalar('select public.void_payment($1,$2,$3)', [salon, paid, 'keyed twice']);
  assert.equal(
    Number(
      await scalar('select coalesce(sum(amount),0) from public.payments where service_entry_id=$1', [
        invoiceB,
      ]),
    ),
    0,
  );
  assert.equal(
    Number(
      await scalar(
        "select count(*) from public.audit_logs where entity_id=$1 and action like 'VOID_PAYMENT%'",
        [paid],
      ),
    ),
    1,
  );
});
await check('unpaid invoice voids, paid invoice is protected', async () => {
  await denied('select public.void_service_entry($1,$2,$3)', [salon, entry, 'duplicate']);
  await scalar('select public.void_service_entry($1,$2,$3)', [salon, invoiceB, 'keyed twice']);
  assert.equal(
    await scalar('select status from public.service_entries where id=$1', [invoiceB]),
    'cancelled',
  );
  assert.equal(
    Number(await scalar("select public.report_summary($1,$2,$2)->>'outstanding'", [salon, today])),
    0,
  );
});
await check('appointment can be rescheduled and deleted with audit', async () => {
  const apt = await scalar('select id from public.appointments order by start_time limit 1');
  await db.query("update public.appointments set start_time='12:00',end_time='12:30' where id=$1", [
    apt,
  ]);
  await scalar('delete from public.appointments where id=$1 returning id', [apt]);
  assert.equal(await scalar('select count(*) from public.appointments where id=$1', [apt]), 0);
  assert.equal(
    Number(
      await scalar("select count(*) from public.audit_logs where entity_id=$1 and action='DELETE'", [
        apt,
      ]),
    ),
    1,
  );
});
await check('expense can be deleted on an open day', async () => {
  const exp = await scalar(
    "insert into public.expenses(salon_id,amount,expense_date,description,payment_method) values($1,10,$2,'Temp','cash') returning id",
    [salon, today],
  );
  await scalar('delete from public.expenses where id=$1 returning id', [exp]);
  assert.equal(await scalar('select count(*) from public.expenses where id=$1', [exp]), 0);
});
await as(reception);
await check('receptionist cannot void financial documents', async () => {
  await denied('select public.void_service_entry($1,$2,$3)', [salon, entry, 'no rights']);
  await denied('select public.void_payment($1,$2,$3)', [salon, crypto.randomUUID(), 'no rights']);
});
await as(owner);
await check('own profile editable without role escalation or identity changes', async () => {
  await db.query("update public.user_profiles set full_name='Owner Name' where id=$1", [owner]);
  assert.equal(
    await scalar('select full_name from public.user_profiles where id=$1', [owner]),
    'Owner Name',
  );
  await denied('update public.user_profiles set id=$1 where id=$2', [other, owner]);
});
await check('owner cannot self-assign memberships or provision another salon', async () => {
  await denied("insert into public.salon_members(salon_id,user_id,role) values($1,$2,'owner')", [
    salonB,
    owner,
  ]);
  await denied("select public.provision_salon($1,'No')", [owner]);
});
await as(other);
await check('cross-salon SELECT returns no rows', async () => {
  assert.equal(
    await scalar('select count(*) from public.service_entries where salon_id=$1', [salon]),
    0,
  );
});
await check('cross-salon mutations and RPC denied', async () => {
  await denied("insert into public.customers(salon_id,full_name) values($1,'Bad')", [salon]);
  await denied(pay, [
    salon,
    entry,
    JSON.stringify([{ method: 'cash', amount: 1 }]),
    'x',
    crypto.randomUUID(),
  ]);
});
const customerB = await scalar(
  "insert into public.customers(salon_id,full_name) values($1,'B') returning id",
  [salonB],
);
await as(owner);
await check('cross-salon foreign key rejected', async () => {
  await denied(
    "insert into public.appointments(salon_id,customer_id,employee_id,appointment_date,start_time,end_time) values($1,$2,$3,$4,'10:00','11:00')",
    [salon, customerB, employee, today],
  );
});
await as(reception);
await check('receptionist cannot manage staff, expenses or close days', async () => {
  await denied("insert into public.employees(salon_id,full_name) values($1,'Bad')", [salon]);
  await denied(
    "insert into public.expenses(salon_id,amount,expense_date,description,payment_method) values($1,1,$2,'Bad','cash')",
    [salon, today],
  );
  await denied('select public.close_business_day($1,$2,0,0)', [salon, today]);
});
await db.exec(`reset role;update public.employees set user_id='${staff}' where id='${employee}';`);
await as(staff);
await check('employee reads only linked work and cannot collect payments', async () => {
  // Both invoices belong to the linked employee, including the voided one.
  assert.equal(await scalar('select count(*) from public.service_entries'), 2);
  assert.equal(
    await scalar("select count(*) from public.service_entries where status='cancelled'"),
    1,
  );
  assert.equal(await scalar('select count(*) from public.customers'), 0);
  assert.equal(await scalar('select count(*) from public.payments'), 0);
  await denied(pay, [
    salon,
    entry,
    JSON.stringify([{ method: 'cash', amount: 1 }]),
    'x',
    crypto.randomUUID(),
  ]);
});
await as(owner);
await check('private storage tenant isolation', async () => {
  await db.query("insert into storage.objects(bucket_id,name) values('salon-private',$1)", [
    salon + '/employees/test.png',
  ]);
  await denied("insert into storage.objects(bucket_id,name) values('salon-private',$1)", [
    salonB + '/employees/test.png',
  ]);
});
await as(other);
await check('other salon cannot read private files or notifications', async () => {
  assert.equal(await scalar('select count(*) from storage.objects'), 0);
  assert.equal(
    await scalar('select count(*) from public.notifications where salon_id=$1', [salon]),
    0,
  );
});
await as(owner);
await check('closing calculates cash and variance on server', async () => {
  await scalar('select public.close_business_day($1,$2,50,195)', [salon, today]);
  const row = (await db.query('select * from public.daily_closings')).rows[0];
  assert.equal(Number(row.expected_cash), 200);
  assert.equal(Number(row.difference), -5);
});
await check('duplicate closing and late expense mutations rejected', async () => {
  await denied('select public.close_business_day($1,$2,50,195)', [salon, today]);
  await denied('update public.expenses set amount=40 where salon_id=$1', [salon]);
  await denied(create, [salon, employee, customer, args[3], crypto.randomUUID()]);
});
await check('closed day blocks receipt reversal and expense deletion', async () => {
  const paid = await scalar('select id from public.payments limit 1');
  await denied('select public.void_payment($1,$2,$3)', [salon, paid, 'after closing']);
  await denied('delete from public.expenses where salon_id=$1', [salon]);
});
await check('audit and notifications are server generated', async () => {
  assert.ok((await scalar('select count(*) from public.audit_logs')) > 0);
  assert.ok((await scalar('select count(*) from public.notifications')) > 0);
  await denied("update public.notifications set title='Forged'");
});
const newbie = '10000000-0000-0000-0000-000000000005';
await db.exec(
  `reset role;select set_config('request.jwt.claim.sub','',false);insert into auth.users(id) values('${newbie}');
   update auth.users set email = '${newbie}@test.local' where id='${newbie}';`,
);
await check('self-service onboarding creates one owner salon', async () => {
  await as(newbie);
  const fresh = await scalar('select public.create_my_salon($1)', ['New salon']);
  assert.equal(
    await scalar('select role from public.salon_members where salon_id=$1 and user_id=$2', [
      fresh,
      newbie,
    ]),
    'owner',
  );
  assert.ok(
    Number(await scalar('select count(*) from public.service_categories where salon_id=$1', [fresh])) >
      0,
  );
  await denied('select public.create_my_salon($1)', ['Second salon']);
});
await check('onboarding rejects signed-out callers', async () => {
  await db.exec(
    "reset role;select set_config('request.jwt.claim.sub','',false);set role authenticated;",
  );
  await denied('select public.create_my_salon($1)', ['Anon salon']);
});
await check('mobile sign-in resolves the account email for signed-out callers', async () => {
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);");
  await db.query("update public.user_profiles set phone='+91 98765 43210' where id=$1", [owner]);
  const email = await scalar("select public.email_for_mobile('9876543210')");
  assert.equal(email, owner + '@test.local');
  assert.equal(await scalar("select public.email_for_mobile('+91 98765 43210')"), email);
  assert.equal(await scalar("select public.email_for_mobile('9999999999')"), null);
  assert.equal(await scalar("select public.email_for_mobile('123')"), null);
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon;");
  assert.equal(await scalar("select public.email_for_mobile('9876543210')"), email);
  assert.equal(await scalar("select public.email_for_mobile('9999999999')"), null);
  assert.equal(await scalar("select public.email_for_mobile('123')"), null);
});
await check('one mobile number belongs to one account', async () => {
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);");
  await assert.rejects(
    db.query("update public.user_profiles set phone='+91 98765 43210' where id=$1", [other]),
    /duplicate key|user_profiles_phone_key/i,
  );
});

/* ====== Platform RBAC + feature flags (migrations 202610250001-0002) ====== */
const superAdmin = '10000000-0000-0000-0000-000000000006',
  accountantUser = '10000000-0000-0000-0000-000000000007',
  suspendedUser = '10000000-0000-0000-0000-000000000008';
await db.exec(
  `insert into auth.users(id) values('${superAdmin}'),('${accountantUser}'),('${suspendedUser}');
   update auth.users set email=id::text||'@test.local' where id in ('${superAdmin}','${accountantUser}','${suspendedUser}');`,
);
await db.exec(
  `insert into public.salon_members(salon_id,user_id,role) values('${salon}','${accountantUser}','accountant'),('${salon}','${suspendedUser}','receptionist');
   update public.salon_members set active=false where user_id='${suspendedUser}';`,
);
await as(owner);
await check('flag registry reports implemented and planned features', async () => {
  const st = await scalar('select public.feature_state($1)', [salon]);
  assert.equal(st.payments.available, true);
  assert.equal(st.inventory.available, false);
  assert.equal(st.multi_branch.lifecycle, 'planned');
  assert.equal(await scalar('select count(*) from public.feature_flags'), 15);
});
await check('non platform-admin cannot set flags, overrides or read platform audit', async () => {
  await denied('select public.platform_feature_set($1,$2,$3)', ['services', false, 'beta']);
  await denied('select public.platform_salon_feature($1,$2,$3)', [salon, 'customers', false]);
  // RLS hides, it does not error: an ordinary member gets an empty audit stream.
  assert.equal(await scalar('select count(*) from public.platform_audit_logs'), 0);
  await denied('select count(*) from public.salon_feature_overrides');
});
await as(suspendedUser);
await check('suspended member sees nothing and cannot escape by onboarding', async () => {
  assert.equal(await scalar('select count(*) from public.notifications'), 0);
  assert.equal(await scalar('select count(*) from public.customers'), 0);
  await denied('select public.create_my_salon($1)', ['Escape hatch']);
  await denied('select public.set_member_active($1,$2,$3)', [salon, suspendedUser, true]);
  await denied(
    "insert into public.customers(salon_id,full_name) values($1,'Bad')",
    [salon],
  );
});
await as(accountantUser);
await check('accountant reads financial records but cannot mutate anything', async () => {
  assert.equal(await scalar('select count(*) from public.payments'), 3);
  assert.equal(await scalar('select count(*) from public.service_entries'), 2);
  assert.equal(await scalar('select count(*) from public.expenses'), 1);
  assert.equal(
    Number(await scalar("select public.report_summary($1,$2,$2)->>'revenue'", [salon, today])),
    380,
  );
  await denied(
    "insert into public.expenses(salon_id,amount,expense_date,description,payment_method) values($1,5,$2,'Bad','cash')",
    [salon, today],
  );
  await denied('select public.void_service_entry($1,$2,$3)', [salon, entry, 'no rights']);
  assert.equal(await scalar('select count(*) from public.platform_audit_logs'), 0);
});
await as(owner);
await check('owner restores and suspends staff through the audited RPC', async () => {
  await scalar('select public.set_member_active($1,$2,$3)', [salon, suspendedUser, true]);
  assert.equal(
    await scalar('select active from public.salon_members where user_id=$1', [suspendedUser]),
    true,
  );
  await scalar('select public.set_member_active($1,$2,$3)', [salon, suspendedUser, false]);
  assert.ok(
    Number(
      await scalar(
        "select count(*) from public.audit_logs where action in ('SUSPEND_MEMBER','RESTORE_MEMBER')",
      ),
    ) >= 2,
  );
});
await check('owner cannot suspend an owner membership or grant platform-ish roles', async () => {
  await denied('select public.set_member_active($1,$2,$3)', [salon, owner, false]);
  await denied('select public.set_member_role($1,$2,$3)', [salon, reception, 'owner']);
  await denied('select public.set_member_active($1,$2,$3)', [salonB, owner, false]);
});
await check('owner re-roles staff inside the allowed set', async () => {
  const mem = await scalar('select id from public.salon_members where user_id=$1', [reception]);
  await scalar('select public.set_member_role($1,$2,$3)', [salon, reception, 'accountant']);
  assert.equal(await scalar('select role from public.salon_members where id=$1', [mem]), 'accountant');
  await scalar('select public.set_member_role($1,$2,$3)', [salon, reception, 'receptionist']);
});
await as(staff);
await check('non-owner cannot manage memberships', async () => {
  await denied('select public.set_member_active($1,$2,$3)', [salon, suspendedUser, true]);
  await denied('select public.set_member_role($1,$2,$3)', [salon, suspendedUser, 'manager']);
});
await check('service-role bootstraps the platform admin list, browsers cannot', async () => {
  await db.exec('reset role;');
  await db.query("insert into public.platform_admins(user_id,note) values($1,'bootstrap')", [superAdmin]);
});
await as(superAdmin);
await check('platform admin exists with cross-salon inspect rights and no owner powers', async () => {
  assert.equal(await scalar('select private.is_platform_admin()'), true);
  assert.equal(await scalar('select count(*) from public.salons'), 3); // A, B, self-serve onboarding
  assert.ok((await scalar('select count(*) from public.user_profiles')) >= 3);
  assert.ok(Number(await scalar('select count(*) from public.platform_audit_logs')) === 0);
  await denied("insert into public.salon_members(salon_id,user_id,role) values($1,$2,'owner')", [salon, superAdmin]);
  await denied('insert into public.platform_admins(user_id) values($1)', [other]);
  await insight();
});
async function insight() {
  await denied('select public.set_member_active($1,$2,$3)', [salon, suspendedUser, true]);
}
await check('admin verdict RPC lives in the public schema for the browser', async () => {
  await as(superAdmin);
  assert.equal(await scalar('select public.is_platform_admin()'), true);
  await as(staff);
  assert.equal(await scalar('select public.is_platform_admin()'), false);
  await db.exec('reset role; set role anon;');
  await denied('select public.is_platform_admin()');
});
await as(superAdmin);
await check('platform-admin self-onboarding is blocked', async () => {
  await denied('select public.create_my_salon($1)', ['Admin salon']);
});
await check('platform admin manages registry lifecycle with audit', async () => {
  await scalar('select public.platform_feature_set($1,$2,$3)', ['services', null, 'beta']);
  const st = await scalar('select public.feature_state($1)', [salon]);
  assert.equal(st.services.available, true);
  assert.equal(st.services.lifecycle, 'beta');
  assert.equal(
    await scalar(
      "select count(*) from public.platform_audit_logs where action='FEATURE_SET' and entity_id='services'",
    ),
    1,
  );
  await denied('select public.platform_feature_set($1,$2,$3)', ['nope', true, 'beta']);
});
await check('salon entitlement overrides cannot exceed platform availability', async () => {
  await scalar('select public.platform_salon_feature($1,$2,$3)', [salon, 'inventory', true]);
  const st = await scalar('select public.feature_state($1)', [salon]);
  assert.equal(st.inventory.available, false);
  await scalar('select public.platform_salon_feature($1,$2,$3)', [salon, 'inventory', null]);
});
await check('disabling a salon entitlement is enforced by policies and RPCs', async () => {
  await scalar('select public.platform_salon_feature($1,$2,$3)', [salon, 'services', false]);
});
await as(owner);
await check('owner observes (not controls) a disabled feature', async () => {
  const st = await scalar('select public.feature_state($1)', [salon]);
  assert.equal(st.services.available, false);
  assert.equal(st.customers.available, true); // untouched flag keeps working
  await denied(
    'select public.create_service_entry($1,$2,$3,$4,0,$5,$6)',
    [salon, employee, customer, JSON.stringify([{ service_id: service, quantity: 1 }]), '', crypto.randomUUID()],
  );
  await denied('select public.platform_salon_feature($1,$2,$3)', [salon, 'services', true]);
});
await as(other);
const empB = await scalar("insert into public.employees(salon_id,full_name) values($1,'B staff') returning id", [salonB]);
const custB = await scalar("insert into public.customers(salon_id,full_name) values($1,'B cust') returning id", [salonB]);
const serviceB = await scalar("insert into public.services(salon_id,name,price,duration_minutes) values($1,'B trim',200,30) returning id", [salonB]);
await as(superAdmin);
await check('payments flag gates receipt recording; re-enabling restores it', async () => {
  await scalar('select public.platform_salon_feature($1,$2,$3)', [salonB, 'payments', false]);
  await scalar('select public.platform_salon_feature($1,$2,$3)', [salonB, 'services', null]);
});
await as(other);
const gateEntry = await scalar('select public.create_service_entry($1,$2,$3,$4,0,$5,$6)', [
  salonB, empB, custB, JSON.stringify([{ service_id: serviceB, quantity: 1 }]), 'gate', crypto.randomUUID(),
]);
await denied(pay, [salonB, gateEntry, JSON.stringify([{ method: 'cash', amount: 200 }]), 'blocked', crypto.randomUUID()]);
await as(superAdmin);
await scalar('select public.platform_salon_feature($1,$2,$3)', [salonB, 'payments', null]);
await as(other);
await scalar(pay, [salonB, gateEntry, JSON.stringify([{ method: 'cash', amount: 200 }]), 'after restore', crypto.randomUUID()]);
await as(superAdmin);
await check('platform audit records every privileged change', async () => {
  const actions = await scalar(
    "select count(*) from public.platform_audit_logs where action in ('FEATURE_SET','SALON_FEATURE')",
  );
  assert.ok(Number(actions) >= 5);
});
await as(owner);
await check('lifecycle day-lock still governs closing after flag changes', () =>
  denied('select public.close_business_day($1,$2,0,0)', [salon, today]));

/* Owner-role additions: the platform-controlled self-onboarding gate. */
const onboardee = '10000000-0000-0000-0000-000000000031',
  secondSalon = '10000000-0000-0000-0000-000000000032';
await db.exec(
  `reset role;insert into auth.users(id) values('${onboardee}'),('${secondSalon}');
   update auth.users set email = id::text || '@test.local';set role authenticated;`,
);
await as(onboardee);
await check('self-onboarding stays available by default (platform-controlled flag seeded enabled)', async () => {
  const s = await scalar('select public.create_my_salon($1)', ['Fresh self salon']);
  assert.ok(s);
});
const setGate = async (sql) => {
  await db.exec(`reset role;${sql}set role authenticated;`);
};
await setGate(`update public.feature_flags set platform_enabled=false where key='salon_self_onboarding';`);
await as(secondSalon);
await check('super admin can switch self-onboarding off centrally', () =>
  denied('select public.create_my_salon($1)', ['Blocked salon']));
await setGate(
  `update public.feature_flags set lifecycle='disabled' where key='salon_self_onboarding';`,
);
await check('a disabled lifecycle fails closed too', () =>
  denied('select public.create_my_salon($1)', ['Blocked salon 2']));
await setGate(`update public.feature_flags set lifecycle='enabled', platform_enabled=true where key='salon_self_onboarding';`);
const third = '10000000-0000-0000-0000-000000000033';
await db.exec(`reset role;insert into auth.users(id) values('${third}');update auth.users set email = id::text || '@test.local';set role authenticated;`);
await as(third);
await check('restoring the flag re-enables self-onboarding', async () => {
  const s = await scalar('select public.create_my_salon($1)', ['Restored salon']);
  assert.ok(s);
});
/* feature_state is member-scoped: flag metadata is not readable cross-salon. */
const thirdSalon = await scalar(
  "select salon_id from public.salon_members where user_id='" + third + "' limit 1",
);
const stateOf = async (who, salonId) => {
  await as(who);
  const r = await scalar('select public.feature_state($1)', [salonId]);
  await as(owner);
  return r;
};
await check('a member sees the full feature state of the salon they belong to', async () => {
  const ownState = await stateOf(third, thirdSalon);
  assert.equal(Object.keys(ownState).length, 15);
});
await check('a stranger cannot probe another salon feature state', async () => {
  assert.deepEqual(await stateOf(secondSalon, thirdSalon), {});
});
await check('a platform admin still reads any salon feature state', async () => {
  const adminView = await stateOf(superAdmin, thirdSalon);
  assert.equal(Object.keys(adminView).length, 15);
});
await as(owner);

await db.close();
console.log(
  `${passed} database integration checks passed (isolated PGlite PostgreSQL, mocked Auth/Storage schemas).`,
);
