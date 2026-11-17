/**
 * The rules for an employee's working life: status changes (suspend, dismiss,
 * terminate, restore), salary revisions, and who may be paid.
 *
 * Everything here is a plain calculation with no screen or database in it, so
 * the same rules are used by every screen and can be tested on their own.
 *
 * Two promises these rules keep:
 *   - History is only ever added to. A status change or a salary revision
 *     never removes or rewrites an earlier one.
 *   - An employee is never deleted. Leaving and coming back are changes of
 *     status on the same record, so ledgers, advances and salary records stay
 *     attached to the same person.
 */
import { format, isValid, parseISO, startOfDay } from 'date-fns';
import type { Employee, EmployeeStatus, EmployeeStatusChange, Expense, SalaryHistoryEntry } from './types';

export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = ['Active', 'Suspended', 'Dismissed', 'Terminated'];
export const INACTIVE_STATUSES: readonly EmployeeStatus[] = ['Suspended', 'Dismissed', 'Terminated'];

/** A rule was broken; the message is written to be shown to the person. */
export class LifecycleError extends Error {}

const toDay = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const date = parseISO(iso);
  return isValid(date) ? startOfDay(date) : null;
};

/** 'yyyy-MM-dd' in local time, for comparing two dates as calendar days. */
export const dayKey = (iso: string): string => {
  const date = toDay(iso);
  return date ? format(date, 'yyyy-MM-dd') : '';
};

const prettyDay = (iso: string): string => {
  const date = toDay(iso);
  return date ? format(date, 'dd MMM yyyy') : iso;
};

/**
 * The employee's status today. Records made before statuses existed have
 * none: they count as Active, or as Terminated if they carry a leaving date.
 */
export function statusOf(employee: Pick<Employee, 'status' | 'terminationDate'>): EmployeeStatus {
  if (employee.status && EMPLOYEE_STATUSES.includes(employee.status)) return employee.status;
  return employee.terminationDate ? 'Terminated' : 'Active';
}

export const isActiveEmployee = (employee: Pick<Employee, 'status' | 'terminationDate'>): boolean => statusOf(employee) === 'Active';

const orderedHistory = (employee: Pick<Employee, 'statusHistory'>): EmployeeStatusChange[] =>
  [...(employee.statusHistory ?? [])].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.changeDate.localeCompare(b.changeDate));

/** The most recent status change, if there has been one. */
export function lastStatusChange(employee: Pick<Employee, 'statusHistory'>): EmployeeStatusChange | undefined {
  const history = orderedHistory(employee);
  return history[history.length - 1];
}

/** True for someone who left and was brought back, and is working now. */
export function isRestoredEmployee(employee: Pick<Employee, 'status' | 'terminationDate' | 'statusHistory'>): boolean {
  return isActiveEmployee(employee) && (employee.statusHistory ?? []).some((c) => c.newStatus === 'Active' && c.previousStatus !== 'Active');
}

/** The date they most recently rejoined, if they ever did. */
export function rejoiningDateOf(employee: Pick<Employee, 'statusHistory'>): string | undefined {
  return [...orderedHistory(employee)].reverse().find((c) => c.newStatus === 'Active' && c.previousStatus !== 'Active')?.effectiveDate;
}

export type StatusChangeInput = {
  newStatus: EmployeeStatus;
  /** 'yyyy-MM-dd'. For a restore this is the rejoining date. */
  effectiveDate: string;
  reason: string;
  remarks?: string;
  /** Who is doing this (their sign-in email). */
  performedBy: string;
};

/**
 * Works out what to save when an employee's status changes. Returns the
 * fields to update on the SAME employee record; nothing is deleted and no new
 * employee is created, which is what keeps a restored person from being
 * duplicated.
 */
export function changeEmployeeStatus(employee: Employee, input: StatusChangeInput, now = new Date()): Partial<Employee> & { terminationDate: string | null } {
  const previousStatus = statusOf(employee);
  const reason = input.reason.trim();
  const effective = toDay(input.effectiveDate);

  if (!EMPLOYEE_STATUSES.includes(input.newStatus)) throw new LifecycleError('Choose a status.');
  if (input.newStatus === previousStatus) throw new LifecycleError(`${employee.name} is already ${previousStatus}.`);
  if (!effective) throw new LifecycleError('Choose the effective date.');
  if (!reason) throw new LifecycleError('Give a reason.');
  if (!input.performedBy.trim()) throw new LifecycleError('You must be signed in to do this.');

  const hired = toDay(employee.hireDate);
  if (hired && effective.getTime() < hired.getTime()) {
    throw new LifecycleError(`The date cannot be before ${employee.name} was hired (${prettyDay(employee.hireDate)}).`);
  }
  const last = lastStatusChange(employee);
  const lastDay = toDay(last?.effectiveDate);
  if (lastDay && effective.getTime() < lastDay.getTime()) {
    throw new LifecycleError(`The date cannot be before the last status change (${prettyDay(last!.effectiveDate)}).`);
  }

  const restoring = input.newStatus === 'Active';
  const change: EmployeeStatusChange = {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    previousStatus,
    newStatus: input.newStatus,
    changeDate: now.toISOString(),
    effectiveDate: format(effective, 'yyyy-MM-dd'),
    reason,
    ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}),
    performedBy: input.performedBy.trim(),
  };

  return {
    status: input.newStatus,
    statusEffectiveDate: change.effectiveDate,
    statusHistory: [...(employee.statusHistory ?? []), change],
    // Older screens and reports read this one field to know someone has left.
    terminationDate: restoring ? null : change.effectiveDate,
    ...(restoring ? { rejoiningDate: change.effectiveDate } : {}),
  };
}

/**
 * Was this person working for the business on `day`? Used so salary is never
 * counted for days while suspended or after leaving, and is counted again
 * from the rejoining date.
 */
export function employedOn(employee: Pick<Employee, 'hireDate' | 'terminationDate' | 'statusHistory'>, day: Date): boolean {
  const at = startOfDay(day).getTime();
  const hired = toDay(employee.hireDate);
  if (hired && at < hired.getTime()) return false;

  const history = orderedHistory(employee);
  if (history.length === 0) {
    // A record from before statuses existed: the leaving date is the last day worked.
    const left = toDay(employee.terminationDate);
    return left ? at <= left.getTime() : true;
  }
  let status: EmployeeStatus = history[0].previousStatus;
  for (const change of history) {
    const from = toDay(change.effectiveDate);
    if (from && from.getTime() <= at) status = change.newStatus;
  }
  return status === 'Active';
}

/** The salary history in date order. A record with a salary but no history gets one entry from the hire date. */
export function salaryHistoryOf(employee: Pick<Employee, 'salary' | 'salaryHistory' | 'hireDate'>): SalaryHistoryEntry[] {
  const history = (employee.salaryHistory ?? []).filter((h) => toDay(h.effectiveDate));
  if (history.length === 0 && employee.salary > 0 && toDay(employee.hireDate)) {
    return [{ amount: employee.salary, effectiveDate: employee.hireDate }];
  }
  return [...history].sort((a, b) => toDay(a.effectiveDate)!.getTime() - toDay(b.effectiveDate)!.getTime());
}

/** The monthly salary in force on `day`: the latest revision that had taken effect by then. */
export function salaryOn(history: SalaryHistoryEntry[], day: Date): SalaryHistoryEntry | undefined {
  const at = startOfDay(day).getTime();
  return [...history]
    .filter((h) => toDay(h.effectiveDate) && toDay(h.effectiveDate)!.getTime() <= at)
    .sort((a, b) => toDay(a.effectiveDate)!.getTime() - toDay(b.effectiveDate)!.getTime())
    .pop();
}

export function currentSalary(employee: Pick<Employee, 'salary' | 'salaryHistory' | 'hireDate'>, today = new Date()): number {
  return salaryOn(salaryHistoryOf(employee), today)?.amount ?? employee.salary ?? 0;
}

export type SalaryRevisionInput = {
  amount: number;
  /** 'yyyy-MM-dd': the first day the new salary applies. May be in the future. */
  effectiveDate: string;
  reason?: string;
  performedBy: string;
};

/**
 * Works out what to save for a new salary. The earlier salaries stay exactly
 * as they were; the new one is added with the date it takes effect. The
 * employee's "current salary" only changes once that date has arrived.
 */
export function reviseSalary(employee: Employee, input: SalaryRevisionInput, now = new Date()): Partial<Employee> {
  const effective = toDay(input.effectiveDate);
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new LifecycleError('Enter the new monthly salary.');
  if (!effective) throw new LifecycleError('Choose the date the new salary starts.');
  const hired = toDay(employee.hireDate);
  if (hired && effective.getTime() < hired.getTime()) {
    throw new LifecycleError(`The date cannot be before ${employee.name} was hired (${prettyDay(employee.hireDate)}).`);
  }

  const history = salaryHistoryOf(employee);
  const key = format(effective, 'yyyy-MM-dd');
  if (history.some((h) => dayKey(h.effectiveDate) === key)) {
    throw new LifecycleError(`A salary is already recorded from ${prettyDay(key)}. Choose another date.`);
  }
  if (salaryOn(history, effective)?.amount === input.amount) {
    throw new LifecycleError(`The salary is already PKR ${input.amount.toLocaleString()} on that date.`);
  }

  const entry: SalaryHistoryEntry = {
    amount: input.amount,
    effectiveDate: key,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    recordedAt: now.toISOString(),
    recordedBy: input.performedBy.trim(),
  };
  const salaryHistory = [...history, entry].sort((a, b) => toDay(a.effectiveDate)!.getTime() - toDay(b.effectiveDate)!.getTime());
  return { salaryHistory, salary: salaryOn(salaryHistory, now)?.amount ?? input.amount };
}

/** '2026-11' for November 2026: one salary may be posted per employee per period. */
export function payrollPeriodKey(monthName: string, year: string): string {
  const index = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(monthName.trim().toLowerCase());
  return `${year}-${String(index + 1).padStart(2, '0')}`;
}

export const salaryDescription = (employeeName: string, monthName: string, year: string): string => `Salary for ${employeeName} (${monthName} ${year})`;

/**
 * The salary already posted for this employee and month, if any. Recognises
 * both new entries (which carry the employee and period) and the entries the
 * app wrote before, which are known only by their description.
 */
export function findSalaryPayment(expenses: Expense[], employee: Pick<Employee, 'id' | 'name'>, monthName: string, year: string): Expense | undefined {
  const period = payrollPeriodKey(monthName, year);
  const legacy = salaryDescription(employee.name, monthName, year).toLowerCase();
  return expenses.find(
    (x) => (x.employeeId === employee.id && x.payrollPeriod === period) || (x.category === 'Salaries' && (x.description ?? '').trim().toLowerCase() === legacy),
  );
}

/** A former employee with this name, if one exists: add-employee should restore them instead of creating a second record. */
export function formerEmployeeNamed(employees: Employee[], name: string): Employee | undefined {
  const wanted = name.trim().toLowerCase();
  return employees.find((e) => e.name.trim().toLowerCase() === wanted && !isActiveEmployee(e));
}
