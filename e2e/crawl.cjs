// Opens EVERY screen of the app against the seeded emulator and reports any that crash or log an error.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const OUT = process.env.OUT_DIR;

const appDir = path.join(__dirname, '..', 'src', 'app');
const routes = fs.readdirSync(appDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(appDir, d.name, 'page.tsx')) && !['login', 'signup'].includes(d.name))
  .map((d) => `/${d.name}`);
routes.unshift('/');
// screens that take an id or open a record for editing
routes.push(
  '/customers/c-akram/ledger', '/customers/s-pso/ledger', '/customers/c-partner-1/ledger', '/customers/c-emp/ledger', '/customers/does-not-exist/ledger',
  '/invoice/sale/t-akram-1', '/invoice/sale/t-noname', '/invoice/purchase/pu-1', '/invoice/purchase/pu-text', '/invoice/customerpayment/p-akram-1', '/invoice/customerpayment/p-nodate',
  '/invoice/cashadvance/a-akram-1', '/invoice/expense/e-1', '/invoice/salary/p-emp-1', '/invoice/investment/i-1', '/invoice/otherincome/oi-1', '/invoice/meterreading/mr-2', '/invoice/sale/missing',
  '/sales?edit=t-akram-1', '/customer-payments?edit=p-akram-1', '/cash-advances?edit=a-akram-1', '/sale-returns?edit=r-akram-1', '/purchases?edit=pu-1', '/purchase-returns?edit=prt-1',
  '/supplier-payments?edit=sp-1', '/expenses?edit=e-odd', '/other-incomes?edit=oi-1', '/investments?edit=i-1',
);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  let current = '';
  const problems = [];
  page.on('pageerror', (e) => problems.push({ route: current, kind: 'crash', text: e.message.slice(0, 300) }));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|Failed to load resource|net::ERR|Download the React DevTools/i.test(t)) return;
    // The AI summary needs a Google API key; without one the page shows its own error card. Not a fault of the screen.
    if (current === '/ai-summary' && /Server Components render/.test(t)) return;
    problems.push({ route: current, kind: 'console', text: t.slice(0, 300) });
  });
  await page.goto(`${BASE}/login`);
  await page.fill('#email', 'owner@example.test');
  await page.fill('#password', 'test-password-1');
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
  // a wide date range, so date-filtered screens draw their rows
  await page.evaluate(() => { localStorage.setItem('global_date_from', new Date('2026-10-01T00:00:00').toISOString()); localStorage.setItem('global_date_to', new Date('2026-11-30T00:00:00').toISOString()); localStorage.setItem('global_lastCustomerId', 'c-akram'); });

  let bad = 0;
  for (const route of routes) {
    current = route;
    const before = problems.length;
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const text = await page.evaluate(() => document.body.innerText);
    const crashed = /Application error|client-side exception/i.test(text);
    const garbage = (text.match(/\bNaN\b|\bundefined\b|\[object Object\]|Invalid Date/g) || []);
    if (crashed) problems.push({ route, kind: 'crash', text: 'the screen shows "Application error"' });
    if (garbage.length) problems.push({ route, kind: 'garbage', text: `shows ${[...new Set(garbage)].join(', ')} (${garbage.length}×)` });
    const mine = problems.slice(before);
    if (mine.length) bad++;
    console.log(`${mine.length ? 'FAIL' : 'ok  '}  ${route}${mine.length ? '\n' + mine.map((p) => `        [${p.kind}] ${p.text}`).join('\n') : ''}`);
    if (OUT && mine.length) await page.screenshot({ path: `${OUT}/crawl${route.replace(/[^a-z0-9]+/gi, '_')}.png` });
  }
  console.log(`\n${routes.length - bad}/${routes.length} screens clean`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
