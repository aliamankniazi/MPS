

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
    DictionaryEntry,
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
import { firestore, auth } from '@/lib/firebase';
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    deleteDoc, 
    doc, 
    updateDoc, 
    serverTimestamp,
    getDocs,
    getDoc,
    setDoc,
    writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { isValid } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
    dictionary: 'dictionary',
    recycleBin: 'recycleBin',
    settings: 'settings',
};

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

interface AppSettings {
    fuelPrices: Record<FuelType, number>;
    initialFuelStock: Record<FuelType, number>;
    colorSettings: Record<string, string>;
}

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
    dictionary: DictionaryEntry[];
    recycleBin: RecycledItem[];
    settings: AppSettings;
    isLoaded: boolean;
}

interface ProcessedDatabaseState extends Omit<DatabaseState, 'isLoaded' | 'settings'> {
    fuelPrices: Record<FuelType, number>;
    initialFuelStock: Record<FuelType, number>;
    colorSettings: Record<string, string>;
}

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
    updateSupplier: (id: string, updates: Partial<Supplier>) => void;
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
    addDictionaryEntry: (entry: Omit<DictionaryEntry, 'id'>) => Promise<DictionaryEntry>;
    updateDictionaryEntry: (id: string, updates: Partial<DictionaryEntry>) => void;
    deleteDictionaryEntry: (id: string) => void;
    clearAllData: () => void;
    restoreFromRecycleBin: (item: RecycledItem) => void;
    deletePermanently: (id: string) => void;
    setDateRange: (dateRange: DateRange | undefined) => void;
}

type DatabaseContextType = ProcessedDatabaseState & DatabaseActions & { 
    fuelStock: Record<string, number>, 
    isLoaded: boolean,
    dateRange: DateRange | undefined,
};

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<DatabaseState>({
        transactions: [], purchases: [], purchaseReturns: [], saleReturns: [],
        expenses: [], otherIncomes: [], customers: [], suppliers: [],
        bankAccounts: [], employees: [], customerPayments: [], supplierPayments: [],
        cashAdvances: [], machines: [], machineReadings: [], investments: [], businessPartners: [],
        stockAdjustments: [], products: [], attendance: [], dictionary: [], recycleBin: [],
        settings: {
            fuelPrices: DEFAULT_FUEL_PRICES,
            initialFuelStock: DEFAULT_INITIAL_STOCK,
            colorSettings: DEFAULT_COLOR_SETTINGS,
        },
        isLoaded: false,
    });
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [user, setUser] = useState<User | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    useEffect(() => {
        if (!auth) {
            console.warn("Auth service not available. Data fetching will be skipped.");
            setIsAuthLoading(false);
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setIsAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (isAuthLoading) {
            return; // Wait for authentication state to be resolved.
        }

        if (!user) {
            // No user is signed in, so we don't fetch data to avoid permission errors.
            // We mark the state as loaded to allow the app to render login/signup pages.
            setState(s => ({ ...s, isLoaded: true }));
            return;
        }

        if (!firestore) {
            console.warn("Firestore is not configured. App may be in offline mode.");
            setState(s => ({ ...s, isLoaded: true }));
            return;
        }

        const subscriptions: (() => void)[] = [];
        const dataCollections = Object.keys(FIRESTORE_PATHS).filter(k => k !== 'settings') as (keyof typeof FIRESTORE_PATHS)[];
        const totalPaths = dataCollections.length + 1; // +1 for settings
        let loadedCount = 0;

        const handleLoad = () => {
            loadedCount++;
            if (loadedCount >= totalPaths) {
                if (!state.isLoaded) {
                    setState(s => ({ ...s, isLoaded: true }));
                }
            }
        };

        // Subscribe to settings document
        const settingsDocRef = doc(firestore, FIRESTORE_PATHS.settings, 'app-settings');
        const settingsUnsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as AppSettings;
                setState(prevState => ({ ...prevState, settings: data }));
            } else {
                 setState(prevState => ({ ...prevState, settings: {
                    fuelPrices: DEFAULT_FUEL_PRICES,
                    initialFuelStock: DEFAULT_INITIAL_STOCK,
                    colorSettings: DEFAULT_COLOR_SETTINGS,
                }}));
                // Optionally create the document with defaults if it doesn't exist
                setDoc(settingsDocRef, {
                    fuelPrices: DEFAULT_FUEL_PRICES,
                    initialFuelStock: DEFAULT_INITIAL_STOCK,
                    colorSettings: DEFAULT_COLOR_SETTINGS,
                }).catch(e => console.error("Could not create default settings", e));
            }
            handleLoad();
        }, (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                operation: 'get',
                path: settingsDocRef.path,
            }));
            handleLoad();
        });
        subscriptions.push(settingsUnsubscribe);

        // Subscribe to other collections
        dataCollections.forEach(key => {
            const path = FIRESTORE_PATHS[key];
            const q = collection(firestore, path);
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
                const data = querySnapshot.docs.map(doc => {
                    const docData = doc.data();
                    const dateFields = ['timestamp', 'date', 'hireDate', 'terminationDate', 'deletedAt', 'transactionDate', 'postingDate', 'invoiceDate'];
                    for (const field of dateFields) {
                        if (docData[field] && typeof docData[field].toDate === 'function') {
                           docData[field] = docData[field].toDate().toISOString();
                        }
                    }
                    return { id: doc.id, ...docData };
                }) as any[];
                setState(prevState => ({ ...prevState, [key]: data }));
                handleLoad();
            }, (error) => {
                const contextualError = new FirestorePermissionError({
                    operation: 'list',
                    path: path,
                });
                errorEmitter.emit('permission-error', contextualError);
                handleLoad();
            });
            subscriptions.push(unsubscribe);
        });

        return () => {
            subscriptions.forEach(unsubscribe => unsubscribe());
        };
    }, [user, isAuthLoading]);
    
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
            dictionary: [...state.dictionary].sort(createSorter('key', 'asc')),
            recycleBin: [...state.recycleBin].sort(createSorter('deletedAt')),
            fuelPrices: state.settings.fuelPrices,
            initialFuelStock: state.settings.initialFuelStock,
            colorSettings: state.settings.colorSettings,
        };
    }, [state]);
    
    const fuelStock = useMemo(() => {
        if (!state.isLoaded) return {};

        const stock: Record<string, number> = {};
        const mainProducts = processedState.products.filter(p => p.category === 'Main Product');

        for (const product of mainProducts) {
            const ft = product.name;
            
            const lastReading = processedState.machineReadings
                .filter(r => r.fuelType === ft)
                .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                
            let startingPoint = lastReading ? new Date(lastReading.timestamp) : new Date(0);
            let startingStock = lastReading ? lastReading.volume : (state.settings.initialFuelStock[ft as FuelType] || 0);

            const purchasesSince = processedState.purchases
                .filter(p => p.fuelType === ft && isValid(new Date(p.timestamp)) && new Date(p.timestamp) > startingPoint)
                .reduce((sum, p) => sum + p.volume, 0);

            const salesSince = processedState.transactions
                .filter(t => (t.fuelType === ft || t.product === ft) && t.volume && isValid(new Date(t.timestamp)) && new Date(t.timestamp) > startingPoint)
                .reduce((sum, t) => sum + t.volume, 0);

            const purchaseReturnsSince = processedState.purchaseReturns
                .filter(pr => pr.fuelType === ft && isValid(new Date(pr.timestamp)) && new Date(pr.timestamp) > startingPoint)
                .reduce((sum, pr) => sum + pr.volume, 0);
            
            const saleReturnsSince = processedState.saleReturns
                .filter(sr => sr.fuelType === ft && isValid(new Date(sr.timestamp)) && new Date(sr.timestamp) > startingPoint)
                .reduce((sum, sr) => sum + sr.volume, 0);
            
            const adjustmentsSince = processedState.stockAdjustments
                .filter(adj => adj.fuelType === ft && isValid(new Date(adj.timestamp)) && new Date(adj.timestamp) > startingPoint)
                .reduce((sum, adj) => sum + adj.adjustment, 0);

            stock[ft] = startingStock + purchasesSince - salesSince - purchaseReturnsSince + saleReturnsSince + adjustmentsSince;
        }

        return stock;

    }, [state.isLoaded, state.settings.initialFuelStock, processedState.products, processedState.machineReadings, processedState.purchases, processedState.transactions, processedState.purchaseReturns, processedState.saleReturns, processedState.stockAdjustments]);
    

    const addEntity = useCallback(<T extends { id: string }>(path: string, entity: Omit<T, 'id'> & { timestamp?: any }): Promise<T> => {
        if (!firestore) return Promise.reject(new Error("Firestore is not initialized."));
        
        const dataToSend: { [key: string]: any } = { ...entity };
        
        // If a timestamp is provided as a string, convert it to a Date object so Firestore saves it as a Timestamp.
        // Otherwise, use the server's timestamp.
        if (typeof (entity as any).timestamp === 'string' && isValid(new Date((entity as any).timestamp))) {
            dataToSend.timestamp = new Date((entity as any).timestamp);
        } else {
            dataToSend.timestamp = serverTimestamp();
        }
        
        return new Promise<T>((resolve, reject) => {
            addDoc(collection(firestore, path), dataToSend)
                .then(docRef => {
                    // For optimistic UI updates, we construct what the object will likely look like.
                    // The `onSnapshot` listener will provide the source-of-truth update shortly.
                    const optimisticTimestamp = (entity as any).timestamp || new Date().toISOString();
                    resolve({ ...entity, id: docRef.id, timestamp: optimisticTimestamp } as T);
                })
                .catch(error => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: path,
                        operation: 'create',
                        requestResourceData: dataToSend,
                    }));
                    reject(error);
                });
        });
    }, []);

    const updateEntity = useCallback(<T,>(path: string, id: string, updates: Partial<T>) => {
        if (!firestore) return;
        const docRef = doc(firestore, path, id);
        updateDoc(docRef, updates).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: updates,
            }));
        });
    }, []);

    const deleteEntity = useCallback((path: string, id: string) => {
        if (!firestore) return;
        const sourceRef = doc(firestore, path, id);
        
        getDoc(sourceRef).then(docSnapshot => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                const recycledItem: Omit<RecycledItem, 'id'> = {
                    originalPath: `${path}/${id}`,
                    deletedAt: new Date().toISOString(),
                    data: data,
                };
                const recycleBinRef = collection(firestore, FIRESTORE_PATHS.recycleBin);
                
                addDoc(recycleBinRef, recycledItem).then(() => {
                    deleteDoc(sourceRef).catch(error => {
                        errorEmitter.emit(
                            'permission-error',
                            new FirestorePermissionError({ path: sourceRef.path, operation: 'delete' })
                        );
                    });
                }).catch(error => {
                     errorEmitter.emit(
                        'permission-error',
                        new FirestorePermissionError({ path: recycleBinRef.path, operation: 'create', requestResourceData: recycledItem })
                    );
                });

            } else {
                 console.warn(`Attempted to delete non-existent entity at ${path}/${id}`);
            }
        }).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: sourceRef.path, operation: 'get' }));
        });
    }, []);

    const restoreFromRecycleBin = useCallback((item: RecycledItem) => {
        if (!firestore) return;
        const originalRef = doc(firestore, item.originalPath);
        
        setDoc(originalRef, item.data).then(() => {
            const recycleBinDocRef = doc(firestore, FIRESTORE_PATHS.recycleBin, item.id);
            deleteDoc(recycleBinDocRef).catch(error => {
                errorEmitter.emit(
                    'permission-error',
                    new FirestorePermissionError({
                        path: recycleBinDocRef.path,
                        operation: 'delete',
                    })
                );
            });
        }).catch(error => {
            errorEmitter.emit(
                'permission-error',
                new FirestorePermissionError({
                    path: originalRef.path,
                    operation: 'create', // Using setDoc, can be create or update
                    requestResourceData: item.data
                })
            );
        });
    }, []);

    const deletePermanently = useCallback((id: string) => {
        if (!firestore) return;
        const docRef = doc(firestore, FIRESTORE_PATHS.recycleBin, id);
        deleteDoc(docRef).catch(error => {
            errorEmitter.emit(
                'permission-error',
                new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'delete'
                })
            );
        });
    }, []);
    
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
    const updateSupplier = (id: string, u: Partial<Supplier>) => updateEntity(FIRESTORE_PATHS.suppliers, id, u);
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
        const lastPurchase = processedState.purchases
            .filter(p => p.fuelType === adj.fuelType)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
        
        const costPerLitre = lastPurchase 
            ? lastPurchase.totalCost / lastPurchase.volume 
            : (state.settings.fuelPrices[adj.fuelType as FuelType] || 0);
        
        const value = Math.abs(adj.adjustment) * costPerLitre;

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
        if (!firestore) return;
        const partnerRef = doc(firestore, FIRESTORE_PATHS.businessPartners, id);
        
        const dataToSet = {
            ...updatedPartner,
            timestamp: serverTimestamp(),
        };

        setDoc(partnerRef, dataToSet, { merge: true }).catch(error => {
             errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: partnerRef.path,
                operation: 'write',
                requestResourceData: dataToSet,
            }));
        });

        if(updatedPartner.name || updatedPartner.contact) {
            updateCustomer(id, { name: updatedPartner.name, contact: updatedPartner.contact });
        }
    };

    const deleteBusinessPartner = (id: string) => deleteEntity(FIRESTORE_PATHS.businessPartners, id);

    const setFuelStock = useCallback((fuelType: FuelType, newStock: number) => {
        if (!firestore) return;
        const settingsRef = doc(firestore, FIRESTORE_PATHS.settings, 'app-settings');
        updateDoc(settingsRef, { [`initialFuelStock.${fuelType}`]: newStock });
    }, []);

    const updateFuelPrice = (fuelType: FuelType, newPrice: number) => {
        if (!firestore || isNaN(newPrice) || newPrice < 0) return;
        const settingsRef = doc(firestore, FIRESTORE_PATHS.settings, 'app-settings');
        updateDoc(settingsRef, { [`fuelPrices.${fuelType}`]: newPrice });
    };

    const updateColorSetting = (key: string, color: string) => {
        if (!firestore) return;
        const settingsRef = doc(firestore, FIRESTORE_PATHS.settings, 'app-settings');
        updateDoc(settingsRef, { [`colorSettings.${key}`]: color });
    };
    
    const clearAllData = async () => {
        if (!firestore) return;
        const batch = writeBatch(firestore);
        for (const path of Object.values(FIRESTORE_PATHS)) {
            if (path === 'settings') continue; // Don't delete settings
            try {
                const querySnapshot = await getDocs(collection(firestore, path));
                querySnapshot.docs.forEach(doc => batch.delete(doc.ref));
            } catch(e: any) {
                 errorEmitter.emit(
                    'permission-error',
                    new FirestorePermissionError({ path: path, operation: 'list' })
                );
            }
        }
        await batch.commit().catch(e => {
            console.error("Batch delete failed", e);
             errorEmitter.emit(
                'permission-error',
                new FirestorePermissionError({ path: 'batch delete', operation: 'write' })
            );
        });
    };

    const addDictionaryEntry = (d: Omit<DictionaryEntry, 'id'>) => addEntity<DictionaryEntry>(FIRESTORE_PATHS.dictionary, d);
    const updateDictionaryEntry = (id: string, u: Partial<DictionaryEntry>) => updateEntity(FIRESTORE_PATHS.dictionary, id, u);
    const deleteDictionaryEntry = (id: string) => deleteEntity(FIRESTORE_PATHS.dictionary, id);

    const value: DatabaseContextType = {
        ...processedState,
        isLoaded: state.isLoaded,
        fuelStock,
        dateRange,
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
        updateSupplier,
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
        addDictionaryEntry,
        updateDictionaryEntry,
        deleteDictionaryEntry,
        clearAllData,
        restoreFromRecycleBin,
        deletePermanently,
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
