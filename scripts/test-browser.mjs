// Browser integration with a deterministic API fixture, never production records.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('dist/DadhiCuting/browser');
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + sep) && path !== root) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(path)).isFile()) path = resolve(root, 'index.html');
    } catch {
      path = resolve(root, 'index.html');
    }
    res.setHeader(
      'Content-Type',
      {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      }[extname(path)] ?? 'application/octet-stream',
    );
    res.end(await readFile(path));
  } catch {
    res.writeHead(500).end();
  }
});
await new Promise((r) => server.listen(4173, '127.0.0.1', r));
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
  headless: true,
});
let passed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const uid = '10000000-0000-0000-0000-000000000001',
    salon = '20000000-0000-0000-0000-000000000001';
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const now = new Date().toISOString();
  const db = {
    salons: [
      {
        id: salon,
        name: 'Test Salon',
        phone: '+91 9876543210',
        address: 'Pune',
        opening_hours: { opening: '09:00', closing: '21:00' },
        timezone: 'Asia/Kolkata',
        language: 'en',
        name_marathi: '',
        tagline: '',
        tagline_marathi: '',
      },
    ],
    salon_members: [
      {
        id: crypto.randomUUID(),
        salon_id: salon,
        user_id: uid,
        role: 'owner',
        active: true,
        created_at: now,
      },
    ],
    user_profiles: [{ id: uid, full_name: 'Test Owner' }],
    employees: [],
    customers: [],
    services: [],
    service_categories: [{ id: crypto.randomUUID(), salon_id: salon, name: 'Hair', active: true }],
    service_entries: [],
    service_entry_items: [],
    payments: [],
    expenses: [],
    expense_categories: [{ id: crypto.randomUUID(), salon_id: salon, name: 'Shop supplies' }],
    daily_closings: [],
    appointments: [],
    notifications: [],
  };
  const user = {
    id: uid,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@example.test',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: now,
  };
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: uid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
    'fixture',
  ]
    .map((p, i) => (i < 2 ? Buffer.from(JSON.stringify(p)).toString('base64url') : p))
    .join('.');
  const session = {
    access_token: token,
    refresh_token: 'fixture',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  let loginCount = 0;
  await page.route('https://*.supabase.co/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname,
      body = req.postDataJSON();
    let response;
    if (path.endsWith('/auth/v1/token')) {
      loginCount++;
      response = session;
    } else if (path.endsWith('/auth/v1/logout')) response = {};
    else if (path.endsWith('/auth/v1/user')) response = user;
    else if (path.includes('/rpc/is_platform_admin')) {
      // Platform guard verdict: the fixture account is not an administrator.
      response = false;
    } else if (path.includes('/rpc/feature_state')) {
      // Server-evaluated entitlements, mirroring the registry lifecycle rules:
      // implemented + platform-available flags for this salon.
      const flags = {
        dashboard: true,
        customers: true,
        employees: true,
        services: true,
        payments: true,
        expenses: true,
        daily_closing: true,
        reports: true,
        appointments: true,
        inventory: false,
        whatsapp_notifications: false,
        memberships: false,
        loyalty: false,
        multi_branch: false,
      };
      response = Object.fromEntries(
        Object.entries(flags).map(([key, available]) => [
          key,
          {
            label: key,
            description: '',
            lifecycle: available ? 'enabled' : 'planned',
            platformEnabled: available,
            available,
            entitled: true,
          },
        ]),
      );
    } else if (path.includes('/rpc/report_summary')) {
      const entries = db.service_entries.filter(
        (e) => e.service_date >= body.p_from && e.service_date <= body.p_to,
      );
      const methods = {};
      for (const p of db.payments)
        methods[p.payment_method] = (methods[p.payment_method] ?? 0) + p.amount;
      response = {
        revenue: entries.reduce((s, e) => s + e.total_amount, 0),
        services: db.service_entry_items.length,
        visits: entries.length,
        expenses: db.expenses.reduce((s, e) => s + e.amount, 0),
        outstanding:
          db.service_entries.reduce((s, e) => s + e.total_amount, 0) -
          db.payments.reduce((s, p) => s + p.amount, 0),
        methods,
        chart: entries.map((e) => ({ label: e.service_date, value: e.total_amount })),
        topServices: db.services.map((s) => ({
          name: s.name,
          count: db.service_entry_items.filter((i) => i.service_id === s.id).length,
          revenue: db.service_entry_items
            .filter((i) => i.service_id === s.id)
            .reduce((n, i) => n + i.unit_price * i.quantity, 0),
        })),
        employees: db.employees.map((e) => ({
          employee_id: e.id,
          visits: entries.filter((x) => x.employee_id === e.id).length,
          revenue: entries
            .filter((x) => x.employee_id === e.id)
            .reduce((n, x) => n + x.total_amount, 0),
        })),
      };
    } else if (path.includes('/rpc/create_service_entry')) {
      const id = crypto.randomUUID(),
        subtotal = body.p_items.reduce(
          (s, i) => s + db.services.find((x) => x.id === i.service_id).price * i.quantity,
          0,
        );
      db.service_entries.push({
        id,
        salon_id: salon,
        employee_id: body.p_employee,
        customer_id: body.p_customer,
        service_date: day,
        status: 'completed',
        subtotal,
        discount_amount: body.p_discount,
        total_amount: subtotal - body.p_discount,
        notes: '',
        created_at: now,
      });
      for (const item of body.p_items) {
        const s = db.services.find((s) => s.id === item.service_id);
        db.service_entry_items.push({
          id: crypto.randomUUID(),
          salon_id: salon,
          service_entry_id: id,
          service_id: s.id,
          service_name: s.name,
          unit_price: s.price,
          quantity: item.quantity,
        });
      }
      response = id;
    } else if (path.includes('/rpc/record_payment')) {
      for (const p of body.p_parts)
        db.payments.push({
          id: crypto.randomUUID(),
          salon_id: salon,
          service_entry_id: body.p_entry,
          amount: p.amount,
          payment_method: p.method,
          confirmation: body.p_confirmation,
          status: 'paid',
          paid_at: now,
          created_at: now,
        });
      response = body.p_entry;
    } else if (path.includes('/rpc/void_payment')) {
      const i = db.payments.findIndex((p) => p.id === body.p_payment);
      if (i >= 0) db.payments.splice(i, 1);
      response = body.p_payment;
    } else if (path.includes('/rpc/close_business_day')) {
      const cash = db.payments
          .filter((p) => p.payment_method === 'cash')
          .reduce((s, p) => s + p.amount, 0),
        cost = db.expenses
          .filter((e) => e.payment_method === 'cash')
          .reduce((s, e) => s + e.amount, 0);
      const record = {
        id: crypto.randomUUID(),
        salon_id: salon,
        closing_date: day,
        opening_cash: body.p_opening,
        cash_collected: cash,
        cash_expenses: cost,
        expected_cash: body.p_opening + cash - cost,
        counted_cash: body.p_counted,
        difference: body.p_counted - body.p_opening - cash + cost,
        gross_sales: 200,
        expenses: cost,
        services_count: 1,
        closed_by: uid,
        created_at: now,
      };
      db.daily_closings.push(record);
      response = record.id;
    } else {
      const table = path.split('/').at(-1),
        rows = db[table];
      if (!rows) {
        await route.fulfill({ status: 404, json: { message: 'Unknown fixture endpoint ' + path } });
        return;
      }
      if (req.method() === 'POST') {
        const row = {
          id: crypto.randomUUID(),
          created_at: now,
          updated_at: now,
          active: true,
          ...body,
        };
        rows.push(row);
        response = row;
      } else {
        let matching = rows.filter((r) =>
          [...url.searchParams].every(
            ([k, v]) => !v.startsWith('eq.') || String(r[k]) === v.slice(3),
          ),
        );
        if (req.method() === 'PATCH') matching.forEach((r) => Object.assign(r, body));
        if (req.method() === 'DELETE') matching.forEach(r => rows.splice(rows.indexOf(r),1));
        response = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
          ? matching[0]
          : matching;
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-expose-headers': 'content-range',
        'content-range': `0-${Math.max((Array.isArray(response) ? response.length : 1) - 1, 0)}/${Array.isArray(response) ? response.length : 1}`,
      },
      body: JSON.stringify(response ?? null),
    });
  });
  const screenshots = 'reports/figma-screenshots';
  await mkdir(screenshots, { recursive: true });
  const responsiveResults = [];
  const viewports = [
    [320, 568],
    [360, 800],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ];
  async function captureScreen(name, path) {
    await page.goto('http://127.0.0.1:4173' + path);
    await page.waitForLoadState('networkidle');
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      const result = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        brokenImages: [...document.images]
          .filter((i) => !i.complete || i.naturalWidth === 0)
          .map((i) => i.src),
        visibleText: document.body.innerText.length,
      }));
      const lastControlClear = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const nav=document.querySelector('.dc-bottom-nav')?.getBoundingClientRect();
        const controls=[...document.querySelectorAll('main button,main a,main input,main select,main textarea')].filter(el=>el.checkVisibility() && el.getBoundingClientRect().height>0);
        const last=controls.at(-1)?.getBoundingClientRect();
        const clear=!last || last.bottom <= (nav?.top ?? innerHeight)+1;
        window.scrollTo(0,0);
        return clear;
      });
      assert.ok(lastControlClear,`${name}: last control covered at ${width}`);
      responsiveResults.push({ screen: name, width, height, ...result, lastControlClear });
      assert.equal(result.overflow, false, `${name}: overflow at ${width}`);
      assert.deepEqual(result.brokenImages, [], `${name}: broken images at ${width}`);
      assert.ok(result.visibleText > 30, `${name}: missing screen content`);
      if (width === 390 || width === 1440)
        await page.screenshot({ path: `${screenshots}/${name}-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    console.log('VISUAL ' + name + ' checked at seven viewports');
  }
  const check = async (name, fn) => {
    await fn();
    passed++;
    console.log('PASS ' + name);
  };
  await check('protected route redirects to login without a session', async () => {
    await page.goto('http://127.0.0.1:4173/dashboard');
    await page.waitForURL('**/auth/login');
    assert.equal(await page.locator('input[name=mobile]').inputValue(), '');
  });
  await captureScreen('01_Login', '/auth/login');
  await check('email/password login loads salon membership', async () => {
    await page.locator('input[name=mobile]').fill('owner@example.test');
    await page.locator('input[name=pwd]').fill('test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.getByText('Salon overview').waitFor();
    assert.equal(loginCount, 1);
  });
  await check('session survives reload', async () => {
    await page.reload();
    await page.getByText('Salon overview').waitFor();
    assert.equal(loginCount, 1);
  });
  await check('create employee through existing dialog', async () => {
    await page.goto('http://127.0.0.1:4173/employees');
    await page
      .locator('button')
      .filter({ hasText: /Add team member/i })
      .last()
      .click();
    await page.locator('input[name=empName]').fill('Test Barber');
    await page.locator('input[name=empPhone]').fill('9876543210');
    await page.getByRole('button', { name: 'Add to Salon Team' }).click();
    await page.getByText('Test Barber', { exact: true }).waitFor();
    assert.equal(db.employees.length, 1);
  });
  await check('create customer through existing dialog', async () => {
    await page.goto('http://127.0.0.1:4173/customers');
    await page.getByRole('button', { name: '+ Add customer', exact: true }).first().click();
    await page.locator('input[name=custName]').fill('Test Customer');
    await page.getByRole('button', { name: 'Save Customer Record' }).click();
    await page.getByText('Test Customer', { exact: true }).waitFor();
    assert.equal(db.customers.length, 1);
  });
  await check('create service through existing dialog', async () => {
    await page.goto('http://127.0.0.1:4173/catalog/services');
    await page.getByRole('button', { name: '+ Add New Service', exact: true }).click();
    await page.locator('input[name=newServiceName]').fill('Test Haircut');
    await page.locator('input[name=newServicePrice]').fill('200');
    await page.getByRole('button', { name: 'Save service' }).click();
    await page.getByText('Test Haircut', { exact: true }).waitFor();
    assert.equal(db.services.length, 1);
  });
  await check('record service creates unpaid invoice and opens payment screen', async () => {
    await page.goto('http://127.0.0.1:4173/services/new');
    await page.getByText('Test Haircut', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await page.waitForURL('**/payments/collect?**');
    assert.equal(db.service_entries.length, 1);
    assert.equal(db.payments.length, 0);
  });
  await check('partial cash receipt preserves remaining balance', async () => {
    await page.locator('input[type=number]').last().fill('50');
    await page.locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /Confirm .* payment/ }).click();
    await page.waitForURL('**/payments');
    assert.equal(
      db.payments.reduce((s, p) => s + p.amount, 0),
      50,
    );
  });
  await check('remaining payment completes invoice', async () => {
    await page.goto(`http://127.0.0.1:4173/payments/collect?invoiceId=${db.service_entries[0].id}`);
    assert.equal(await page.locator('input[type=number]').last().inputValue(), '150');
    await page.locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /Confirm .* payment/ }).click();
    await page.waitForURL('**/payments');
    assert.equal(
      db.payments.reduce((s, p) => s + p.amount, 0),
      200,
    );
  });
  await check('owner reverses a mis-keyed receipt with a reason', async () => {
    await page.getByRole('button', { name: 'Reverse receipt' }).first().click();
    await page.getByPlaceholder('e.g. Duplicate entry').fill('keyed twice');
    await page.getByRole('button', { name: 'Confirm correction' }).click();
    for (let i = 0; i < 50 && db.payments.length !== 1; i++) await page.waitForTimeout(100);
    assert.equal(db.payments.length, 1);
    assert.equal(
      db.payments.reduce((s, p) => s + p.amount, 0),
      150,
    );
  });
  await check('expense save updates dashboard totals', async () => {
    await page.goto('http://127.0.0.1:4173/expenses/new');
    await page.locator('input[name=title]').fill('Test supplies');
    await page.locator('input[name=amount]').fill('30');
    await page.getByRole('button', { name: 'Save expense', exact: false }).click();
    await page.waitForURL('**/expenses');
    assert.equal(db.expenses.length, 1);
    await page.goto('http://127.0.0.1:4173/dashboard');
    await page.getByText('Salon overview').waitFor();
    assert.ok((await page.locator('body').innerText()).includes('200'));
  });
  await check('daily closing persists entered cash and displays reports', async () => {
    await page.goto('http://127.0.0.1:4173/closing');
    await page.getByLabel('Opening cash', { exact: true }).fill('50');
    await page.getByLabel('Counted cash', { exact: true }).fill('170');
    await page.getByRole('button', { name: 'Close Business Day', exact: true }).click();
    await page.getByText('Day Closed Successfully', { exact: true }).waitFor();
    assert.equal(db.daily_closings[0].difference, 0);
    await page.goto('http://127.0.0.1:4173/reports');
    await page.getByText('Reports & Insights', { exact: true }).waitFor();
    await page.getByText('₹200', { exact: true }).first().waitFor();
  });
  await check('mobile layout stays within viewport', async () =>
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)),
  );
  // Additional visible data belongs only to this intercepted test API.
  db.notifications.push({
    id: crypto.randomUUID(),
    salon_id: salon,
    title: 'Payment received',
    message: 'A payment was recorded for this salon.',
    type: 'payment',
    created_at: now,
    read_at: null,
  });
  db.appointments.push({
    id: crypto.randomUUID(),
    salon_id: salon,
    customer_id: db.customers[0].id,
    employee_id: db.employees[0].id,
    appointment_date: day,
    start_time: '10:30',
    end_time: '11:00',
    status: 'Booked',
    notes: 'Haircut',
    created_at: now,
  });
  const screens = [
    ['02_Dashboard', '/dashboard'],
    ['03_Add_Service', '/services/new'],
    ['04_Services___Pricing', '/catalog/services'],
    ['05_Employee_List', '/employees'],
    ['06_Employee_Profile', '/employees/' + db.employees[0].id],
    ['07_Customer_List', '/customers'],
    ['08_Customer_Profile', '/customers/' + db.customers[0].id],
    ['09_Payments', '/payments'],
    ['10_Collect_Payment', '/payments/collect?invoiceId=' + db.service_entries[0].id],
    ['11_Expenses', '/expenses'],
    ['12_Add_Expense', '/expenses/new'],
    ['13_Daily_Closing', '/closing'],
    ['14_Reports___Insights', '/reports'],
    ['15_Notifications', '/notifications'],
    ['16_Settings', '/settings'],
    ['17_Salon_Profile', '/settings/salon'],
    ['18_Appointments', '/appointments'],
  ];
  for (const [name, path] of screens) await captureScreen(name, path);
  await writeFile(
    'reports/figma-responsive-results.json',
    JSON.stringify(responsiveResults, null, 2),
  );
  await check('notifications mark read through the existing API', async () => {
    await page.goto('http://127.0.0.1:4173/notifications');
    await page.getByRole('button',{name:'Mark all read',exact:true}).click();
    await page.getByText('0 unread',{exact:true}).waitFor();
    assert.ok(db.notifications.every(n=>n.read_at));
  });
  await check('appointment edit and delete use existing handlers', async () => {
    await page.goto('http://127.0.0.1:4173/appointments');
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('input[name=rsNotes]').fill('Updated haircut');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Updated haircut',{exact:true}).waitFor();
    assert.equal(db.appointments[0].notes,'Updated haircut');
    await page.getByRole('button',{name:'Delete',exact:true}).click();
    await page.getByRole('button',{name:'Delete appointment',exact:true}).click();
    await page.getByText('No appointments scheduled.',{exact:true}).waitFor();
    assert.equal(db.appointments.length,0);
  });
  await page.goto('http://127.0.0.1:4173/catalog/services');
  await page.getByRole('button', { name: '+ Add New Service', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  console.log('PASS dialog keyboard navigation and Escape dismissal');
  await page.getByRole('button',{name:'Change language',exact:true}).click();
  await page.setViewportSize({width:320,height:568});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path: screenshots+'/marathi-320.png',fullPage:true});
  await page.getByRole('button',{name:'Change language',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:4173/settings');
  await page.getByRole('button', { name: /log\s*out/i }).click();
  await page.waitForURL('**/auth/login');
  console.log('PASS logout returns to sign-in');
  assert.deepEqual(errors, []);
  console.log(`${passed} browser checks passed (API fixture; not hosted Supabase verification).`);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
