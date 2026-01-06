

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
    BankAccount,
    BusinessPartner,
    CashAdvance,
    Customer,
    CustomerPayment,
    Employee,
    Expense,
    FuelType,
    Investment,
    OtherIncome,
    Purchase,
    PurchaseReturn,
    SaleReturn,
    StockAdjustment,
    Supplier,
    SupplierPayment,
    TankReading,
    Transaction,
} from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set, update } from 'firebase/database';

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
    tankReadings: 'tankReadings',
    investments: 'investments',
    businessPartners: 'businessPartners',
    fuelPrices: 'fuelPrices',
    initialFuelStock: 'initialFuelStock',
    stockAdjustments: 'stockAdjustments',
};

const DEFAULT_INITIAL_STOCK: Record<FuelType, number> = {
  'Unleaded': 10000,
  'Premium': 5000,
  'Diesel': 15000,
};

const DEFAULT_FUEL_PRICES: Record<FuelType, number> = {
  'Unleaded': 275.98,
  'Premium': 285.50,
  'Diesel': 282.44,
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
    tankReadings: Record<string, Omit<TankReading, 'id'>>;
    investments: Record<string, Omit<Investment, 'id'>>;
    businessPartners: Record<string, Omit<BusinessPartner, 'id'>>;
    stockAdjustments: Record<string, Omit<StockAdjustment, 'id'>>;
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
    tankReadings: TankReading[];
    investments: Investment[];
    businessPartners: BusinessPartner[];
    stockAdjustments: StockAdjustment[];
    fuelPrices: Record<FuelType, number>;
    initialFuelStock: Record<FuelType, number>;
    isLoaded: boolean;
}

interface DatabaseActions {
    addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp'>) => void;
    deleteTransaction: (id: string) => void;
    addPurchase: (purchase: Omit<Purchase, 'id' | 'timestamp'>) => void;
    deletePurchase: (id: string) => void;
    addPurchaseReturn: (pr: Omit<PurchaseReturn, 'id' | 'timestamp'>) => void;
    deletePurchaseReturn: (id: string) => void;
    addSaleReturn: (sr: Omit<SaleReturn, 'id' | 'timestamp'>) => void;
    deleteSaleReturn: (id: string) => void;
    addExpense: (expense: Omit<Expense, 'id' | 'timestamp'>) => void;
    deleteExpense: (id: string) => void;
    addOtherIncome: (income: Omit<OtherIncome, 'id' | 'timestamp'>) => void;
    deleteOtherIncome: (id: string) => void;
    addCustomer: (customer: Omit<Customer, 'id' | 'timestamp'>) => Customer;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    deleteCustomer: (id: string) => void;
    addSupplier: (supplier: Omit<Supplier, 'id' | 'timestamp'>) => void;
    deleteSupplier: (id: string) => void;
    addBankAccount: (account: Omit<BankAccount, 'id' | 'timestamp'>) => void;
    updateBankAccount: (id: string, updates: Partial<BankAccount>) => void;
    deleteBankAccount: (id: string) => void;
    addEmployee: (employee: Omit<Employee, 'id' | 'timestamp'>) => void;
    updateEmployee: (id: string, updates: Partial<Employee>) => void;
    deleteEmployee: (id: string) => void;
    addCustomerPayment: (payment: Omit<CustomerPayment, 'id' | 'timestamp'>) => void;
    deleteCustomerPayment: (id: string) => void;
    addSupplierPayment: (payment: Omit<SupplierPayment, 'id' | 'timestamp'>) => void;
    deleteSupplierPayment: (id: string) => void;
    addCashAdvance: (advance: Omit<CashAdvance, 'id' | 'timestamp'>) => void;
    deleteCashAdvance: (id: string) => void;
    addTankReading: (reading: Omit<TankReading, 'id' | 'timestamp'>) => void;
    addInvestment: (investment: Omit<Investment, 'id' | 'timestamp'>) => void;
    deleteInvestment: (id: string) => void;
    addBusinessPartner: (partner: Omit<BusinessPartner, 'id' | 'timestamp'>) => void;
    updateBusinessPartner: (id: string, updates: Partial<BusinessPartner>) => void;
    deleteBusinessPartner: (id: string) => void;
    addStockAdjustment: (adjustment: Omit<StockAdjustment, 'id' | 'timestamp'>) => void;
    updateFuelPrice: (fuelType: FuelType, newPrice: number) => void;
    clearAllData: () => void;
}

type DatabaseContextType = ProcessedDatabaseState & DatabaseActions & { fuelStock: Record<FuelType, number> };

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

const objectToArray = <T>(obj: Record<string, Omit<T, 'id'>> | undefined): T[] => {
    if (!obj) return [];
    return Object.keys(obj).map(key => ({ id: key, ...obj[key] } as T));
};


export function DatabaseProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<DatabaseState>({
        transactions: {}, purchases: {}, purchaseReturns: {}, saleReturns: {},
        expenses: {}, otherIncomes: {}, customers: {}, suppliers: {},
        bankAccounts: {}, employees: {}, customerPayments: {}, supplierPayments: {},
        cashAdvances: {}, tankReadings: {}, investments: {}, businessPartners: {},
        stockAdjustments: {},
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
        const timestampSort = (a: { timestamp: string }, b: { timestamp: string }) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        const nameSort = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

        return {
            transactions: objectToArray<Transaction>(state.transactions).sort(timestampSort),
            purchases: objectToArray<Purchase>(state.purchases).sort(timestampSort),
            purchaseReturns: objectToArray<PurchaseReturn>(state.purchaseReturns).sort(timestampSort),
            saleReturns: objectToArray<SaleReturn>(state.saleReturns).sort(timestampSort),
            expenses: objectToArray<Expense>(state.expenses).sort(timestampSort),
            otherIncomes: objectToArray<OtherIncome>(state.otherIncomes).sort(timestampSort),
            customers: objectToArray<Customer>(state.customers).sort(nameSort),
            suppliers: objectToArray<Supplier>(state.suppliers).sort(nameSort),
            bankAccounts: objectToArray<BankAccount>(state.bankAccounts).sort(timestampSort),
            employees: objectToArray<Employee>(state.employees).sort(timestampSort),
            customerPayments: objectToArray<CustomerPayment>(state.customerPayments).sort(timestampSort),
            supplierPayments: objectToArray<SupplierPayment>(state.supplierPayments).sort(timestampSort),
            cashAdvances: objectToArray<CashAdvance>(state.cashAdvances).sort(timestampSort),
            tankReadings: objectToArray<TankReading>(state.tankReadings).sort(timestampSort),
            investments: objectToArray<Investment>(state.investments).sort(timestampSort),
            businessPartners: objectToArray<BusinessPartner>(state.businessPartners).sort(nameSort),
            stockAdjustments: objectToArray<StockAdjustment>(state.stockAdjustments).sort(timestampSort),
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

            const totalPurchased = processedState.purchases
                .filter(p => p.fuelType === ft)
                .reduce((sum, p) => sum + p.volume, 0);

            const totalSold = processedState.transactions
                .filter(t => t.fuelType === ft && t.volume)
                .reduce((sum, t) => sum + t.volume, 0);

            const totalReturnedToSupplier = processedState.purchaseReturns
                .filter(pr => pr.fuelType === ft)
                .reduce((sum, pr) => sum + pr.volume, 0);
            
            const totalReturnedFromCustomer = processedState.saleReturns
                .filter(sr => sr.fuelType === ft)
                .reduce((sum, sr) => sum + sr.volume, 0);

            const netAdjustments = processedState.stockAdjustments
                .filter(adj => adj.fuelType === ft)
                .reduce((sum, adj) => sum + adj.adjustment, 0);

            stock[ft] = (state.initialFuelStock[ft] || 0) + totalPurchased - totalSold - totalReturnedToSupplier + totalReturnedFromCustomer + netAdjustments;
        }

        return stock;

    }, [state.isLoaded, state.initialFuelStock, processedState.purchases, processedState.transactions, processedState.purchaseReturns, processedState.saleReturns, processedState.stockAdjustments]);
    

    const addEntity = useCallback(<T extends {timestamp: string}>(path: string, entity: Omit<T, 'id' | 'timestamp'>): T => {
        const newEntityWithTimestamp = { ...entity, timestamp: new Date().toISOString() };
        if (db) {
            const newEntityRef = push(ref(db, path));
            set(newEntityRef, newEntityWithTimestamp);
            return { ...newEntityWithTimestamp, id: newEntityRef.key! } as T;
        }
        // Offline fallback
        const offlineEntity = { ...newEntityWithTimestamp, id: crypto.randomUUID() } as T;
        setState(s => ({...s, [path]: {...(s as any)[path], [offlineEntity.id]: newEntityWithTimestamp } }));
        return offlineEntity;
    }, []);

    const updateEntity = useCallback(<T>(path: string, id: string, updates: Partial<T>) => {
        if (!db) return;
        update(ref(db, `${path}/${id}`), updates);
    }, []);

    const deleteEntity = useCallback((path: string, id: string) => {
        if (!db) return;
        remove(ref(db, `${path}/${id}`));
    }, []);
    
    // Specific Actions
    const addTransaction = (t: Omit<Transaction, 'id' | 'timestamp'>) => addEntity(PATHS.transactions, t);
    const deleteTransaction = (id: string) => deleteEntity(PATHS.transactions, id);
    
    const addPurchase = (p: Omit<Purchase, 'id' | 'timestamp'>) => addEntity(PATHS.purchases, p);
    const deletePurchase = (id: string) => deleteEntity(PATHS.purchases, id);

    const addPurchaseReturn = (pr: Omit<PurchaseReturn, 'id' | 'timestamp'>) => addEntity(PATHS.purchaseReturns, pr);
    const deletePurchaseReturn = (id: string) => deleteEntity(PATHS.purchaseReturns, id);

    const addSaleReturn = (sr: Omit<SaleReturn, 'id' | 'timestamp'>) => addEntity(PATHS.saleReturns, sr);
    const deleteSaleReturn = (id: string) => deleteEntity(PATHS.saleReturns, id);

    const addExpense = (e: Omit<Expense, 'id' | 'timestamp'>) => addEntity(PATHS.expenses, e);
    const deleteExpense = (id: string) => deleteEntity(PATHS.expenses, id);

    const addOtherIncome = (i: Omit<OtherIncome, 'id' | 'timestamp'>) => addEntity(PATHS.otherIncomes, i);
    const deleteOtherIncome = (id: string) => deleteEntity(PATHS.otherIncomes, id);

    const addCustomer = (c: Omit<Customer, 'id' | 'timestamp'>) => addEntity<Customer>(PATHS.customers, c);
    const updateCustomer = (id: string, u: Partial<Customer>) => updateEntity(PATHS.customers, id, u);
    const deleteCustomer = (id: string) => deleteEntity(PATHS.customers, id);
    
    const addSupplier = (s: Omit<Supplier, 'id' | 'timestamp'>) => addEntity(PATHS.suppliers, s);
    const deleteSupplier = (id: string) => deleteEntity(PATHS.suppliers, id);

    const addBankAccount = (a: Omit<BankAccount, 'id' | 'timestamp'>) => addEntity(PATHS.bankAccounts, a);
    const updateBankAccount = (id: string, u: Partial<BankAccount>) => updateEntity(PATHS.bankAccounts, id, u);
    const deleteBankAccount = (id: string) => deleteEntity(PATHS.bankAccounts, id);

    const addEmployee = (e: Omit<Employee, 'id' | 'timestamp'>) => addEntity(PATHS.employees, e);
    const updateEmployee = (id: string, u: Partial<Employee>) => updateEntity(PATHS.employees, id, u);
    const deleteEmployee = (id: string) => deleteEntity(PATHS.employees, id);

    const addCustomerPayment = (p: Omit<CustomerPayment, 'id' | 'timestamp'>) => addEntity(PATHS.customerPayments, p);
    const deleteCustomerPayment = (id: string) => deleteEntity(PATHS.customerPayments, id);

    const addSupplierPayment = (p: Omit<SupplierPayment, 'id' | 'timestamp'>) => addEntity(PATHS.supplierPayments, p);
    const deleteSupplierPayment = (id: string) => deleteEntity(PATHS.supplierPayments, id);

    const addCashAdvance = (a: Omit<CashAdvance, 'id' | 'timestamp'>) => addEntity(PATHS.cashAdvances, a);
    const deleteCashAdvance = (id: string) => deleteEntity(PATHS.cashAdvances, id);
    
    const addTankReading = (r: Omit<TankReading, 'id' | 'timestamp'>) => addEntity(PATHS.tankReadings, r);
    
    const addInvestment = (i: Omit<Investment, 'id' | 'timestamp'>) => addEntity(PATHS.investments, i);
    const deleteInvestment = (id: string) => deleteEntity(PATHS.investments, id);

    const addStockAdjustment = (adj: Omit<StockAdjustment, 'id' | 'timestamp'>) => addEntity(PATHS.stockAdjustments, adj);


    const addBusinessPartner = (partner: Omit<BusinessPartner, 'id' | 'timestamp'>) => {
        const customerRecord = addCustomer({
            name: partner.name,
            contact: partner.contact || '',
            area: 'Business Partner',
            isPartner: true,
        });

        if (db) {
            const partnerRef = ref(db, `${PATHS.businessPartners}/${customerRecord.id}`);
            set(partnerRef, { ...partner, timestamp: customerRecord.timestamp });
        }
    };
    
    const updateBusinessPartner = (id: string, updatedPartner: Partial<Omit<BusinessPartner, 'id' | 'timestamp'>>) => {
        updateEntity(PATHS.businessPartners, id, updatedPartner);
        if(updatedPartner.name || updatedPartner.contact) {
            updateCustomer(id, { name: updatedPartner.name, contact: updatedPartner.contact });
        }
    };

    const deleteBusinessPartner = (id: string) => deleteEntity(PATHS.businessPartners, id);

    const updateFuelPrice = (fuelType: FuelType, newPrice: number) => {
        if (!db || isNaN(newPrice) || newPrice < 0) return;
        update(ref(db), { [`${PATHS.fuelPrices}/${fuelType}`]: newPrice });
    };
    
    const clearAllData = () => {
        if(db) {
            Object.values(PATHS).forEach(path => {
                remove(ref(db, path));
            });
        }
        setState({
            transactions: {}, purchases: {}, purchaseReturns: {}, saleReturns: {},
            expenses: {}, otherIncomes: {}, customers: {}, suppliers: {},
            bankAccounts: {}, employees: {}, customerPayments: {}, supplierPayments: {},
            cashAdvances: {}, tankReadings: {}, investments: {}, businessPartners: {},
            stockAdjustments: {},
            fuelPrices: DEFAULT_FUEL_PRICES, initialFuelStock: DEFAULT_INITIAL_STOCK, 
            isLoaded: true
        });
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
        addTankReading,
        addInvestment,
        deleteInvestment,
        addBusinessPartner,
        updateBusinessPartner,
        deleteBusinessPartner,
        addStockAdjustment,
        updateFuelPrice,
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
