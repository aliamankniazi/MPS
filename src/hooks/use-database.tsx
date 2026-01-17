
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
    RecycledItem,
    SaleReturn,
    StockAdjustment,
    Supplier,
    SupplierPayment,
    Transaction,
    DateRange,
} from '@/lib/types';
import { db, firestore } from '@/lib/firebase';
import { ref, onValue, remove, set, update } from 'firebase/database';
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    deleteDoc, 
    doc, 
    updateDoc, 
    serverTimestamp,
    setDoc,
    getDocs, 
} from 'firebase/firestore';
import { isValid } from 'date-fns';

// Centralized paths
const FIRESTORE_PATHS = {
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
    stockAdjustments: 'stockAdjustments',
    products: 'products',
    attendance: 'attendance',
    recycleBin: 'recycleBin',
};

const RTDB_PATHS = {
    fuelPrices: 'fuelPrices',
    initialFuelStock: 'initialFuelStock',
    colorSettings: 'colorSettings',
}

const ALL_PATHS = {...FIRESTORE_PATHS, ...RTDB_PATHS };

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

const DEFAULT_COLOR_SETTINGS: Record<string, string> = {
    'Sale': '#22C55E', // green-500
    'Credit Sale': '#3B82F6', // blue-500
    'Customer Payment': '#14B8A6', // teal-500
    'Purchase': '#14B8A6', // teal-500
    'Purchase Return': '#F97316', // orange-500
    'Sale Return': '#FBBF24', // yellow-500
    'Expense': '#EF4444', // red-500
    'Cash Advance': '#EF4444', // red-500
    'Salary': '#EC4899', // pink-500
    'Supplier Payment': '#EC4899', // pink-500
    'Other Income': '#22C55E', // green-500
    'Stock Surplus': '#22C55E', // green-500
    'Stock Shortage': '#EF4444', // red-500
    'Investment': '#6366F1', // indigo-500
    'Withdrawal': '#8B5CF6', // purple-500
};


interface DatabaseState {
    [key: string]: any; // Allow any key
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
    recycleBin: RecycledItem[];
    fuelPrices: Record<FuelType, number>;
    initialFuelStock: Record<FuelType, number>;
    colorSettings: Record<string, string>;
    isLoaded: boolean;
}

interface ProcessedDatabaseState extends Omit<DatabaseState, 'isLoaded'> {}

interface DatabaseActions {
    addTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<Transaction>;
    deleteTransaction: (id: string) => void;
    addPurchase: (purchase: Omit<Purchase, 'id'>) => Promise<Purchase>;
    deletePurchase: (id: string) => void;
    addPurchaseReturn: (pr: Omit<PurchaseReturn, 'id'>) => Promise<PurchaseReturn>;
    deletePurchaseReturn: (id: string) => void;
    addSaleReturn: (sr: Omit<SaleReturn, 'id'>) => Promise<SaleReturn>;
    deleteSaleReturn: (id: string) => void;
    addExpense: (expense: Omit<Expense, 'id'>) => Promise<Expense>;
    deleteExpense: (id: string) => void;
    addOtherIncome: (income: Omit<OtherIncome, 'id'>) => Promise<OtherIncome>;
    deleteOtherIncome: (id: string) => void;
    addCustomer: (customer: Omit<Customer, 'id'>) => Promise<Customer>;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    deleteCustomer: (id: string) => void;
    addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<Supplier>;
    deleteSupplier: (id: string) => void;
    addBankAccount: (account: Omit<BankAccount, 'id'>) => Promise<BankAccount>;
    updateBankAccount: (id: string, updates: Partial<BankAccount>) => void;
    deleteBankAccount: (id: string) => void;
    addEmployee: (employee: Omit<Employee, 'id'>) => Promise<Employee>;
    updateEmployee: (id: string, updates: Partial<Employee> & { terminationDate?: string | null }) => void;
    deleteEmployee: (id: string) => void;
    addCustomerPayment: (payment: Omit<CustomerPayment, 'id'>) => Promise<CustomerPayment>;
    deleteCustomerPayment: (id: string) => void;
    addSupplierPayment: (payment: Omit<SupplierPayment, 'id'>) => Promise<SupplierPayment>;
    deleteSupplierPayment: (id: string) => void;
    addCashAdvance: (advance: Omit<CashAdvance, 'id'>) => Promise<CashAdvance>;
    deleteCashAdvance: (id: string) => void;
    addMachine: (machine: Omit<Machine, 'id'>) => Promise<Machine>;
    deleteMachine: (id: string) => void;
    addMachineReading: (reading: Omit<MachineReading, 'id'>) => Promise<MachineReading>;
    addInvestment: (investment: Omit<Investment, 'id'>) => Promise<Investment>;
    deleteInvestment: (id: string) => void;
    addBusinessPartner: (partner: Omit<BusinessPartner, 'id'>) => Promise<void>;
    updateBusinessPartner: (id: string, updates: Partial<BusinessPartner>) => void;
    deleteBusinessPartner: (id: string) => void;
    addStockAdjustment: (adjustment: Omit<StockAdjustment, 'id' | 'value'>) => void;
    deleteStockAdjustment: (id: string) => void;
    addAttendance: (record: Omit<AttendanceRecord, 'id'>) => Promise<void>;
    setFuelStock: (fuelType: FuelType, newStock: number) => void;
    updateFuelPrice: (fuelType: FuelType, newPrice: number) => void;
    updateColorSetting: (key: string, color: string) => void;
    addProduct: (product: Omit<Product, 'id'>) => Promise<Product>;
    updateProduct: (id: string, updates: Partial<Product>) => void;
    deleteProduct: (id: string) => void;
    clearAllData: () => void;
    restoreFromRecycleBin: (item: RecycledItem) => Promise<void>;
    deletePermanently: (id: string) => Promise<void>;
    dateRange: DateRange | undefined;
    setDateRange: React.Dispatch<React.SetStateAction<DateRange | undefined>>;
}

type DatabaseContextType = ProcessedDatabaseState & DatabaseActions & { fuelStock: Record<FuelType, number>, isLoaded: boolean };

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<DatabaseState>({
        transactions: [], purchases: [], purchaseReturns: [], saleReturns: [],
        expenses: [], otherIncomes: [], customers: [], suppliers: [],
        bankAccounts: [], employees: [], customerPayments: [], supplierPayments: [],
        cashAdvances: [], machines: [], machineReadings: [], investments: [], businessPartners: [],
        stockAdjustments: [], products: [], attendance: [], recycleBin: [],
        fuelPrices: DEFAULT_FUEL_PRICES,
        initialFuelStock: DEFAULT_INITIAL_STOCK,
        colorSettings: DEFAULT_COLOR_SETTINGS,
        isLoaded: false,
    });
    
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        if (!firestore || !db) {
            console.warn("Firebase is not fully configured. App may be in offline mode.");
            setState(s => ({ ...s, isLoaded: true }));
            return;
        }

        const subscriptions: (() => void)[] = [];
        const firestorePaths = Object.keys(FIRESTORE_PATHS) as (keyof typeof FIRESTORE_PATHS)[];
        const rtdbPaths = Object.keys(RTDB_PATHS) as (keyof typeof RTDB_PATHS)[];
        const totalPaths = firestorePaths.length + rtdbPaths.length;
        let loadedCount = 0;

        const handleLoad = () => {
            loadedCount++;
            if (loadedCount >= totalPaths) {
                if (!state.isLoaded) {
                    setState(s => ({ ...s, isLoaded: true }));
                }
            }
        };

        firestorePaths.forEach(key => {
            const path = FIRESTORE_PATHS[key];
            const q = collection(firestore, path);
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
                const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
                setState(prevState => ({ ...prevState, [key]: data }));
                handleLoad();
            }, (error) => {
                console.error(`Error fetching Firestore collection ${key}:`, error);
                handleLoad();
            });
            subscriptions.push(unsubscribe);
        });
        
        rtdbPaths.forEach(key => {
            const path = RTDB_PATHS[key];
            const dbRef = ref(db, path);
            const unsubscribe = onValue(dbRef, (snapshot) => {
                const defaultValue = key === 'colorSettings' ? DEFAULT_COLOR_SETTINGS : key === 'fuelPrices' ? DEFAULT_FUEL_PRICES : DEFAULT_INITIAL_STOCK;
                setState(prevState => ({ ...prevState, [key]: snapshot.val() || defaultValue }));
                handleLoad();
            }, (error) => {
                console.error(`Error fetching RTDB path ${key}:`, error);
                handleLoad();
            });
            subscriptions.push(unsubscribe);
        });


        return () => {
            subscriptions.forEach(unsubscribe => unsubscribe());
        };
    }, []);
    
    const processedState: ProcessedDatabaseState = useMemo(() => {
        const createSorter = (key: string, order: 'asc' | 'desc' = 'desc') => (a: any, b: any) => {
            const valA = a[key];
            const valB = b[key];

            if (typeof valA === 'string' && typeof valB === 'string') {
                if (Date.parse(valA) && Date.parse(valB)) {
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
            transactions: [...state.transactions].sort(createSorter('timestamp')),
            purchases: [...state.purchases].sort(createSorter('timestamp')),
            purchaseReturns: [...state.purchaseReturns].sort(createSorter('timestamp')),
            saleReturns: [...state.saleReturns].sort(createSorter('timestamp')),
            expenses: [...state.expenses].sort(createSorter('timestamp')),
            otherIncomes: [...state.otherIncomes].sort(createSorter('timestamp')),
            customers: [...state.customers].sort(createSorter('name', 'asc')),
            suppliers: [...state.suppliers].sort(createSorter('name', 'asc')),
            bankAccounts: [...state.bankAccounts].sort(createSorter('timestamp')),
            employees: [...state.employees].sort(createSorter('name', 'asc')),
            customerPayments: [...state.customerPayments].sort(createSorter('timestamp')),
            supplierPayments: [...state.supplierPayments].sort(createSorter('timestamp')),
            cashAdvances: [...state.cashAdvances].sort(createSorter('timestamp')),
            machines: [...state.machines].sort(createSorter('name', 'asc')),
            machineReadings: [...state.machineReadings].sort(createSorter('timestamp')),
            investments: [...state.investments].sort(createSorter('timestamp')),
            businessPartners: [...state.businessPartners].sort(createSorter('name', 'asc')),
            stockAdjustments: [...state.stockAdjustments].sort(createSorter('timestamp')),
            products: [...state.products].sort(createSorter('name', 'asc')),
            attendance: [...state.attendance].sort(createSorter('date')),
            recycleBin: [...state.recycleBin].sort(createSorter('deletedAt')),
            fuelPrices: state.fuelPrices,
            initialFuelStock: state.initialFuelStock,
            colorSettings: state.colorSettings,
        };
    }, [state]);
    
    const fuelStock = useMemo(() => {
        const stock = { ...DEFAULT_INITIAL_STOCK };
        
        if (!state.isLoaded) return stock;

        for (const fuelType in stock) {
            const ft = fuelType as FuelType;
            
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
    

    const addEntity = useCallback(async <T extends { id: string, timestamp?: any }>(path: string, entity: Omit<T, 'id'>): Promise<T> => {
        if (!firestore) throw new Error("Firestore is not initialized.");

        const entityWithTimestamp = { ...entity, timestamp: entity.timestamp || new Date().toISOString() };
        
        const docRef = await addDoc(collection(firestore, path), {
            ...entity,
            timestamp: serverTimestamp()
        });

        const transactionDate = (entity as any).timestamp ? new Date((entity as any).timestamp) : new Date();
        if (isValid(transactionDate)) {
             setDateRange({ from: transactionDate, to: transactionDate });
        }
        
        return { ...entityWithTimestamp, id: docRef.id } as T;
    }, [firestore]);

    const updateEntity = useCallback(<T,>(path: string, id: string, updates: Partial<T>) => {
        if (!firestore) return;
        updateDoc(doc(firestore, path, id), updates);
    }, [firestore]);

    const deleteEntity = useCallback(async (path: string, id: string) => {
        if (!firestore) return;

        const sourceRef = doc(firestore, path, id);
        const snapshot = await getDocs(collection(firestore, path));
        const docToDelete = snapshot.docs.find(d => d.id === id);

        if (docToDelete) {
            const data = docToDelete.data();
            const recycledItem: Omit<RecycledItem, 'id'> = {
                originalPath: `${path}/${id}`,
                deletedAt: new Date().toISOString(),
                data: data,
            };
            await addDoc(collection(firestore, FIRESTORE_PATHS.recycleBin), recycledItem);
            await deleteDoc(sourceRef);
        } else {
            console.warn(`Attempted to delete non-existent entity at ${path}/${id}`);
        }
    }, [firestore]);

    const restoreFromRecycleBin = useCallback(async (item: RecycledItem) => {
        if (!firestore) return;
        const originalRef = doc(firestore, item.originalPath);
        await setDoc(originalRef, item.data);
        await deleteDoc(doc(firestore, FIRESTORE_PATHS.recycleBin, item.id));
    }, [firestore]);

    const deletePermanently = useCallback(async (id: string) => {
        if (!firestore) return;
        await deleteDoc(doc(firestore, FIRESTORE_PATHS.recycleBin, id));
    }, [firestore]);
    
    // Specific Actions
    const addTransaction = (t: Omit<Transaction, 'id'>) => addEntity<Transaction>(FIRESTORE_PATHS.transactions, t);
    const deleteTransaction = (id: string) => deleteEntity(FIRESTORE_PATHS.transactions, id);
    
    const addPurchase = (p: Omit<Purchase, 'id'>) => addEntity<Purchase>(FIRESTORE_PATHS.purchases, p);
    const deletePurchase = (id: string) => deleteEntity(FIRESTORE_PATHS.purchases, id);

    const addPurchaseReturn = (pr: Omit<PurchaseReturn, 'id'>) => addEntity<PurchaseReturn>(FIRESTORE_PATHS.purchaseReturns, pr);
    const deletePurchaseReturn = (id: string) => deleteEntity(FIRESTORE_PATHS.purchaseReturns, id);

    const addSaleReturn = (sr: Omit<SaleReturn, 'id'>) => addEntity<SaleReturn>(FIRESTORE_PATHS.saleReturns, sr);
    const deleteSaleReturn = (id: string) => deleteEntity(FIRESTORE_PATHS.saleReturns, id);

    const addExpense = (e: Omit<Expense, 'id'>) => addEntity<Expense>(FIRESTORE_PATHS.expenses, e);
    const deleteExpense = (id: string) => deleteEntity(FIRESTORE_PATHS.expenses, id);

    const addOtherIncome = (i: Omit<OtherIncome, 'id'>) => addEntity<OtherIncome>(FIRESTORE_PATHS.otherIncomes, i);
    const deleteOtherIncome = (id: string) => deleteEntity(FIRESTORE_PATHS.otherIncomes, id);

    const addCustomer = (c: Omit<Customer, 'id'>) => addEntity<Customer>(FIRESTORE_PATHS.customers, c);
    const updateCustomer = (id: string, u: Partial<Customer>) => updateEntity(FIRESTORE_PATHS.customers, id, u);
    const deleteCustomer = (id: string) => deleteEntity(FIRESTORE_PATHS.customers, id);
    
    const addSupplier = (s: Omit<Supplier, 'id'>) => addEntity<Supplier>(FIRESTORE_PATHS.suppliers, s);
    const deleteSupplier = (id: string) => deleteEntity(FIRESTORE_PATHS.suppliers, id);

    const addBankAccount = (a: Omit<BankAccount, 'id'>) => addEntity<BankAccount>(FIRESTORE_PATHS.bankAccounts, a);
    const updateBankAccount = (id: string, u: Partial<BankAccount>) => updateEntity(FIRESTORE_PATHS.bankAccounts, id, u);
    const deleteBankAccount = (id: string) => deleteEntity(FIRESTORE_PATHS.bankAccounts, id);

    const addEmployee = (e: Omit<Employee, 'id'>) => addEntity<Employee>(FIRESTORE_PATHS.employees, e);
    const updateEmployee = (id: string, u: Partial<Employee> & { terminationDate?: string | null }) => updateEntity(FIRESTORE_PATHS.employees, id, u);
    const deleteEmployee = (id: string) => deleteEntity(FIRESTORE_PATHS.employees, id);

    const addCustomerPayment = (p: Omit<CustomerPayment, 'id'>) => addEntity<CustomerPayment>(FIRESTORE_PATHS.customerPayments, p);
    const deleteCustomerPayment = (id: string) => deleteEntity(FIRESTORE_PATHS.customerPayments, id);

    const addSupplierPayment = (p: Omit<SupplierPayment, 'id'>) => addEntity<SupplierPayment>(FIRESTORE_PATHS.supplierPayments, p);
    const deleteSupplierPayment = (id: string) => deleteEntity(FIRESTORE_PATHS.supplierPayments, id);

    const addCashAdvance = (a: Omit<CashAdvance, 'id'>) => addEntity<CashAdvance>(FIRESTORE_PATHS.cashAdvances, a);
    const deleteCashAdvance = (id: string) => deleteEntity(FIRESTORE_PATHS.cashAdvances, id);
    
    const addMachine = (m: Omit<Machine, 'id'>) => addEntity<Machine>(FIRESTORE_PATHS.machines, m);
    const deleteMachine = (id: string) => deleteEntity(FIRESTORE_PATHS.machines, id);

    const addMachineReading = (r: Omit<MachineReading, 'id'>) => addEntity<MachineReading>(FIRESTORE_PATHS.machineReadings, r);
    
    const addInvestment = (i: Omit<Investment, 'id'>) => addEntity<Investment>(FIRESTORE_PATHS.investments, i);
    const deleteInvestment = (id: string) => deleteEntity(FIRESTORE_PATHS.investments, id);

    const addStockAdjustment = async (adj: Omit<StockAdjustment, 'id' | 'value'>) => {
        let value = 0;
        if (adj.adjustment > 0) {
            const salePrice = state.fuelPrices[adj.fuelType] || 0;
            value = adj.adjustment * salePrice;
        } else {
            const lastPurchase = processedState.purchases
                .filter(p => p.fuelType === adj.fuelType)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            const purchasePrice = lastPurchase ? lastPurchase.totalCost / lastPurchase.volume : 0;
            value = Math.abs(adj.adjustment) * purchasePrice;
        }

        await addEntity(FIRESTORE_PATHS.stockAdjustments, { ...adj, value });
    };
    const deleteStockAdjustment = (id: string) => deleteEntity(FIRESTORE_PATHS.stockAdjustments, id);

    const addProduct = (p: Omit<Product, 'id'>) => addEntity<Product>(FIRESTORE_PATHS.products, p);
    const updateProduct = (id: string, u: Partial<Product>) => updateEntity(FIRESTORE_PATHS.products, id, u);
    const deleteProduct = (id: string) => deleteEntity(FIRESTORE_PATHS.products, id);
    
    const addAttendance = async (record: Omit<AttendanceRecord, 'id'>) => {
        const todayStr = record.date.substring(0, 10);
        const existingRecord = processedState.attendance.find(
          a => a.employeeId === record.employeeId && a.date.startsWith(todayStr)
        );
    
        if (existingRecord) {
          await updateEntity(FIRESTORE_PATHS.attendance, existingRecord.id, { status: record.status });
        } else {
          await addEntity(FIRESTORE_PATHS.attendance, record);
        }
    };


    const addBusinessPartner = async (partner: Omit<BusinessPartner, 'id'>) => {
        const customerRecord = await addCustomer({
            name: partner.name,
            contact: partner.contact || '',
            area: 'Business Partner',
            isPartner: true,
            openingBalance: 0,
            timestamp: new Date().toISOString(),
        });

        if (firestore) {
            const partnerRef = doc(firestore, FIRESTORE_PATHS.businessPartners, customerRecord.id);
            await setDoc(partnerRef, { ...partner, timestamp: serverTimestamp() });
        }
    };
    
    const updateBusinessPartner = (id: string, updatedPartner: Partial<Omit<BusinessPartner, 'id'>>) => {
        updateEntity(FIRESTORE_PATHS.businessPartners, id, updatedPartner);
        if(updatedPartner.name || updatedPartner.contact) {
            updateCustomer(id, { name: updatedPartner.name, contact: updatedPartner.contact });
        }
    };

    const deleteBusinessPartner = (id: string) => deleteEntity(FIRESTORE_PATHS.businessPartners, id);

    const setFuelStock = useCallback((fuelType: FuelType, newStock: number) => {
        if (!db) return;
        update(ref(db), { [`${RTDB_PATHS.initialFuelStock}/${fuelType}`]: newStock });
    }, [db]);

    const updateFuelPrice = (fuelType: FuelType, newPrice: number) => {
        if (!db || isNaN(newPrice) || newPrice < 0) return;
        update(ref(db), { [`${RTDB_PATHS.fuelPrices}/${fuelType}`]: newPrice });
    };

    const updateColorSetting = (key: string, color: string) => {
        if (!db) return;
        update(ref(db), { [`${RTDB_PATHS.colorSettings}/${key}`]: color });
    };
    
    const clearAllData = async () => {
        if (firestore) {
            for (const path of Object.values(FIRESTORE_PATHS)) {
                const querySnapshot = await getDocs(collection(firestore, path));
                const deletePromises = querySnapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
                await Promise.all(deletePromises);
            }
        }
        if (db) {
            Object.values(RTDB_PATHS).forEach(path => {
                if (path) remove(ref(db, path));
            });
        }
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
        deleteStockAdjustment,
        addAttendance,
        setFuelStock,
        updateFuelPrice,
        updateColorSetting,
        addProduct,
        updateProduct,
        deleteProduct,
        clearAllData,
        restoreFromRecycleBin,
        deletePermanently,
        dateRange,
        setDateRange,
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
