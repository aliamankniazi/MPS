

'use client';

import { 
    useState, 
    useEffect, 
    useCallback, 
    createContext, 
    useContext, 
    type ReactNode,
    useMemo
} from 'react';
import type { 
    AttendanceRecord,
    BankAccount,
    BusinessPartner,
    CashAdvance,
    Customer,
    CustomerPayment,
    Employee,
    Expense,
    FuelType,
    Investment,
    Machine,
    MachineReading,
    OtherIncome,
    Product,
    Purchase,
    PurchaseReturn,
    SaleReturn,
    StockAdjustment,
    Supplier,
    SupplierPayment,
    Transaction,
} from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set, update, serverTimestamp } from 'firebase/database';

// Centralized paths
const PATHS = {
    transactions: 'transactions',
    purchases: 'purchases',
    purchaseReturns: 'purchaseReturns',
    saleReturns: 'saleReturns',
    expenses: 'expenses',
    otherIncomes: 'otherIncomes',
    customers: 'customers',
    suppliers: 'suppliers',
    bankAccounts: 'bankAccounts',
    employees: 'employees',
    customerPayments: 'customerPayments',
    supplierPayments: 'supplierPayments',
    cashAdvances: 'cashAdvances',
    machines: 'machines',
    machineReadings: 'machineReadings',
    investments: 'investments',
    businessPartners: 'businessPartners',
    fuelPrices: 'fuelPrices',
    initialFuelStock: 'initialFuelStock',
    stockAdjustments: 'stockAdjustments',
    products: 'products',
    attendance: 'attendance',
};

const TRANSACTION_DATA_PATHS = [
    'transactions', 'purchases', 'purchaseReturns', 'saleReturns', 'expenses',
    'otherIncomes', 'customerPayments', 'supplierPayments', 'cashAdvances',
    'machineReadings', 'investments', 'stockAdjustments', 'attendance'
];

const DEFAULT_INITIAL_STOCK: Record<FuelType, number> = {
  'Unleaded': 0,
  'Premium': 0,
  'Diesel': 0,
};

const DEFAULT_FUEL_PRICES: Record<FuelType, number> = {
  'Unleaded': 0,
  'Premium': 0,
  'Diesel': 0,
};


interface DatabaseState {
    transactions: Record<string, Omit<Transaction, 'id'>>;
    purchases: Record<string, Omit<Purchase, 'id'>>;
    purchaseReturns: Record<string, Omit<PurchaseReturn, 'id'>>;
    saleReturns: Record<string, Omit<SaleReturn, 'id'>>;
    expenses: Record<string, Omit<Expense, 'id'>>;
    otherIncomes: Record<string, Omit<OtherIncome, 'id'>>;
    customers: Record<string, Omit<Customer, 'id'>>;
    suppliers: Record<string, Omit<Supplier, 'id'>>;
    bankAccounts: Record<string, Omit<BankAccount, 'id'>>;
    employees: Record<string, Omit<Employee, 'id'>>;
    customerPayments: Record<string, Omit<CustomerPayment, 'id'>>;
    supplierPayments: Record<string, Omit<SupplierPayment, 'id'>>;
    cashAdvances: Record<string, Omit<CashAdvance, 'id'>>;
    machines: Record<string, Omit<Machine, 'id'>>;
    machineReadings: Record<string, Omit<MachineReading, 'id'>>;
    investments: Record<string, Omit<Investment, 'id'>>;
    businessPartners: Record<string, Omit<BusinessPartner, 'id'>>;
    stockAdjustments: Record<string, Omit<StockAdjustment, 'id'>>;
    products: Record<string, Omit<Product, 'id'>>;
    attendance: Record<string, Omit<AttendanceRecord, 'id'>>;
    fuelPrices: Record<FuelType, number>;
    initialFuelStock: Record<FuelType, number>;
    isLoaded: boolean;
}

interface ProcessedDatabaseState {
    transactions: Transaction[];
    purchases: Purchase[];
    purchaseReturns: PurchaseReturn[];
    saleReturns: SaleReturn[];
    expenses: Expense[];
    otherIncomes: OtherIncome[];
    customers: Customer[];
    suppliers: Supplier[];
    bankAccounts: BankAccount[];
    employees: Employee[];
    customerPayments: CustomerPayment[];
    supplierPayments: SupplierPayment[];
    cashAdvances: CashAdvance[];
    machines: Machine[];
    machineReadings: MachineReading[];
    investments: Investment[];
    businessPartners: BusinessPartner[];
    stockAdjustments: StockAdjustment[];
    products: Product[];
    attendance: AttendanceRecord[];
    fuelPrices: Record<FuelType, number>;
    initialFuelStock: Record<FuelType, number>;
    isLoaded: boolean;
}

interface DatabaseActions {
    addTransaction: (transaction: Omit<Transaction, 'id'>) => void;
    deleteTransaction: (id: string) => void;
    addPurchase: (purchase: Omit<Purchase, 'id'>) => void;
    deletePurchase: (id: string) => void;
    addPurchaseReturn: (pr: Omit<PurchaseReturn, 'id'>) => void;
    deletePurchaseReturn: (id: string) => void;
    addSaleReturn: (sr: Omit<SaleReturn, 'id'>) => void;
    deleteSaleReturn: (id: string) => void;
    addExpense: (expense: Omit<Expense, 'id'>) => void;
    deleteExpense: (id: string) => void;
    addOtherIncome: (income: Omit<OtherIncome, 'id'>) => void;
    deleteOtherIncome: (id: string) => void;
    addCustomer: (customer: Omit<Customer, 'id'>) => Customer;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    deleteCustomer: (id: string) => void;
    addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
    deleteSupplier: (id: string) => void;
    addBankAccount: (account: Omit<BankAccount, 'id'>) => void;
    updateBankAccount: (id: string, updates: Partial<BankAccount>) => void;
    deleteBankAccount: (id: string) => void;
    addEmployee: (employee: Omit<Employee, 'id'>) => Employee;
    updateEmployee: (id: string, updates: Partial<Employee> & { terminationDate?: string | null }) => void;
    deleteEmployee: (id: string) => void;
    addCustomerPayment: (payment: Omit<CustomerPayment, 'id'>) => void;
    deleteCustomerPayment: (id: string) => void;
    addSupplierPayment: (payment: Omit<SupplierPayment, 'id'>) => void;
    deleteSupplierPayment: (id: string) => void;
    addCashAdvance: (advance: Omit<CashAdvance, 'id'>) => void;
    deleteCashAdvance: (id: string) => void;
    addMachine: (machine: Omit<Machine, 'id'>) => void;
    deleteMachine: (id: string) => void;
    addMachineReading: (reading: Omit<MachineReading, 'id'>) => void;
    addInvestment: (investment: Omit<Investment, 'id'>) => void;
    deleteInvestment: (id: string) => void;
    addBusinessPartner: (partner: Omit<BusinessPartner, 'id'>) => void;
    updateBusinessPartner: (id: string, updates: Partial<BusinessPartner>) => void;
    deleteBusinessPartner: (id: string) => void;
    addStockAdjustment: (adjustment: Omit<StockAdjustment, 'id'>) => void;
    addAttendance: (record: Omit<AttendanceRecord, 'id'>) => void;
    setFuelStock: (fuelType: FuelType, newStock: number) => void;
    updateFuelPrice: (fuelType: FuelType, newPrice: number) => void;
    addProduct: (product: Omit<Product, 'id'>) => void;
    updateProduct: (id: string, updates: Partial<Product>) => void;
    deleteProduct: (id: string) => void;
    clearAllData: () => void;
}

type DatabaseContextType = ProcessedDatabaseState & DatabaseActions & { fuelStock: Record<FuelType, number> };

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

const objectToArray = <T extends { id: string }>(obj: Record<string, Omit<T, 'id'>> | undefined): T[] => {
    if (!obj) return [];
    return Object.keys(obj).map(key => ({ id: key, ...obj[key] } as T));
};


export function DatabaseProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<DatabaseState>({
        transactions: {}, purchases: {}, purchaseReturns: {}, saleReturns: {},
        expenses: {}, otherIncomes: {}, customers: {}, suppliers: {},
        bankAccounts: {}, employees: {}, customerPayments: {}, supplierPayments: {},
        cashAdvances: {}, machines: {}, machineReadings: {}, investments: {}, businessPartners: {},
        stockAdjustments: {}, products: {}, attendance: {},
        fuelPrices: DEFAULT_FUEL_PRICES,
        initialFuelStock: DEFAULT_INITIAL_STOCK,
        isLoaded: false,
    });

    useEffect(() => {
        if (!db) {
            console.warn("Firebase is not configured. App is in offline mode.");
            setState(s => ({ ...s, isLoaded: true }));
            return;
        }

        const listeners = Object.entries(PATHS).map(([key, path]) => {
            const dbRef = ref(db, path);
            return onValue(dbRef, (snapshot) => {
                const data = snapshot.val();
                setState(prevState => ({ ...prevState, [key]: data || {} }));
            }, { onlyOnce: false }); // Ensure we get live updates
        });

        const timer = setTimeout(() => setState(s => ({...s, isLoaded: true})), 1500);

        return () => {
            listeners.forEach(unsubscribe => unsubscribe());
            clearTimeout(timer);
        };
    }, []);
    
    const processedState = useMemo((): ProcessedDatabaseState => {
        const createSorter = (key: keyof (Transaction & { name: string }), order: 'asc' | 'desc' = 'desc') => (a: any, b: any) => {
            const valA = a[key];
            const valB = b[key];

            if (typeof valA === 'string' && typeof valB === 'string') {
                if (Date.parse(valA) && Date.parse(valB)) { // It's a date string
                    return order === 'desc' ? new Date(valB).getTime() - new Date(valA).getTime() : new Date(valA).getTime() - new Date(valB).getTime();
                }
                return order === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
            }
             if (typeof valA === 'number' && typeof valB === 'number') {
                return order === 'desc' ? valB - valA : valA - valB;
            }
            return 0;
        }
        
        return {
            transactions: objectToArray<Transaction>(state.transactions).sort(createSorter('timestamp')),
            purchases: objectToArray<Purchase>(state.purchases).sort(createSorter('timestamp')),
            purchaseReturns: objectToArray<PurchaseReturn>(state.purchaseReturns).sort(createSorter('timestamp')),
            saleReturns: objectToArray<SaleReturn>(state.saleReturns).sort(createSorter('timestamp')),
            expenses: objectToArray<Expense>(state.expenses).sort(createSorter('timestamp')),
            otherIncomes: objectToArray<OtherIncome>(state.otherIncomes).sort(createSorter('timestamp')),
            customers: objectToArray<Customer>(state.customers).sort(createSorter('name', 'asc')),
            suppliers: objectToArray<Supplier>(state.suppliers).sort(createSorter('name', 'asc')),
            bankAccounts: objectToArray<BankAccount>(state.bankAccounts).sort(createSorter('timestamp')),
            employees: objectToArray<Employee>(state.employees).sort(createSorter('name', 'asc')),
            customerPayments: objectToArray<CustomerPayment>(state.customerPayments).sort(createSorter('timestamp')),
            supplierPayments: objectToArray<SupplierPayment>(state.supplierPayments).sort(createSorter('timestamp')),
            cashAdvances: objectToArray<CashAdvance>(state.cashAdvances).sort(createSorter('timestamp')),
            machines: objectToArray<Machine>(state.machines).sort(createSorter('name', 'asc')),
            machineReadings: objectToArray<MachineReading>(state.machineReadings).sort(createSorter('timestamp')),
            investments: objectToArray<Investment>(state.investments).sort(createSorter('timestamp')),
            businessPartners: objectToArray<BusinessPartner>(state.businessPartners).sort(createSorter('name', 'asc')),
            stockAdjustments: objectToArray<StockAdjustment>(state.stockAdjustments).sort(createSorter('timestamp')),
            products: objectToArray<Product>(state.products).sort(createSorter('name', 'asc')),
            attendance: objectToArray<AttendanceRecord>(state.attendance).sort(createSorter('date')),
            fuelPrices: state.fuelPrices,
            initialFuelStock: state.initialFuelStock,
            isLoaded: state.isLoaded,
        };
    }, [state]);
    
    const fuelStock = useMemo(() => {
        const stock = { ...DEFAULT_INITIAL_STOCK };
        
        if (!state.isLoaded) return stock;

        for (const fuelType in stock) {
            const ft = fuelType as FuelType;
            
            // Start with the last known reading for that fuel type, or initial stock
            const lastReading = processedState.machineReadings
                .filter(r => r.fuelType === ft)
                .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                
            let startingPoint = lastReading ? new Date(lastReading.timestamp) : new Date(0);
            let startingStock = lastReading ? lastReading.volume : (state.initialFuelStock[ft] || 0);

            const purchasesSince = processedState.purchases
                .filter(p => p.fuelType === ft && new Date(p.timestamp) > startingPoint)
                .reduce((sum, p) => sum + p.volume, 0);

            const salesSince = processedState.transactions
                .filter(t => t.fuelType === ft && t.volume && new Date(t.timestamp) > startingPoint)
                .reduce((sum, t) => sum + t.volume, 0);

            const purchaseReturnsSince = processedState.purchaseReturns
                .filter(pr => pr.fuelType === ft && new Date(pr.timestamp) > startingPoint)
                .reduce((sum, pr) => sum + pr.volume, 0);
            
            const saleReturnsSince = processedState.saleReturns
                .filter(sr => sr.fuelType === ft && new Date(sr.timestamp) > startingPoint)
                .reduce((sum, sr) => sum + sr.volume, 0);
            
            const adjustmentsSince = processedState.stockAdjustments
                .filter(adj => adj.fuelType === ft && new Date(adj.timestamp) > startingPoint)
                .reduce((sum, adj) => sum + adj.adjustment, 0);


            stock[ft] = startingStock + purchasesSince - salesSince - purchaseReturnsSince + saleReturnsSince + adjustmentsSince;
        }

        return stock;

    }, [state.isLoaded, state.initialFuelStock, processedState.machineReadings, processedState.purchases, processedState.transactions, processedState.purchaseReturns, processedState.saleReturns, processedState.stockAdjustments]);
    

    const addEntity = useCallback(<T extends { id: string, timestamp?: any }>(path: string, entity: Omit<T, 'id' | 'timestamp'>): T => {
        const newEntityWithTimestamp = { ...entity, timestamp: serverTimestamp() };
        if (db) {
            const newEntityRef = push(ref(db, path));
            set(newEntityRef, newEntityWithTimestamp);
            return { ...entity, id: newEntityRef.key! } as T; // timestamp is handled by server
        }
        // Offline fallback
        const offlineEntity = { ...entity, id: crypto.randomUUID(), timestamp: new Date().toISOString() } as T;
        setState(s => ({...s, [path]: {...(s as any)[path], [offlineEntity.id]: newEntityWithTimestamp } }));
        return offlineEntity;
    }, []);

    const updateEntity = useCallback(<T,>(path: string, id: string, updates: Partial<T>) => {
        if (!db) return;
        update(ref(db, `${path}/${id}`), updates);
    }, []);

    const deleteEntity = useCallback((path: string, id: string) => {
        if (!db) return;
        remove(ref(db, `${path}/${id}`));
    }, []);
    
    // Specific Actions
    const addTransaction = (t: Omit<Transaction, 'id'>) => addEntity(PATHS.transactions, t);
    const deleteTransaction = (id: string) => deleteEntity(PATHS.transactions, id);
    
    const addPurchase = (p: Omit<Purchase, 'id'>) => addEntity(PATHS.purchases, p);
    const deletePurchase = (id: string) => deleteEntity(PATHS.purchases, id);

    const addPurchaseReturn = (pr: Omit<PurchaseReturn, 'id'>) => addEntity(PATHS.purchaseReturns, pr);
    const deletePurchaseReturn = (id: string) => deleteEntity(PATHS.purchaseReturns, id);

    const addSaleReturn = (sr: Omit<SaleReturn, 'id'>) => addEntity(PATHS.saleReturns, sr);
    const deleteSaleReturn = (id: string) => deleteEntity(PATHS.saleReturns, id);

    const addExpense = (e: Omit<Expense, 'id'>) => addEntity(PATHS.expenses, e);
    const deleteExpense = (id: string) => deleteEntity(PATHS.expenses, id);

    const addOtherIncome = (i: Omit<OtherIncome, 'id'>) => addEntity(PATHS.otherIncomes, i);
    const deleteOtherIncome = (id: string) => deleteEntity(PATHS.otherIncomes, id);

    const addCustomer = (c: Omit<Customer, 'id'>) => addEntity<Customer>(PATHS.customers, c);
    const updateCustomer = (id: string, u: Partial<Customer>) => updateEntity(PATHS.customers, id, u);
    const deleteCustomer = (id: string) => deleteEntity(PATHS.customers, id);
    
    const addSupplier = (s: Omit<Supplier, 'id'>) => addEntity(PATHS.suppliers, s);
    const deleteSupplier = (id: string) => deleteEntity(PATHS.suppliers, id);

    const addBankAccount = (a: Omit<BankAccount, 'id'>) => addEntity(PATHS.bankAccounts, a);
    const updateBankAccount = (id: string, u: Partial<BankAccount>) => updateEntity(PATHS.bankAccounts, id, u);
    const deleteBankAccount = (id: string) => deleteEntity(PATHS.bankAccounts, id);

    const addEmployee = (e: Omit<Employee, 'id'>) => addEntity<Employee>(PATHS.employees, e);
    const updateEmployee = (id: string, u: Partial<Employee> & { terminationDate?: string | null }) => updateEntity(PATHS.employees, id, u);
    const deleteEmployee = (id: string) => deleteEntity(PATHS.employees, id);

    const addCustomerPayment = (p: Omit<CustomerPayment, 'id'>) => addEntity(PATHS.customerPayments, p);
    const deleteCustomerPayment = (id: string) => deleteEntity(PATHS.customerPayments, id);

    const addSupplierPayment = (p: Omit<SupplierPayment, 'id'>) => addEntity(PATHS.supplierPayments, p);
    const deleteSupplierPayment = (id: string) => deleteEntity(PATHS.supplierPayments, id);

    const addCashAdvance = (a: Omit<CashAdvance, 'id'>) => addEntity(PATHS.cashAdvances, a);
    const deleteCashAdvance = (id: string) => deleteEntity(PATHS.cashAdvances, id);
    
    const addMachine = (m: Omit<Machine, 'id'>) => addEntity(PATHS.machines, m);
    const deleteMachine = (id: string) => deleteEntity(PATHS.machines, id);

    const addMachineReading = (r: Omit<MachineReading, 'id'>) => addEntity(PATHS.machineReadings, r);
    
    const addInvestment = (i: Omit<Investment, 'id'>) => addEntity(PATHS.investments, i);
    const deleteInvestment = (id: string) => deleteEntity(PATHS.investments, id);

    const addStockAdjustment = (adj: Omit<StockAdjustment, 'id'>) => addEntity(PATHS.stockAdjustments, adj);

    const addProduct = (p: Omit<Product, 'id'>) => addEntity(PATHS.products, p);
    const updateProduct = (id: string, u: Partial<Product>) => updateEntity(PATHS.products, id, u);
    const deleteProduct = (id: string) => deleteEntity(PATHS.products, id);
    
    const addAttendance = (record: Omit<AttendanceRecord, 'id'>) => {
        // Find if a record for this employee and date already exists to update it
        const todayStr = record.date.substring(0, 10);
        const existingRecord = processedState.attendance.find(
          a => a.employeeId === record.employeeId && a.date.startsWith(todayStr)
        );
    
        if (existingRecord) {
          updateEntity(PATHS.attendance, existingRecord.id, { status: record.status });
        } else {
          addEntity(PATHS.attendance, record);
        }
    };


    const addBusinessPartner = (partner: Omit<BusinessPartner, 'id'>) => {
        const customerRecord = addCustomer({
            name: partner.name,
            contact: partner.contact || '',
            area: 'Business Partner',
            isPartner: true,
        });

        if (db) {
            const partnerRef = ref(db, `${PATHS.businessPartners}/${customerRecord.id}`);
            set(partnerRef, { ...partner, timestamp: serverTimestamp() });
        }
    };
    
    const updateBusinessPartner = (id: string, updatedPartner: Partial<Omit<BusinessPartner, 'id'>>) => {
        updateEntity(PATHS.businessPartners, id, updatedPartner);
        if(updatedPartner.name || updatedPartner.contact) {
            updateCustomer(id, { name: updatedPartner.name, contact: updatedPartner.contact });
        }
    };

    const deleteBusinessPartner = (id: string) => deleteEntity(PATHS.businessPartners, id);

    const setFuelStock = useCallback((fuelType: FuelType, newStock: number) => {
        if (!db) return;
        const updates: any = {};
        updates[`${PATHS.initialFuelStock}/${fuelType}`] = newStock;
        update(ref(db), updates);
    }, []);

    const updateFuelPrice = (fuelType: FuelType, newPrice: number) => {
        if (!db || isNaN(newPrice) || newPrice < 0) return;
        update(ref(db), { [`${PATHS.fuelPrices}/${fuelType}`]: newPrice });
    };
    
    const clearAllData = () => {
        if(db) {
            TRANSACTION_DATA_PATHS.forEach(pathKey => {
                const path = PATHS[pathKey as keyof typeof PATHS];
                if (path) {
                    remove(ref(db, path));
                }
            });
        }
        
        const newState: Partial<DatabaseState> = {};
        TRANSACTION_DATA_PATHS.forEach(key => {
            newState[key as keyof DatabaseState] = {};
        });

        setState(s => ({
            ...s,
            ...newState,
            isLoaded: true
        }));
    };


    const value: DatabaseContextType = {
        ...processedState,
        isLoaded: state.isLoaded,
        fuelStock,
        addTransaction,
        deleteTransaction,
        addPurchase,
        deletePurchase,
        addPurchaseReturn,
        deletePurchaseReturn,
        addSaleReturn,
        deleteSaleReturn,
        addExpense,
        deleteExpense,
        addOtherIncome,
        deleteOtherIncome,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addSupplier,
        deleteSupplier,
        addBankAccount,
        updateBankAccount,
        deleteBankAccount,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        addCustomerPayment,
        deleteCustomerPayment,
        addSupplierPayment,
        deleteSupplierPayment,
        addCashAdvance,
        deleteCashAdvance,
        addMachine,
        deleteMachine,
        addMachineReading,
        addInvestment,
        deleteInvestment,
        addBusinessPartner,
        updateBusinessPartner,
        deleteBusinessPartner,
        addStockAdjustment,
        addAttendance,
        setFuelStock,
        updateFuelPrice,
        addProduct,
        updateProduct,
        deleteProduct,
        clearAllData,
    };

    return (
        <DatabaseContext.Provider value={value}>
            {children}
        </DatabaseContext.Provider>
    );
}

export const useDatabase = () => {
    const context = useContext(DatabaseContext);
    if (context === undefined) {
        throw new Error('useDatabase must be used within a DatabaseProvider');
    }
    return context;
};

    

    