
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Employee } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'employees';

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }
    const employeesRef = ref(db, DB_PATH);
    const unsubscribe = onValue(employeesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const employeesList: Employee[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setEmployees(employeesList);
        } else {
            setEmployees([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);


  const addEmployee = useCallback((employee: Omit<Employee, 'id' | 'timestamp' | 'hireDate'> & { hireDate: Date }) => {
    if (!db) return;
    const newEmployeeRef = push(ref(db, DB_PATH));
    const newEmployee = {
        ...employee,
        timestamp: new Date().toISOString(),
        hireDate: employee.hireDate.toISOString()
    };
    set(newEmployeeRef, newEmployee);
  }, []);

  const clearEmployees = useCallback(() => {
    if (!db) return;
    const employeesRef = ref(db, DB_PATH);
    remove(employeesRef);
  }, []);

  return { employees, addEmployee, clearEmployees, isLoaded };
}
