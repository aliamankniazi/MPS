
export type FuelType = string;

export type PaymentMethod = 'Cash' | 'Card' | 'Mobile' | 'Salary' | 'Credit' | 'Bank Transfer';

export interface Transaction {
  id: string;
  fuelType: FuelType | string;
  volume: number;
  pricePerLitre: number;
  product?: string;
  totalAmount: number;
  costPrice?: number;
  paymentMethod: PaymentMethod;
  customerId?: string;
  customerName?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  timestamp: string;
  notes?: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplier: string;
  fuelType: string;
  volume: number;
  totalCost: number;
  timestamp: string;
}

export interface PurchaseReturn {
  id: string;
  supplierId: string;
  supplier: string;
  fuelType: FuelType;
  volume: number;
  totalRefund: number;
  reason: string;
  timestamp: string;
}

export interface SaleReturn {
  id: string;
  customerId: string;
  customerName: string;
  fuelType: FuelType;
  volume: number;
  totalRefund: number;
  reason: string;
  timestamp: string;
}

export type ExpenseCategory = 'Utilities' | 'Salaries' | 'Maintenance' | 'Other';

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  timestamp: string;
  /** Set on a salary payment: who it was for and which month ('2026-11'), so a month is not paid twice. */
  employeeId?: string;
  payrollPeriod?: string;
  /** The monthly salary in force when this salary was paid. */
  baseSalary?: number;
}

export type OtherIncomeCategory = 'Service Station' | 'Tire Shop' | 'Tuck Shop' | 'Other';

export interface OtherIncome {
    id: string;
    description: string;
    category: OtherIncomeCategory;
    amount: number;
    timestamp: string;
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  vehicleNumber?: string;
  area?: string;
  isPartner?: boolean;
  timestamp: string;
  openingBalance?: number;
  isBlacklisted?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverContact?: string;
  helperName?: string;
  helperContact?: string;
  timestamp: string;
  openingBalance?: number;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  balance: number;
  timestamp: string;
}

export interface SalaryHistoryEntry {
  amount: number;
  /** The first day this salary applies. */
  effectiveDate: string;
  reason?: string;
  /** When and by whom the revision was entered. */
  recordedAt?: string;
  recordedBy?: string;
}

export type EmployeeStatus = 'Active' | 'Suspended' | 'Dismissed' | 'Terminated';

/** One line in an employee's status history. Lines are only ever added, never changed. */
export interface EmployeeStatusChange {
  id: string;
  previousStatus: EmployeeStatus;
  newStatus: EmployeeStatus;
  /** When the change was entered. */
  changeDate: string;
  /** The day it takes effect ('yyyy-MM-dd'). For a restore, the rejoining date. */
  effectiveDate: string;
  reason: string;
  remarks?: string;
  /** Who made the change (their sign-in email). */
  performedBy: string;
}

export interface Employee {
  id: string;
  name: string;
  mobileNumber?: string;
  position: string;
  salary: number;
  salaryHistory?: SalaryHistoryEntry[];
  hireDate: string;
  /** Kept in step with the status: the date a non-active status took effect, empty while Active. */
  terminationDate?: string | null;
  timestamp: string;
  /** Missing on older records, which count as Active (or Terminated if they have a terminationDate). */
  status?: EmployeeStatus;
  statusEffectiveDate?: string;
  statusHistory?: EmployeeStatusChange[];
  /** The most recent date this person came back after leaving. */
  rejoiningDate?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: 'Present' | 'Absent' | 'Leave';
  notes?: string;
}


export interface CustomerPayment {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  timestamp: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  timestamp: string;
}

export interface CashAdvance {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  notes?: string;
  timestamp: string;
}

export interface AuthFormValues {
  email: string;
  password: string;
}

export interface Machine {
  id: string;
  name: string;
  fuelType: FuelType;
  timestamp: string;
}

export interface MachineReading {
    id: string;
    machineId: string;
    machineName: string;
    fuelType: FuelType;
    volume: number;
    timestamp: string;
}

export interface Investment {
  id: string;
  partnerId: string;
  partnerName: string;
  type: 'Investment' | 'Withdrawal';
  amount: number;
  notes?: string;
  timestamp: string;
}

export interface BusinessPartner {
  id: string;
  name: string;
  sharePercentage: number;
  contact?: string;
  timestamp: string;
}

export interface StockAdjustment {
  id: string;
  fuelType: FuelType;
  supplierId?: string;
  supplierName?: string;
  adjustment: number;
  newStock: number;
  value: number;
  timestamp: string;
}

export interface Product {
    id: string;
    name: string;
    salePrice: number;
    purchasePrice: number;
    unit: string;
    category: 'Main Product' | 'Supplementary Product';
    openingStock: number;
    currentStock: number;
    createdAt: string;
}

export interface RateHistoryEntry {
  id: string;
  productName: string;
  price: number;
  type: 'sale' | 'purchase';
  timestamp: string;
}

export interface RecycledItem {
    id: string;
    originalPath: string;
    deletedAt: string;
    data: any;
}

export interface DictionaryEntry {
  id: string;
  key: string;
  value: string;
  description?: string;
  timestamp: string;
}

export type DateRange = {
  from: Date | undefined;
  to: Date | undefined;
};


// RBAC Types
export const PERMISSIONS = [
    'view_dashboard', 'view_all_transactions', 'delete_transaction',
    'view_customers', 'add_customer', 'edit_customer', 'delete_customer',
    'view_partner_ledger', 'view_credit_recovery',
    'view_cash_advances', 'add_cash_advance', 'delete_cash_advance',
    'view_inventory', 'view_purchases', 'add_purchase', 'delete_purchase',
    'view_purchase_returns', 'add_purchase_return', 'delete_purchase_return',
    'view_tank_readings', 'add_tank_reading',
    'view_supplier_payments', 'add_supplier_payment', 'delete_supplier_payment',
    'view_investments', 'add_investment', 'delete_investment',
    'view_expenses', 'add_expense', 'delete_expense',
    'view_other_incomes', 'add_other_income', 'delete_other_income',
    'view_ledger', 'view_summary',
    'manage_employees', 'manage_banks',
    'view_settings', 'manage_roles', 'manage_users', 
    'view_recycle_bin', 'restore_deleted_items', 'delete_permanently',
    'view_sales_by_type_report',
] as const;

export type Permission = typeof PERMISSIONS[number];
export type RoleId = string;

export interface Role {
    id: RoleId;
    name: string;
    permissions: Permission[];
}
