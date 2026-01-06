
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BusinessPartner } from '@/lib/types';
import { useCustomers } from './use-customers';
import { db } from '@/lib/firebase';
import { ref, onValue, set, push, remove, update } from 'firebase/database';

const DB_PATH = 'businessPartners';

export function useBusinessPartners() {
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { customers, addCustomer, updateCustomer: updateCustomerRecord } = useCustomers();

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }
    const partnersRef = ref(db, DB_PATH);
    const unsubscribe = onValue(partnersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const partnersList: BusinessPartner[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a,b) => a.name.localeCompare(b.name));
            setBusinessPartners(partnersList);
        } else {
            setBusinessPartners([]);
        }
        setIsLoaded(true);
    });
    return () => unsubscribe();
  }, []);


  const addBusinessPartner = useCallback((partner: Omit<BusinessPartner, 'id' | 'timestamp'>): BusinessPartner => {
    const customerRecord = addCustomer({
        name: partner.name,
        contact: partner.contact || '',
        area: 'Business Partner',
        isPartner: true,
    });

    const newPartner: BusinessPartner = { 
        ...partner, 
        id: customerRecord.id,
        timestamp: customerRecord.timestamp 
    };

    if (db) {
        const partnerRef = ref(db, `${DB_PATH}/${customerRecord.id}`);
        set(partnerRef, { ...partner, timestamp: customerRecord.timestamp });
    }
    
    return newPartner;
  }, [addCustomer]);

  const updateBusinessPartner = useCallback((id: string, updatedPartner: Partial<Omit<BusinessPartner, 'id' | 'timestamp'>>) => {
    if (db) {
      const partnerRef = ref(db, `${DB_PATH}/${id}`);
      update(partnerRef, updatedPartner);
    }
    
    // Also update the corresponding customer record
    if(updatedPartner.name || updatedPartner.contact) {
        updateCustomerRecord(id, { name: updatedPartner.name, contact: updatedPartner.contact });
    }
  }, [updateCustomerRecord]);

  const deleteBusinessPartner = useCallback((id: string) => {
    if (!db) return;
    // Note: We don't delete the customer record to preserve their ledger history.
    const partnerRef = ref(db, `${DB_PATH}/${id}`);
    remove(partnerRef);
  }, []);

  const clearBusinessPartners = useCallback(() => {
    if (!db) return;
    const partnersRef = ref(db, DB_PATH);
    remove(partnersRef);
  }, []);

  return { businessPartners, addBusinessPartner, updateBusinessPartner, deleteBusinessPartner, clearBusinessPartners, isLoaded };
}
