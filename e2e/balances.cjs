// Saves entries through the real screens and checks every screen moves together.
const { chromium } = require('playwright');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const BASE = 'http://127.0.0.1:3100';
const OUT = process.env.OUT_DIR || require('os').tmpdir();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror ${page.url()}] ${e.message}`));
  const text = () => page.evaluate(() => document.body.innerText);
  const open = async (path, wait = 2500) => { await page.goto(`${BASE}${path}`); await page.waitForTimeout(wait); return text(); };

  await page.goto(`${BASE}/login`);
  await page.fill('#email', 'owner@example.test');
  await page.fill('#password', 'test-password-1');
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
  await page.evaluate(() => { localStorage.setItem('global_lastCustomerId', 'c-akram'); localStorage.removeItem('global_date_from'); localStorage.removeItem('global_date_to'); });

  // 1. A payment saved on the payment screen moves the balance at once, there and everywhere.
  let t = await open('/customer-payments', 3500);
  check('payment screen shows the current balance before saving', /Bal: PKR 12,140/.test(t));
  await page.fill('#amount', '1000');
  t = await text();
  check('payment preview: new balance 11,140.00', /New Account Balance\s*PKR 11,140\.00/.test(t), (t.match(/New Account Balance\s*PKR [\d,.-]+/) || [''])[0]);
  await page.fill('#pin', '0200');
  await page.click('button[type=submit]');
  await page.waitForTimeout(1500);
  t = await text();
  check('balance on the payment screen updates immediately after saving', /Bal: PKR 11,140/.test(t), (t.match(/Bal: PKR [\d,.-]+/) || [''])[0]);
  t = await open('/customers');
  check('customers list shows 11,140.00 after the payment', /Akram Transport[\s\S]{0,60}?Balance: PKR 11,140\.00/.test(t));
  check('total receivable follows: 18,490.00', /PKR 18,490\.00/.test(t));
  t = await open('/customers/c-akram/ledger');
  check('ledger closing shows 11,140', /PKR 11,140/.test(t));
  t = await open('/defaulter-report');
  check('defaulter report shows 11,140.00', /11,140\.00/.test(t));

  // 2. New Transaction screen: balance, a sale saved, customer switching.
  t = await open('/sales', 3500);
  check('sale screen shows the current balance', /Bal: PKR 11,140/.test(t));
  await page.getByRole('button', { name: /Select product/ }).click();
  await page.getByRole('option', { name: 'Diesel' }).click();
  await page.locator('input[name="quantity"]').fill('10');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForTimeout(500);
  t = await text();
  const preview = (t.match(/New Balance\s*PKR [\d,.-]+/) || [''])[0];
  check('sale preview: previous 11,140.00 + invoice 2,800.00 = 13,940.00', /Previous Balance\s*PKR 11,140\.00/.test(t) && /New Balance\s*PKR 13,940\.00/.test(t), preview);
  await page.locator('input[name="pin"]').fill('0200');
  await page.getByRole('button', { name: 'Complete & Print' }).click();
  await page.waitForTimeout(1500);
  t = await text();
  check('balance on the sale screen updates immediately after saving', /Bal: PKR 13,940/.test(t), (t.match(/Bal: PKR [\d,.-]+/) || [''])[0]);
  // switch customer
  await page.getByRole('combobox').filter({ hasText: 'Akram Transport' }).click();
  await page.getByRole('option', { name: /Bilal Paid Ahead/ }).click();
  await page.waitForTimeout(500);
  t = await text();
  check('switching customer shows that customer’s balance', /Bal: PKR -2,000/.test(t) && !/Bal: PKR 13,940/.test(t), (t.match(/Bal: PKR [\d,.-]+/) || [''])[0]);
  await page.getByRole('combobox').filter({ hasText: 'Bilal Paid Ahead' }).click();
  await page.waitForTimeout(500);
  if (OUT) await page.screenshot({ path: `${OUT}/sales-combobox.png` });
  await page.getByRole('option', { name: 'Walk-in', exact: true }).click();
  await page.waitForTimeout(400);
  t = await text();
  check('switching to walk-in shows no balance', !/Bal: PKR/.test(t));

  // 3. Every screen again, after the sale.
  t = await open('/customers');
  check('customers list shows 13,940.00 after the sale', /Akram Transport[\s\S]{0,60}?Balance: PKR 13,940\.00/.test(t));
  t = await open('/balance-audit');
  check('audit: still all verified', /All 8 balances verified/.test(t));
  check('audit shows 13,940.00', /13,940\.00/.test(t));
  check('audit total owed 21,290.00', /PKR 21,290\.00/.test(t));

  // 4. Historical: last month on the ledger.
  await open('/customers/c-akram/ledger');
  await page.getByRole('combobox').filter({ hasText: 'Quick Period' }).click();
  await page.getByRole('option', { name: 'Last Month' }).click();
  await page.waitForTimeout(600);
  t = await text();
  check('ledger last month: opening 5,000, closing 15,000, and it says what the balance is today', /PKR 5,000/.test(t) && /PKR 15,000/.test(t) && /Balance today[^\n]*PKR 13,940/.test(t));
  if (OUT) await page.screenshot({ path: `${OUT}/ledger-last-month.png`, fullPage: true });
  await page.getByRole('combobox').filter({ hasText: /Last Month|Quick Period/ }).click();
  await page.getByRole('option', { name: 'All Time' }).click();
  await page.waitForTimeout(600);
  t = await text();
  check('ledger all time: opening 5,000 and closing 13,940', /PKR 5,000/.test(t) && /PKR 13,940/.test(t));

  // 5. Statement to Excel: same figures.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()]);
  const xlsPath = `${OUT}/statement.xlsx`; await dl.saveAs(xlsPath);
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(xlsPath).Sheets['Statement']);
  const first = rows[0], last = rows[rows.length - 1];
  check('Excel statement opens on 5,000 and closes on 13,940', first.Description === 'Opening Balance' && first.Balance === 5000 && last.Description === 'Closing Balance' && last.Balance === 13940, `${dl.suggestedFilename()} rows=${rows.length}`);
  const body = rows.slice(1, -1);
  const sum = (k) => Math.round(body.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 100) / 100;
  check('Excel statement: opening + debits − credits = closing', Math.round((5000 + sum('Debit') - sum('Credit')) * 100) / 100 === 13940 && last.Debit === sum('Debit') && last.Credit === sum('Credit'), `debit ${sum('Debit')} credit ${sum('Credit')}`);

  // 6. Credit recovery for November, and its Excel.
  await page.evaluate(() => { localStorage.setItem('global_date_from', new Date('2026-11-01T00:00:00').toISOString()); localStorage.setItem('global_date_to', new Date('2026-11-30T00:00:00').toISOString()); });
  t = await open('/credit-recovery');
  if (OUT) await page.screenshot({ path: `${OUT}/credit-recovery.png`, fullPage: true });
  const line = t.split('\n').find((l) => /Akram Transport/.test(l)) || '';
  check('credit recovery (November): opening 15,000.00 and current 13,940.00', /15,000\.00/.test(t) && /13,940\.00/.test(t), line.replace(/\s+/g, ' ').slice(0, 160));
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Excel|Export/ }).first().click()]);
  const recPath = `${OUT}/recovery.xlsx`; await dl2.saveAs(recPath);
  const rec = XLSX.utils.sheet_to_json(XLSX.readFile(recPath).Sheets['CreditRecoveryReport']).find((r) => r['Customer Name'] === 'Akram Transport');
  check('credit recovery Excel carries the same figures', rec && rec['Opening Balance (PKR)'] === '15000.00' && rec['Current Balance (PKR)'] === '13940.00', JSON.stringify(rec));
  await page.evaluate(() => { localStorage.removeItem('global_date_from'); localStorage.removeItem('global_date_to'); });

  // 7. Unified ledger with the customer selected.
  await open('/partner-ledger');
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Akram Transport/ }).click();
  await page.waitForTimeout(700);
  t = await text();
  if (OUT) await page.screenshot({ path: `${OUT}/unified-ledger.png`, fullPage: true });
  check('unified ledger total balance 13,940 (it used to leave the opening balance out)', /Total Balance\s*PKR 13,940/.test(t), (t.match(/Total Balance\s*PKR [\d,.-]+/) || [''])[0]);
  check('unified ledger newest row balance 13940.00', /13940\.00/.test(t));

  // 8. Invoice of the new sale: previous 11,140, current 13,940.
  t = await open('/all-invoices');
  t = await open('/invoice/customerpayment/p-akram-1');
  check('payment receipt: previous 20,700 and current 12,700', /RS 20,700/.test(t) && /RS 12,700/.test(t), (t.match(/RS [\d,]+/g) || []).join(' '));

  // 9. Audit to Excel.
  await open('/balance-audit');
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()]);
  const audPath = `${OUT}/audit.xlsx`; await dl3.saveAs(audPath);
  const wb = XLSX.readFile(audPath);
  const bal = XLSX.utils.sheet_to_json(wb.Sheets['Balances']);
  const ak = bal.find((r) => r.Customer === 'Akram Transport');
  check('audit Excel: Akram closing 13,940, verified, with what it used to show', ak && ak['Closing Balance'] === 13940 && ak.Verified === 'Yes' && ak['Was on customers list'] === 18500, JSON.stringify(ak));
  check('audit Excel has Summary, Balances and Findings sheets', ['Summary', 'Balances', 'Findings'].every((n) => wb.SheetNames.includes(n)), `${bal.length} customers, ${XLSX.utils.sheet_to_json(wb.Sheets['Findings']).length} findings`);

  // 10. Full backup: complete, and its fingerprint is true.
  const [dl4] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'Download full backup' }).click()]);
  const bkPath = `${OUT}/${dl4.suggestedFilename()}`; await dl4.saveAs(bkPath);
  const raw = fs.readFileSync(bkPath, 'utf8');
  const bk = JSON.parse(raw);
  const collectionsText = raw.slice(raw.indexOf(',"collections":') + ',"collections":'.length, -1);
  const sha = crypto.createHash('sha256').update(collectionsText, 'utf8').digest('hex');
  check('backup fingerprint matches the file', sha === bk.sha256, `${dl4.suggestedFilename()} ${bk.documents} records`);
  check('backup holds every collection and the saved entries', bk.counts.customers === 8 && bk.counts.transactions === 10 && bk.counts.customerPayments === 8 && bk.counts.saleReturns === 1 && bk.counts.cashAdvances === 2 && 'recycleBin' in bk.counts && 'roles' in bk.counts, JSON.stringify(bk.counts));
  const ts = bk.collections.customerPayments.find((d) => d.id === 'p-akram-1').data.timestamp;
  check('backup keeps timestamps exact', Array.isArray(ts.$ts) && ts.$ts.length === 2, JSON.stringify(ts));
  await page.waitForTimeout(500);
  t = await text();
  check('page shows the backup fingerprint', t.includes(bk.sha256));

  // 11. Editing: the record being edited is not counted twice.
  t = await open('/sales?edit=t-akram-1', 3500);
  check('editing a 10,000 sale: previous 3,940.00, new 13,940.00', /Previous Balance\s*PKR 3,940\.00/.test(t) && /New Balance\s*PKR 13,940\.00/.test(t), (t.match(/(Previous|New) Balance\s*PKR [\d,.-]+/g) || []).join(' | ').replace(/\s+/g, ' '));

  // 11b. Suppliers: one figure everywhere, and "Edit" edits.
  const emulatorDocs = async (name) => {
    const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-mps/databases/(default)/documents/${name}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
    return ((await r.json()).documents || []).map((d) => ({ id: d.name.split('/').pop(), fields: d.fields }));
  };
  const numberField = (f) => Number(f?.integerValue ?? f?.doubleValue ?? f?.stringValue);
  // opening 100,000 + purchases 2,700,000 + 1,300,000 + 27,000 (stored as text) - payment 2,000,000 - return 27,000
  t = await open('/customers/s-pso/ledger');
  await page.getByRole('combobox').filter({ hasText: 'Quick Period' }).click();
  await page.getByRole('option', { name: 'All Time' }).click();
  await page.waitForTimeout(600);
  t = await text();
  check('supplier ledger: opening 100,000, closing 2,100,000, and it lists the purchase return', /PKR 100,000/.test(t) && /PKR 2,100,000/.test(t) && /Return: 100\.00L of Diesel/.test(t));
  await page.evaluate(() => { localStorage.setItem('global_date_from', new Date('2026-01-01T00:00:00').toISOString()); localStorage.setItem('global_date_to', new Date('2026-12-31T00:00:00').toISOString()); });
  t = await open('/supplier-report');
  check('supplier report shows the same 2,100,000.00 (it used to leave out the opening balance and returns)', /2,100,000\.00/.test(t), (t.split('\n').find((l) => /PSO Depot/.test(l)) || '').replace(/\s+/g, ' ').slice(0, 140));
  await page.evaluate(() => { localStorage.removeItem('global_date_from'); localStorage.removeItem('global_date_to'); });
  t = await open('/supplier-payments?edit=sp-1', 3500);
  check('editing a supplier payment opens THAT payment: previous 4,100,000.00, new 2,100,000.00', /Edit Supplier Payment/.test(t) && /4100000\.00 PKR/.test(t) && /2100000\.00 PKR/.test(t), (t.match(/[\d.]+ PKR/g) || []).join(' | '));
  await page.fill('#amount', '1900000');
  await page.fill('#pin', '0200');
  await page.getByRole('button', { name: 'Update Payment' }).click();
  await page.waitForTimeout(1500);
  let pays = await emulatorDocs('supplierPayments');
  check('saving the edit changes that payment and adds none', pays.length === 1 && numberField(pays[0].fields.amount) === 1900000, `${pays.length} supplier payment(s), amount ${numberField(pays[0]?.fields.amount)}`);
  t = await open('/supplier-payments', 3000);
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /PSO Depot/ }).click();
  await page.waitForTimeout(500);
  t = await text();
  check('supplier payment screen shows what is owed after the edit: 2,200,000.00', /2200000\.00 PKR/.test(t), (t.match(/[\d.]+ PKR/g) || []).join(' | '));
  // a partner's withdrawal: Edit edits
  await open('/investments?edit=i-3', 3500);
  const amountBox = page.locator('input[name="amount"]').last();
  check('editing a partner withdrawal opens that entry', (await amountBox.inputValue()) === '50000', await amountBox.inputValue());
  await amountBox.fill('60000');
  await page.locator('input[name="pin"]').last().fill('0200');
  await page.getByRole('button', { name: 'Update Transaction' }).click();
  await page.waitForTimeout(1500);
  const invs = await emulatorDocs('investments');
  check('saving it changes that entry and adds none', invs.length === 3 && numberField(invs.find((i) => i.id === 'i-3').fields.amount) === 60000, `${invs.length} entries, i-3 = ${numberField(invs.find((i) => i.id === 'i-3')?.fields.amount)}`);

  // 12. Offline: the notice appears.
  await open('/customers');
  await ctx.setOffline(true);
  let offlineSeen = false;
  for (let i = 0; i < 25 && !offlineSeen; i++) { await page.waitForTimeout(1000); offlineSeen = /Showing the copy saved on this device/.test(await text()); }
  check('going offline shows the "saved copy" notice', offlineSeen);
  await ctx.setOffline(false);
  let back = false;
  for (let i = 0; i < 30 && !back; i++) { await page.waitForTimeout(1000); back = !/Showing the copy saved on this device/.test(await text()); }
  check('the notice clears when the server answers again', back);

  // 13. A phone.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, storageState: await ctx.storageState() });
  const p2 = await phone.newPage();
  await p2.goto(`${BASE}/login`);
  await p2.fill('#email', 'owner@example.test'); await p2.fill('#password', 'test-password-1'); await p2.click('button[type=submit]');
  await p2.waitForURL(`${BASE}/`, { timeout: 30000 });
  await p2.goto(`${BASE}/balance-audit`); await p2.waitForTimeout(2500);
  const pt = await p2.evaluate(() => document.body.innerText);
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (OUT) await p2.screenshot({ path: `${OUT}/phone-audit.png`, fullPage: true });
  check('phone: audit shows the same 13,940.00 and total 21,290.00', /13,940\.00/.test(pt) && /21,290\.00/.test(pt));
  check('phone: no sideways page scroll', overflow <= 1, `overflow ${overflow}px`);
  await p2.goto(`${BASE}/customers`); await p2.waitForTimeout(2500);
  check('phone: customers list shows 13,940.00', /13,940\.00/.test(await p2.evaluate(() => document.body.innerText)));

  console.log('\nerrors:', errors.length ? '\n' + errors.join('\n') : 'none');
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
