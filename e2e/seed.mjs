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
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)])) } };
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

// --- the rest of the business, so every screen has something to draw ---
await put('suppliers', 's-pso', { name: 'PSO Depot', contact: '0459230000', vehicleNumber: 'TLB-123', driverName: 'Nawaz', driverContact: '0300', openingBalance: 100000, timestamp: d('2026-01-01') });
await put('suppliers', 's-quiet', { name: 'Quiet Supplier', contact: '', timestamp: d('2026-01-01') });
await put('purchases', 'pu-1', { supplierId: 's-pso', supplier: 'PSO Depot', fuelType: 'Diesel', volume: 10000, totalCost: 2700000, timestamp: d('2026-10-01') });
await put('purchases', 'pu-2', { supplierId: 's-pso', supplier: 'PSO Depot', fuelType: 'Petrol', volume: 5000, totalCost: 1300000, timestamp: d('2026-11-02') });
// an amount stored as text, as older records have it
await put('purchases', 'pu-text', { supplierId: 's-pso', supplier: 'PSO Depot', fuelType: 'Diesel', volume: 100, totalCost: '27000', timestamp: d('2026-11-14') });
await put('supplierPayments', 'sp-1', { supplierId: 's-pso', supplierName: 'PSO Depot', amount: 2000000, paymentMethod: 'Bank Transfer', timestamp: d('2026-10-03') });
await put('purchaseReturns', 'prt-1', { supplierId: 's-pso', supplier: 'PSO Depot', fuelType: 'Diesel', volume: 100, totalRefund: 27000, reason: 'Contaminated', timestamp: d('2026-10-04') });
await put('stockAdjustments', 'adj-1', { fuelType: 'Diesel', adjustment: -12.5, newStock: 49000, value: 3375, timestamp: d('2026-11-15') });
await put('expenses', 'e-1', { description: 'Electricity bill', category: 'Utilities', amount: 12000, timestamp: d('2026-11-02') });
await put('expenses', 'e-2', { description: 'Salary for Ehsan (October 2026)', category: 'Salaries', amount: 30000, timestamp: d('2026-11-01', '05:00:00') });
// a category that is not one of the four the form offers
await put('expenses', 'e-odd', { description: 'Generator diesel', category: 'Generator', amount: 4500, timestamp: d('2026-11-09') });
await put('otherIncomes', 'oi-1', { description: 'Tuck shop rent', category: 'Tuck Shop', amount: 15000, timestamp: d('2026-11-01') });
await put('businessPartners', 'c-partner-1', { name: 'Partner One', sharePercentage: 60, contact: '0301', timestamp: d('2026-01-01') });
await put('businessPartners', 'c-partner-2', { name: 'Partner Two', sharePercentage: 40, contact: '0302', timestamp: d('2026-01-01') });
await put('customers', 'c-partner-1', { name: 'Partner One', contact: '0301', area: 'Business Partner', isPartner: true, openingBalance: 0, timestamp: d('2026-01-01') });
await put('customers', 'c-partner-2', { name: 'Partner Two', contact: '0302', area: 'Business Partner', isPartner: true, openingBalance: 0, timestamp: d('2026-01-01') });
await put('investments', 'i-1', { partnerId: 'c-partner-1', partnerName: 'Partner One', type: 'Investment', amount: 600000, notes: 'Capital', timestamp: d('2026-01-02') });
await put('investments', 'i-2', { partnerId: 'c-partner-2', partnerName: 'Partner Two', type: 'Investment', amount: 400000, timestamp: d('2026-01-02') });
await put('investments', 'i-3', { partnerId: 'c-partner-1', partnerName: 'Partner One', type: 'Withdrawal', amount: 50000, timestamp: d('2026-06-01') });
await put('employees', 'emp-1', { name: 'Ehsan Pump Staff', mobileNumber: '03330000000', position: 'Attendant', salary: 30000, salaryHistory: [{ amount: 28000, effectiveDate: d('2025-03-01') }, { amount: 30000, effectiveDate: d('2026-01-01') }], hireDate: d('2025-03-01'), timestamp: d('2025-03-01') });
await put('employees', 'emp-2', { name: 'Zahid Cashier', position: 'Cashier', salary: 35000, hireDate: d('2024-01-01'), terminationDate: d('2026-05-31'), timestamp: d('2024-01-01') });
await put('attendance', 'at-1', { employeeId: 'emp-1', employeeName: 'Ehsan Pump Staff', date: d('2026-11-24'), status: 'Present' });
await put('attendance', 'at-2', { employeeId: 'emp-1', employeeName: 'Ehsan Pump Staff', date: d('2026-11-25'), status: 'Absent' });
await put('machines', 'm-1', { name: 'Nozzle 1', fuelType: 'Diesel', timestamp: d('2026-01-01') });
await put('machines', 'm-2', { name: 'Nozzle 2', fuelType: 'Petrol', timestamp: d('2026-01-01') });
await put('machineReadings', 'mr-1', { machineId: 'm-1', machineName: 'Nozzle 1', fuelType: 'Diesel', volume: 120000, timestamp: d('2026-11-23', '20:00:00') });
await put('machineReadings', 'mr-2', { machineId: 'm-1', machineName: 'Nozzle 1', fuelType: 'Diesel', volume: 121500, timestamp: d('2026-11-24', '20:00:00') });
await put('machineReadings', 'mr-3', { machineId: 'm-2', machineName: 'Nozzle 2', fuelType: 'Petrol', volume: 80000, timestamp: d('2026-11-24', '20:00:00') });
await put('rateHistory', 'rh-1', { productName: 'Diesel', price: 275, type: 'sale', timestamp: d('2026-10-01') });
await put('rateHistory', 'rh-2', { productName: 'Diesel', price: 280, type: 'sale', timestamp: d('2026-11-01') });
await put('bankAccounts', 'bank-1', { bankName: 'UBL', accountNumber: 'PK00TEST0000000000000001', balance: 0, timestamp: d('2026-01-01') });
await put('dictionary', 'dict-1', { key: 'udhar', value: 'credit', description: 'Sale on account', timestamp: d('2026-01-01') });
// a record with no date at all, and one whose customer name was never stored
await put('customerPayments', 'p-nodate', { customerId: 'c-dawood', amount: 100, paymentMethod: 'Cash' });
await sale('t-noname', 'walkin', undefined, 560, 'Cash', d('2026-11-13'), { isWalkIn: true, volume: undefined, product: 'Mobil Oil', fuelType: 'Mobil Oil' });

console.log('seeded', JSON.stringify({ uid: user.localId }));
