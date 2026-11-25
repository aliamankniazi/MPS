// Seeds the Firebase EMULATORS (never a real project) with a small set of books that exercises every rule.
const PROJECT = 'demo-mps';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};
async function put(collection, id, data) {
  const r = await fetch(`${FS}/${collection}/${id}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  if (!r.ok) throw new Error(`${collection}/${id}: ${r.status} ${await r.text()}`);
}
const d = (day, time = '10:00:00') => new Date(`${day}T${time}+05:00`);

// wipe
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const user = await (await fetch(AUTH, { method: 'POST', headers: OWNER, body: JSON.stringify({ email: 'owner@example.test', password: 'test-password-1', emailVerified: true }) })).json();
if (!user.localId) throw new Error('user not created: ' + JSON.stringify(user));
await put('userRoles', user.localId, { roleId: 'admin', email: 'owner@example.test' });
await put('roles', 'admin', { name: 'Admin', permissions: [] });
await put('settings', 'app-settings', { fuelPrices: { Diesel: 280, Petrol: 270 }, initialFuelStock: { Diesel: 50000, Petrol: 50000 }, colorSettings: {} });
await put('products', 'prod-diesel', { name: 'Diesel', salePrice: 280, purchasePrice: 270, unit: 'Ltr', category: 'Main Product', openingStock: 50000, currentStock: 50000, createdAt: d('2026-01-01') });
await put('products', 'prod-petrol', { name: 'Petrol', salePrice: 270, purchasePrice: 260, unit: 'Ltr', category: 'Main Product', openingStock: 50000, currentStock: 50000, createdAt: d('2026-01-01') });

const customers = {
  'c-akram': { name: 'Akram Transport', contact: '03001234567', area: 'Mianwali', openingBalance: 5000 },
  'c-bilal': { name: 'Bilal Paid Ahead', contact: '03007654321', area: 'Wan Bhachran', openingBalance: 0 },
  'c-dawood': { name: 'Dawood Twice Entered', contact: '', area: 'Mianwali', openingBalance: 1000 },
  'c-emp': { name: 'Ehsan Pump Staff', contact: '', area: 'Employee', openingBalance: 0 },
  'c-farid': { name: 'Farid Text Opening', contact: '', area: 'Mianwali', openingBalance: '2500' },
  'c-quiet': { name: 'Ghulam No Entries', contact: '', area: 'Mianwali', openingBalance: 750 },
};
for (const [id, c] of Object.entries(customers)) await put('customers', id, { ...c, isPartner: false, timestamp: d('2026-01-01') });

const sale = (id, customerId, name, amount, method, when, extra = {}) =>
  put('transactions', id, { fuelType: 'Diesel', product: 'Diesel', volume: Math.round((amount / 280) * 100) / 100, pricePerLitre: 280, totalAmount: amount, costPrice: 0, paymentMethod: method, customerId, customerName: name, notes: '', timestamp: when, ...extra });

// Akram: credit sales, a two-line sale on one instant, an OLD cash sale under his name (no walk-in flag),
// an advance, a payment, a return, and one sale in the previous month for the historical checks.
await sale('t-akram-1', 'c-akram', 'Akram Transport', 10000, 'Credit', d('2026-10-05'), { isWalkIn: false });
await sale('t-akram-2a', 'c-akram', 'Akram Transport', 2800, 'Credit', d('2026-11-03', '09:00:00'), { isWalkIn: false });
await sale('t-akram-2b', 'c-akram', 'Akram Transport', 1400, 'Credit', d('2026-11-03', '09:00:00'), { isWalkIn: false, fuelType: 'Petrol', product: 'Petrol' });
await sale('t-akram-cash', 'c-akram', 'Akram Transport', 4000, 'Cash', d('2026-11-04'));
await put('cashAdvances', 'a-akram-1', { customerId: 'c-akram', customerName: 'Akram Transport', amount: 1500, notes: 'Road expense', timestamp: d('2026-11-05') });
await put('customerPayments', 'p-akram-1', { customerId: 'c-akram', customerName: 'Akram Transport', amount: 8000, paymentMethod: 'Cash', notes: '', timestamp: d('2026-11-07') });
await put('saleReturns', 'r-akram-1', { customerId: 'c-akram', customerName: 'Akram Transport', fuelType: 'Diesel', volume: 2, totalRefund: 560, reason: 'Short measure', timestamp: d('2026-11-08') });

// Bilal: paid more than he bought.
await sale('t-bilal-1', 'c-bilal', 'Bilal Paid Ahead', 3000, 'Credit', d('2026-11-02'), { isWalkIn: false });
await put('customerPayments', 'p-bilal-1', { customerId: 'c-bilal', customerName: 'Bilal Paid Ahead', amount: 5000, paymentMethod: 'Cash', notes: '', timestamp: d('2026-11-06') });

// Dawood: the same payment entered twice.
await sale('t-dawood-1', 'c-dawood', 'Dawood Twice Entered', 6000, 'Credit', d('2026-11-02'), { isWalkIn: false });
await put('customerPayments', 'p-dawood-1', { customerId: 'c-dawood', customerName: 'Dawood Twice Entered', amount: 2000, paymentMethod: 'Cash', notes: '', timestamp: d('2026-11-09') });
await put('customerPayments', 'p-dawood-2', { customerId: 'c-dawood', customerName: 'Dawood Twice Entered', amount: 2000, paymentMethod: 'Cash', notes: '', timestamp: d('2026-11-09') });

// Employee: an advance, then salary posted to the account.
await put('cashAdvances', 'a-emp-1', { customerId: 'c-emp', customerName: 'Ehsan Pump Staff', amount: 7000, notes: 'Advance', timestamp: d('2026-11-10') });
await put('customerPayments', 'p-emp-1', { customerId: 'c-emp', customerName: 'Ehsan Pump Staff', amount: 30000, paymentMethod: 'Salary', notes: 'Salary for Ehsan (October 2026)', timestamp: d('2026-11-01', '05:00:00') });

// Farid: opening balance stored as text, one amount stored as text.
await sale('t-farid-1', 'c-farid', 'Farid Text Opening', '1200', 'Credit', d('2026-11-11'), { isWalkIn: false });

// Walk-in sales, and a payment for a customer that was deleted.
await sale('t-walkin-1', 'walkin', 'Walk-in Customer', 5600, 'Cash', d('2026-11-12'), { isWalkIn: true });
await put('customerPayments', 'p-orphan-1', { customerId: 'c-deleted', customerName: 'Deleted Customer', amount: 900, paymentMethod: 'Cash', notes: '', timestamp: d('2026-11-12') });

console.log('seeded', JSON.stringify({ uid: user.localId }));
