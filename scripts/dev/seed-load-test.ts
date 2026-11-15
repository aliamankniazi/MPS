/**
 * Fills the LOCAL database with made-up records, to see how the app behaves
 * with a realistic amount of history. Every id starts with "load-" so the
 * made-up records can be told apart from anything real.
 *
 *   npx tsx --env-file=.env.local scripts/dev/seed-load-test.ts
 *   ... --scale 0.5      half as many
 *
 * It only ever runs against this PC: there is no way to point it elsewhere.
 */
import { connect, databaseUrl } from '../../src/server/db/client';
import { argValue, checkTarget } from '../../src/server/db/remote-guard';
import { lockDocuments, pullChanges, pullToJson, writeChanges, type Change } from '../../src/server/sync/documents';

// A fixed-seed generator, so every run produces the same records.
let seed = 20261115;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (min: number, max: number) => min + random() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

const START = Date.parse('2025-07-01T00:00:00Z');
const END = Date.parse('2026-11-15T00:00:00Z');
const when = () => new Date(between(START, END)).toISOString();

const FUELS = [
  { name: 'Hi-Speed Diesel', sale: 285.5, cost: 278.25, unit: 'Litre' },
  { name: 'Premier', sale: 272.89, cost: 265.4, unit: 'Litre' },
  { name: 'Euro 5', sale: 290.1, cost: 282.6, unit: 'Litre' },
] as const;
const EXTRAS = [
  { name: 'Mobil Oil 4L', sale: 5200, cost: 4700, unit: 'Can' },
  { name: 'Brake Oil', sale: 850, cost: 700, unit: 'Bottle' },
  { name: 'Coolant', sale: 1200, cost: 980, unit: 'Bottle' },
] as const;
const METHODS = ['Cash', 'Cash', 'Cash', 'Credit', 'Card', 'Mobile', 'Bank Transfer'] as const;

async function main() {
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set');
  checkTarget(url, undefined); // this PC only, no override
  const scale = Number(argValue(process.argv, '--scale') ?? '1');
  const count = (n: number) => Math.max(1, Math.round(n * scale));

  const changes: Change[] = [];
  const add = (collection: string, n: number, data: Record<string, unknown>) => changes.push({ path: `${collection}/load-${collection}-${n}`, data });

  const customers = Array.from({ length: count(300) }, (_, i) => ({ id: `load-customers-${i}`, name: `Load Customer ${i}` }));
  customers.forEach((c, i) => add('customers', i, { name: c.name, contact: `92300${String(1000000 + i)}`, vehicleNumber: `MNI-${1000 + i}`, area: pick(['Mianwali City', 'Wan Bhachran', 'Kundian', 'Isa Khel']), isPartner: false, openingBalance: i % 7 === 0 ? Math.round(between(0, 50000)) : 0, timestamp: when() }));
  const suppliers = Array.from({ length: count(15) }, (_, i) => ({ id: `load-suppliers-${i}`, name: `Load Supplier ${i}` }));
  suppliers.forEach((s, i) => add('suppliers', i, { name: s.name, contact: `92333${String(1000000 + i)}`, openingBalance: 0, timestamp: when() }));
  [...FUELS, ...EXTRAS].forEach((p, i) => add('products', i, { name: p.name, salePrice: p.sale, purchasePrice: p.cost, unit: p.unit, category: i < FUELS.length ? 'Main Product' : 'Supplementary Product', openingStock: 0, currentStock: 0, createdAt: when() }));
  const employees = Array.from({ length: count(12) }, (_, i) => ({ id: `load-employees-${i}`, name: `Load Employee ${i}` }));
  employees.forEach((e, i) => add('employees', i, { name: e.name, position: pick(['Attendant', 'Manager', 'Cashier']), salary: 25000 + i * 1500, salaryHistory: [{ amount: 25000 + i * 1500, effectiveDate: '2025-07-01T00:00:00.000Z' }], hireDate: '2025-07-01T00:00:00.000Z', timestamp: when() }));
  for (let i = 0; i < 3; i++) add('bankAccounts', i, { bankName: pick(['UBL', 'HBL', 'MCB']), accountNumber: `0327${String(100000 + i)}`, balance: 0, timestamp: when() });
  for (let i = 0; i < 8; i++) add('machines', i, { name: `Machine ${i + 1}`, fuelType: FUELS[i % FUELS.length].name, timestamp: when() });
  for (let i = 0; i < 3; i++) add('businessPartners', i, { name: `Load Partner ${i}`, sharePercentage: [50, 30, 20][i], timestamp: when() });

  for (let i = 0; i < count(40000); i++) {
    const product = random() < 0.9 ? pick(FUELS) : pick(EXTRAS);
    const volume = round2(product.unit === 'Litre' ? between(2, 120) : Math.ceil(between(0, 3)));
    const method = pick(METHODS);
    const customer = method === 'Credit' || random() < 0.2 ? pick(customers) : undefined;
    add('transactions', i, {
      fuelType: product.name, product: product.name, volume, pricePerLitre: product.sale, costPrice: product.cost,
      totalAmount: round2(volume * product.sale), paymentMethod: method,
      ...(customer ? { customerId: customer.id, customerName: customer.name } : {}), timestamp: when(),
    });
  }
  for (let i = 0; i < count(8000); i++) { const c = pick(customers); add('customerPayments', i, { customerId: c.id, customerName: c.name, amount: Math.round(between(500, 60000)), paymentMethod: pick(['Cash', 'Bank Transfer']), timestamp: when() }); }
  for (let i = 0; i < count(1500); i++) { const s = pick(suppliers); const f = pick(FUELS); const volume = Math.round(between(5000, 30000)); add('purchases', i, { supplierId: s.id, supplier: s.name, fuelType: f.name, volume, totalCost: round2(volume * f.cost), timestamp: when() }); }
  for (let i = 0; i < count(1200); i++) { const s = pick(suppliers); add('supplierPayments', i, { supplierId: s.id, supplierName: s.name, amount: Math.round(between(100000, 3000000)), paymentMethod: 'Bank Transfer', timestamp: when() }); }
  for (let i = 0; i < count(5000); i++) add('expenses', i, { description: `Load expense ${i}`, category: pick(['Utilities', 'Salaries', 'Maintenance', 'Other']), amount: Math.round(between(100, 40000)), timestamp: when() });
  for (let i = 0; i < count(800); i++) add('otherIncomes', i, { description: `Load income ${i}`, category: pick(['Service Station', 'Tire Shop', 'Tuck Shop', 'Other']), amount: Math.round(between(200, 15000)), timestamp: when() });
  for (let i = 0; i < count(2000); i++) { const c = pick(customers); add('cashAdvances', i, { customerId: c.id, customerName: c.name, amount: Math.round(between(500, 20000)), timestamp: when() }); }
  for (let i = 0; i < count(3000); i++) { const m = Math.floor(random() * 8); add('machineReadings', i, { machineId: `load-machines-${m}`, machineName: `Machine ${m + 1}`, fuelType: FUELS[m % FUELS.length].name, volume: round2(between(200, 4000)), timestamp: when() }); }
  for (let i = 0; i < count(3000); i++) { const e = pick(employees); add('attendance', i, { employeeId: e.id, employeeName: e.name, date: when(), status: pick(['Present', 'Present', 'Present', 'Absent', 'Leave']) }); }
  for (let i = 0; i < count(400); i++) { const p = pick(FUELS); add('rateHistory', i, { productName: p.name, price: round2(p.sale + between(-15, 15)), type: pick(['sale', 'purchase']), timestamp: when() }); }

  const { db, pool } = connect(url);
  try {
    const started = Date.now();
    for (let i = 0; i < changes.length; i += 500) {
      await db.transaction(async (tx) => {
        await lockDocuments(tx);
        await writeChanges(tx, changes.slice(i, i + 500));
      });
    }
    console.log(`wrote ${changes.length} made-up records in ${((Date.now() - started) / 1000).toFixed(1)}s`);

    // How long does a brand-new device take to fetch everything from the server?
    let cursor = 0, pages = 0, bytes = 0, biggest = 0, records = 0;
    const pullStarted = Date.now();
    for (;;) {
      const page = await pullChanges(db, cursor);
      const size = Buffer.byteLength(pullToJson(page));
      pages++; bytes += size; biggest = Math.max(biggest, size); records += page.docs.length; cursor = page.cursor;
      if (!page.more) break;
    }
    console.log(`full fetch: ${records} records in ${pages} pages, ${(bytes / 1e6).toFixed(1)} MB total, largest page ${(biggest / 1e6).toFixed(2)} MB, ${((Date.now() - pullStarted) / 1000).toFixed(1)}s (database on this PC)`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[seed] stopped:', e instanceof Error ? e.message.split('params:')[0] : e);
  process.exit(1);
});
