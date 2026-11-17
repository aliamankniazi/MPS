import { describe, expect, it } from 'vitest';
import type { Employee, Expense } from '../../src/lib/types';
import {
  changeEmployeeStatus,
  currentSalary,
  employedOn,
  findSalaryPayment,
  formerEmployeeNamed,
  isActiveEmployee,
  isRestoredEmployee,
  LifecycleError,
  payrollPeriodKey,
  rejoiningDateOf,
  reviseSalary,
  salaryHistoryOf,
  salaryOn,
  statusOf,
} from '../../src/lib/employee-lifecycle';

const day = (s: string) => new Date(`${s}T12:00:00`);
const NOW = day('2026-11-17');
const OWNER = 'owner@example.com';

const employee = (over: Partial<Employee> = {}): Employee => ({
  id: 'e1',
  name: 'Zeeshan',
  position: 'Attendant',
  salary: 15000,
  salaryHistory: [{ amount: 15000, effectiveDate: '2025-07-01' }],
  hireDate: '2025-07-01',
  timestamp: '2025-07-01T00:00:00.000Z',
  ...over,
});

/** Applies a change the way the screen does: merge the returned fields onto the record. */
const apply = (e: Employee, updates: Partial<Employee> & { terminationDate?: string | null }): Employee => ({ ...e, ...updates });

describe('status', () => {
  it('a record from before statuses existed is Active, or Terminated if it has a leaving date', () => {
    expect(statusOf(employee())).toBe('Active');
    expect(statusOf(employee({ terminationDate: '2026-01-31' }))).toBe('Terminated');
    expect(isActiveEmployee(employee())).toBe(true);
  });

  it('suspending records everything asked for, and keeps the record', () => {
    const before = employee();
    const updates = changeEmployeeStatus(before, { newStatus: 'Suspended', effectiveDate: '2026-11-10', reason: 'Cash shortage under inquiry', remarks: 'Review in two weeks', performedBy: OWNER }, NOW);
    const after = apply(before, updates);

    expect(after.status).toBe('Suspended');
    expect(after.id).toBe('e1');
    expect(after.statusHistory).toHaveLength(1);
    expect(after.statusHistory![0]).toMatchObject({
      previousStatus: 'Active',
      newStatus: 'Suspended',
      effectiveDate: '2026-11-10',
      changeDate: NOW.toISOString(),
      reason: 'Cash shortage under inquiry',
      remarks: 'Review in two weeks',
      performedBy: OWNER,
    });
    expect(after.terminationDate).toBe('2026-11-10');
    expect(isActiveEmployee(after)).toBe(false);
    // Nothing about pay, hire date or salary history was touched.
    expect(after.salary).toBe(15000);
    expect(after.salaryHistory).toEqual(before.salaryHistory);
    expect(after.hireDate).toBe('2025-07-01');
  });

  it('dismissal and termination work the same way and add to the history', () => {
    let e = employee();
    e = apply(e, changeEmployeeStatus(e, { newStatus: 'Suspended', effectiveDate: '2026-10-01', reason: 'Inquiry', performedBy: OWNER }, day('2026-10-01')));
    e = apply(e, changeEmployeeStatus(e, { newStatus: 'Dismissed', effectiveDate: '2026-10-20', reason: 'Inquiry concluded', performedBy: OWNER }, day('2026-10-20')));
    expect(e.status).toBe('Dismissed');
    expect(e.statusHistory!.map((c) => [c.previousStatus, c.newStatus])).toEqual([
      ['Active', 'Suspended'],
      ['Suspended', 'Dismissed'],
    ]);

    const t = apply(employee(), changeEmployeeStatus(employee(), { newStatus: 'Terminated', effectiveDate: '2026-09-30', reason: 'Resigned', performedBy: OWNER }, NOW));
    expect(t.status).toBe('Terminated');
    expect(t.statusHistory![0].previousStatus).toBe('Active');
  });

  it('refuses a change that makes no sense', () => {
    const e = employee();
    const base = { newStatus: 'Suspended' as const, effectiveDate: '2026-11-10', reason: 'x', performedBy: OWNER };
    expect(() => changeEmployeeStatus(e, { ...base, newStatus: 'Active' }, NOW)).toThrow(/already Active/);
    expect(() => changeEmployeeStatus(e, { ...base, reason: '  ' }, NOW)).toThrow(/reason/i);
    expect(() => changeEmployeeStatus(e, { ...base, effectiveDate: '' }, NOW)).toThrow(/effective date/i);
    expect(() => changeEmployeeStatus(e, { ...base, effectiveDate: '2025-01-01' }, NOW)).toThrow(/before .* was hired/);
    expect(() => changeEmployeeStatus(e, { ...base, performedBy: '' }, NOW)).toThrow(LifecycleError);

    const suspended = apply(e, changeEmployeeStatus(e, base, NOW));
    expect(() => changeEmployeeStatus(suspended, { ...base, newStatus: 'Dismissed', effectiveDate: '2026-11-01' }, NOW)).toThrow(/before the last status change/);
  });
});

describe('restore', () => {
  const dismissed = () => {
    const e = employee();
    return apply(e, changeEmployeeStatus(e, { newStatus: 'Dismissed', effectiveDate: '2026-03-15', reason: 'Absent without leave', performedBy: OWNER }, day('2026-03-15')));
  };

  it('brings the same person back: Active again, rejoining date recorded, nothing lost', () => {
    const before = dismissed();
    const after = apply(before, changeEmployeeStatus(before, { newStatus: 'Active', effectiveDate: '2026-09-01', reason: 'Rehired', remarks: 'Same position', performedBy: OWNER }, day('2026-09-01')));

    expect(after.id).toBe(before.id); // the same record, not a second one
    expect(after.status).toBe('Active');
    expect(isActiveEmployee(after)).toBe(true);
    expect(isRestoredEmployee(after)).toBe(true);
    expect(after.rejoiningDate).toBe('2026-09-01');
    expect(rejoiningDateOf(after)).toBe('2026-09-01');
    expect(after.terminationDate).toBeNull();
    // The dismissal is still on record.
    expect(after.statusHistory).toHaveLength(2);
    expect(after.statusHistory![0]).toMatchObject({ newStatus: 'Dismissed', effectiveDate: '2026-03-15', reason: 'Absent without leave' });
    expect(after.statusHistory![1]).toMatchObject({ previousStatus: 'Dismissed', newStatus: 'Active', effectiveDate: '2026-09-01' });
    expect(after.salaryHistory).toEqual(before.salaryHistory);
  });

  it('cannot rejoin before the day they left', () => {
    expect(() => changeEmployeeStatus(dismissed(), { newStatus: 'Active', effectiveDate: '2026-03-01', reason: 'Rehired', performedBy: OWNER }, NOW)).toThrow(/before the last status change/);
  });

  it('someone never away is not "restored"', () => {
    expect(isRestoredEmployee(employee())).toBe(false);
    expect(isRestoredEmployee(dismissed())).toBe(false);
  });

  it('adding a former employee again is caught, so they are restored instead of duplicated', () => {
    const staff = [employee({ id: 'a', name: 'Kamran' }), { ...dismissed(), id: 'b', name: 'Zeeshan ' }];
    expect(formerEmployeeNamed(staff, ' zeeshan')?.id).toBe('b');
    expect(formerEmployeeNamed(staff, 'Kamran')).toBeUndefined(); // already working here
    expect(formerEmployeeNamed(staff, 'Someone New')).toBeUndefined();
  });
});

describe('days that count for salary', () => {
  it('stops on the day a suspension takes effect and starts again on the rejoining date', () => {
    let e = employee();
    e = apply(e, changeEmployeeStatus(e, { newStatus: 'Suspended', effectiveDate: '2026-10-10', reason: 'Inquiry', performedBy: OWNER }, day('2026-10-10')));
    e = apply(e, changeEmployeeStatus(e, { newStatus: 'Active', effectiveDate: '2026-10-25', reason: 'Cleared', performedBy: OWNER }, day('2026-10-25')));

    expect(employedOn(e, day('2025-06-30'))).toBe(false); // before hire
    expect(employedOn(e, day('2026-10-09'))).toBe(true);
    expect(employedOn(e, day('2026-10-10'))).toBe(false);
    expect(employedOn(e, day('2026-10-24'))).toBe(false);
    expect(employedOn(e, day('2026-10-25'))).toBe(true);
    expect(employedOn(e, day('2026-11-17'))).toBe(true);
  });

  it('keeps the old meaning for records that only have a leaving date', () => {
    const old = employee({ terminationDate: '2026-01-31' });
    expect(employedOn(old, day('2026-01-31'))).toBe(true);
    expect(employedOn(old, day('2026-02-01'))).toBe(false);
    expect(employedOn(employee(), day('2030-01-01'))).toBe(true);
  });
});

describe('salary revisions', () => {
  it('adds the new salary with its date and keeps every earlier one', () => {
    const before = employee();
    const after = apply(before, reviseSalary(before, { amount: 18000, effectiveDate: '2026-11-01', reason: 'Annual increase', performedBy: OWNER }, NOW));

    expect(after.salaryHistory).toEqual([
      { amount: 15000, effectiveDate: '2025-07-01' },
      { amount: 18000, effectiveDate: '2026-11-01', reason: 'Annual increase', recordedAt: NOW.toISOString(), recordedBy: OWNER },
    ]);
    expect(after.salary).toBe(18000);
    expect(currentSalary(after, NOW)).toBe(18000);
    // October is still paid at the old rate.
    expect(salaryOn(salaryHistoryOf(after), day('2026-10-15'))?.amount).toBe(15000);
    expect(salaryOn(salaryHistoryOf(after), day('2026-11-01'))?.amount).toBe(18000);
  });

  it('a revision dated in the future does not change the salary until that day', () => {
    const before = employee();
    const after = apply(before, reviseSalary(before, { amount: 20000, effectiveDate: '2027-01-01', performedBy: OWNER }, NOW));
    expect(after.salary).toBe(15000);
    expect(currentSalary(after, NOW)).toBe(15000);
    expect(currentSalary(after, day('2027-01-01'))).toBe(20000);
    expect(after.salaryHistory).toHaveLength(2);
  });

  it('a back-dated revision slots in by date without disturbing later ones', () => {
    let e = employee();
    e = apply(e, reviseSalary(e, { amount: 20000, effectiveDate: '2026-06-01', performedBy: OWNER }, NOW));
    e = apply(e, reviseSalary(e, { amount: 17000, effectiveDate: '2026-01-01', performedBy: OWNER }, NOW));
    expect(e.salaryHistory!.map((h) => [h.effectiveDate, h.amount])).toEqual([
      ['2025-07-01', 15000],
      ['2026-01-01', 17000],
      ['2026-06-01', 20000],
    ]);
    expect(e.salary).toBe(20000);
  });

  it('gives an older record with a salary but no history its first entry, then adds to it', () => {
    const old = employee({ salaryHistory: undefined, salary: 12000 });
    expect(salaryHistoryOf(old)).toEqual([{ amount: 12000, effectiveDate: '2025-07-01' }]);
    const after = apply(old, reviseSalary(old, { amount: 14000, effectiveDate: '2026-11-01', performedBy: OWNER }, NOW));
    expect(after.salaryHistory!.map((h) => h.amount)).toEqual([12000, 14000]);
  });

  it('refuses a revision that would overwrite or repeat an existing one', () => {
    const e = employee();
    expect(() => reviseSalary(e, { amount: 16000, effectiveDate: '2025-07-01', performedBy: OWNER }, NOW)).toThrow(/already recorded/);
    expect(() => reviseSalary(e, { amount: 15000, effectiveDate: '2026-11-01', performedBy: OWNER }, NOW)).toThrow(/already PKR 15,000/);
    expect(() => reviseSalary(e, { amount: 0, effectiveDate: '2026-11-01', performedBy: OWNER }, NOW)).toThrow(/new monthly salary/);
    expect(() => reviseSalary(e, { amount: 16000, effectiveDate: '2024-01-01', performedBy: OWNER }, NOW)).toThrow(/before .* was hired/);
  });
});

describe('salary submission', () => {
  const expense = (over: Partial<Expense>): Expense => ({ id: 'x', description: '', category: 'Salaries', amount: 1, timestamp: '2026-11-01', ...over });

  it('only Active employees are offered', () => {
    let suspended = employee({ id: 's', name: 'S' });
    suspended = apply(suspended, changeEmployeeStatus(suspended, { newStatus: 'Suspended', effectiveDate: '2026-11-01', reason: 'r', performedBy: OWNER }, NOW));
    let restored = employee({ id: 'r', name: 'R' });
    restored = apply(restored, changeEmployeeStatus(restored, { newStatus: 'Terminated', effectiveDate: '2026-02-01', reason: 'r', performedBy: OWNER }, day('2026-02-01')));
    restored = apply(restored, changeEmployeeStatus(restored, { newStatus: 'Active', effectiveDate: '2026-08-01', reason: 'r', performedBy: OWNER }, day('2026-08-01')));
    const staff = [employee({ id: 'a', name: 'A' }), suspended, restored, employee({ id: 'old', name: 'Old', terminationDate: '2026-01-01' })];

    expect(staff.filter(isActiveEmployee).map((e) => e.id)).toEqual(['a', 'r']);
  });

  it('knows a month has already been paid, for new entries and for the older ones', () => {
    const e = { id: 'e1', name: 'Zeeshan' };
    expect(payrollPeriodKey('November', '2026')).toBe('2026-11');
    expect(findSalaryPayment([], e, 'November', '2026')).toBeUndefined();

    const fresh = expense({ id: 'n', employeeId: 'e1', payrollPeriod: '2026-11', description: 'anything' });
    expect(findSalaryPayment([fresh], e, 'November', '2026')?.id).toBe('n');
    expect(findSalaryPayment([fresh], e, 'October', '2026')).toBeUndefined();

    const older = expense({ id: 'o', description: 'Salary for Zeeshan (October 2026)' });
    expect(findSalaryPayment([older], e, 'October', '2026')?.id).toBe('o');
    expect(findSalaryPayment([older], { id: 'e2', name: 'Kamran' }, 'October', '2026')).toBeUndefined();
    // An ordinary expense that happens to mention the name is not a salary.
    expect(findSalaryPayment([expense({ category: 'Other', description: 'Salary for Zeeshan (October 2026)' })], e, 'October', '2026')).toBeUndefined();
  });
});
