'use client';

import { format, differenceInDays, isValid } from 'date-fns';
import numWords from 'num-words';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';


interface InvoiceItem {
  name: string;
  group: string;
  quantity: number;
  price: number;
  amount: number;
}

interface InvoiceData {
  type: 'Sale' | 'Purchase' | 'Customer Payment' | 'Cash Advance' | 'Meter Reading' | 'Expense' | 'Salary Payment' | 'Investment' | 'Withdrawal' | 'Other Income';
  id: string;
  date: string;
  partner: {
    name: string;
    contact: string;
    balance: number;
    openingBalance?: number;
    closingBalance?: number;
  };
  items: InvoiceItem[];
  totalAmount: number;
  paymentMethod: string;
  bankDetails?: {
    name: string;
    number: string;
  }
  notes?: string;
}

/** A figure a record may not carry (a sale with no quantity): nothing, never a crash. */
const n = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const companyDetails = {
    name: 'Mianwali Petroleum Service',
    branch: 'Ballo Khel Road Opposite Assistant Commisioner House Mianwali',
    mobile1: '03335425401',
    mobile2: '03335425401',
    dealsIn: 'HSD, PREMIER, EURO 5',
    saleTaxNo: '0400046568661',
    ntn: '04656866',
    bank: {
        title: 'Mianwali Petroleum Service',
        name: 'UBL',
        accountNo: '0327337274268',
        iban: 'PK26UNIL0109000337274268',
    }
}

const InvoiceLogo = () => (
    <div className="flex items-center justify-center w-16 h-16 bg-red-600 text-white rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" x2="15" y1="22" y2="22"></line>
            <line x1="4" x2="14" y1="9" y2="9"></line>
            <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"></path>
            <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 4h-2"></path>
        </svg>
    </div>
);


export function Invoice({ data }: { data: InvoiceData }) {
    
  const totalAmountInWords = data.type !== 'Meter Reading' ? numWords(Math.floor(data.totalAmount)) : '';
  const [currentTime, setCurrentTime] = useState('');
  const isValidInvoiceDate = data.date && isValid(new Date(data.date));

  const getDesiDate = (date: Date): { day: number; month: string; year: number } => {
    const year = date.getFullYear();
    const month = date.getMonth(); 
    const day = date.getDate();
  
    const monthData = [
        { name: 'چیت', length: 31, start: { m: 2, d: 14 } },
        { name: 'وساکھ', length: 31, start: { m: 3, d: 14 } },
        { name: 'جیٹھ', length: 31, start: { m: 4, d: 15 } },
        { name: 'ہاੜ', length: 31, start: { m: 5, d: 15 } },
        { name: 'ساوڻ', length: 31, start: { m: 6, d: 16 } },
        { name: 'بھادوں', length: 30, start: { m: 7, d: 16 } },
        { name: 'اسو', length: 30, start: { m: 8, d: 15 } },
        { name: 'کاتک', length: 30, start: { m: 9, d: 15 } },
        { name: 'مگھر', length: 30, start: { m: 10, d: 14 } },
        { name: 'پوہ', length: 30, start: { m: 11, d: 14 } },
        { name: 'ماگھ', length: 30, start: { m: 0, d: 13 } },
        { name: 'پھگڻ', length: 30, start: { m: 1, d: 12 } }
    ];

    let bikramiYear = year + 57;
    let desiDay = 0;
    let desiMonth = '';

    let gregorianYearForBikramiStart = year;
    if (month < 2 || (month === 2 && day < 14)) {
        gregorianYearForBikramiStart--;
        bikramiYear--; 
    }

    const monthStarts = monthData.map(m => ({
        ...m,
        startDate: new Date(m.start.m >= 2 ? gregorianYearForBikramiStart : gregorianYearForBikramiStart + 1, m.start.m, m.start.d)
    })).sort((a,b) => a.startDate.getTime() - b.startDate.getTime());
    
    for (let i = monthStarts.length - 1; i >= 0; i--) {
        if (date >= monthStarts[i].startDate) {
            desiMonth = monthStarts[i].name;
            desiDay = differenceInDays(date, monthStarts[i].startDate) + 1;
            break;
        }
    }
    
    return { day: desiDay, month: desiMonth, year: bikramiYear };
  };

  useEffect(() => {
    const now = new Date();
    const gregorianDate = now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const islamicDate = new Intl.DateTimeFormat('ur-PK-u-ca-islamic', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(now);
    
    const desiDate = getDesiDate(now);
    const punjabiDate = `${desiDate.day} ${desiDate.month} ${desiDate.year}`;

    const time = now.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });

    setCurrentTime(`${gregorianDate} | ${islamicDate.replace(' AH', ' ہجری')} | ${punjabiDate} | ${time}`);
  }, []);

  const headerColorClass = cn(
      "text-2xl font-bold mb-2",
      {
          'text-red-600': ['Sale', 'Cash Advance', 'Withdrawal', 'Expense'].includes(data.type),
          'text-green-600': ['Customer Payment', 'Other Income', 'Investment'].includes(data.type),
          'text-blue-600': ['Purchase', 'Meter Reading'].includes(data.type),
      }
  );

  return (
    <div className="font-sans text-xs text-gray-800 printable-slip max-w-[800px] mx-auto">
      <header className="flex justify-between items-start pb-4 border-b-2 border-gray-300">
        <div className="flex items-start gap-4">
            <InvoiceLogo />
            <div>
                <h1 className="text-xl font-bold text-red-600">{companyDetails.name}</h1>
                <p>{companyDetails.branch}</p>
                <p>Mobile No: {companyDetails.mobile1}</p>
                <p className="font-semibold">Deals in: {companyDetails.dealsIn}</p>
                <p>Sale Tax No. {companyDetails.saleTaxNo}</p>
            </div>
        </div>
        <div className="text-right flex-shrink-0">
            <h2 className={headerColorClass}>
                {data.type === 'Meter Reading' ? 'READING SLIP' : data.type.toUpperCase() + ' VOUCHER'}
            </h2>
            <p className="font-semibold">NTN: {companyDetails.ntn}</p>
            <p className="font-mono text-[10px]">ID: {data.id.slice(0, 8).toUpperCase()}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 py-4">
        <div className="text-blue-600">
            <h3 className="font-bold mb-1">Details:</h3>
            <p className="font-semibold text-sm uppercase">{data.partner.name}</p>
            <p className="font-mono">{data.partner.contact}</p>
             {data.bankDetails && (
                <p className="text-[10px]">Bank: {data.bankDetails.name} ({data.bankDetails.number})</p>
             )}
             {data.notes && <p className="text-[10px] mt-1 italic border-l-2 pl-2">Remarks: {data.notes}</p>}
        </div>
        <div className="text-right">
            <p><span className="font-semibold text-red-600">Date:</span> <span className="text-red-600">{isValidInvoiceDate ? format(new Date(data.date), 'dd-MMM-yyyy') : 'Date not recorded'}</span></p>
            <p className="font-semibold text-blue-600 text-[10px]">{currentTime}</p>
        </div>
      </section>

      <section className="mb-4">
        <table className="w-full border-collapse">
            <thead className="bg-gray-100 border-t-2 border-b-2 border-gray-800">
                <tr>
                    <th className="p-2 text-left w-8">#</th>
                    <th className="p-2 text-left">Particulars</th>
                    <th className="p-2 text-right">Qty/Reading</th>
                    {data.type !== 'Meter Reading' && <th className="p-2 text-right">Price/Rate</th>}
                    {data.type !== 'Meter Reading' && <th className="p-2 text-right">Amount</th>}
                </tr>
            </thead>
            <tbody className="font-mono">
                {data.items.map((item, index) => (
                    <tr key={index} className="border-b border-gray-200">
                        <td className="p-2">{index + 1}</td>
                        <td className={cn("p-2 font-bold",
                            item.name.toLowerCase().includes('diesel') && 'text-green-700',
                            (item.name.toLowerCase().includes('unleaded') || item.name.toLowerCase().includes('premium')) && 'text-red-700'
                        )}>{item.name}</td>
                        <td className="p-2 text-right">{n(item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                        {data.type !== 'Meter Reading' && <td className="p-2 text-right">{n(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>}
                        {data.type !== 'Meter Reading' && <td className="p-2 text-right font-bold">{n(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>}
                    </tr>
                ))}
            </tbody>
            {data.type !== 'Meter Reading' && (
              <tfoot className="font-bold bg-gray-50">
                  <tr className="border-b-2 border-gray-800">
                      <td colSpan={2} className="p-2 text-left uppercase">Total Volume / Units</td>
                      <td className="p-2 text-right">{data.items.reduce((s, i) => s + n(i.quantity), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                      <td className="p-2 text-right">TOTAL</td>
                      <td className="p-2 text-right text-red-600">PKR {n(data.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
              </tfoot>
            )}
            {data.type === 'Meter Reading' && (
               <tfoot className="font-bold bg-gray-50">
                <tr className="border-b-2 border-gray-800">
                    <td colSpan={2} className="p-2 text-left uppercase">Total Dispensed Volume</td>
                    <td className="p-2 text-right text-blue-700 text-lg">{n(data.totalAmount).toLocaleString()} Ltr</td>
                </tr>
            </tfoot>
            )}
        </table>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div>
            {data.type !== 'Meter Reading' && (
              <>
                <p className="font-bold mt-2">Amount in Words:</p>
                <p className="capitalize italic font-medium">{totalAmountInWords} rupees only.</p>
              </>
            )}
            <div className="mt-4 p-2 bg-gray-50 border rounded text-[10px]">
                <p className="font-bold mb-1">Mianwali Petroleum Service Policy:</p>
                <ul className="list-disc pl-4">
                    <li>This is a computer-generated document.</li>
                    <li>Stock verification is valid only at the time of delivery.</li>
                    <li>Verify all items before leaving the site.</li>
                </ul>
            </div>
        </div>
        <div className="text-right">
            <div className="inline-block text-left w-full max-w-[300px]">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {data.type !== 'Meter Reading' && (
                      <>
                        <span className="font-semibold">Sub Total:</span>
                        <span className="font-bold text-red-600">RS {n(data.totalAmount).toLocaleString()}</span>
                        
                        <div className="col-span-2 border-t border-dashed my-1"></div>
                      </>
                    )}
                    
                    {data.partner.openingBalance !== undefined && (
                        <>
                            <span className="font-semibold">Previous Balance:</span>
                            <span className={cn("font-bold font-mono", data.partner.openingBalance > 0 ? "text-red-600" : "text-green-600")}>RS {data.partner.openingBalance.toLocaleString()}</span>
                        </>
                    )}
                    {data.partner.closingBalance !== undefined && (
                        <>
                            <span className="font-semibold text-lg">New Account Bal:</span>
                            <span className={cn("font-bold text-lg font-mono", data.partner.closingBalance > 0 ? "text-red-600" : "text-green-600")}>RS {data.partner.closingBalance.toLocaleString()}</span>
                        </>
                    )}

                    <span className="font-semibold mt-2">Payment Mode:</span>
                    <span className="font-bold text-blue-600 mt-2">{data.paymentMethod === 'Credit' ? 'Udhar (Credit Account)' : data.paymentMethod}</span>
                </div>
            </div>
        </div>
      </section>

      <footer className="grid grid-cols-2 gap-4 pt-6 mt-6 border-t-2 border-gray-300 text-green-700">
        <div>
            <h3 className="font-bold text-[10px]">BANKING DETAILS (PAY TO):</h3>
            <p className="text-[10px]"><span className="font-bold">Title:</span> {companyDetails.bank.title}</p>
            <p className="text-[10px]"><span className="font-bold">IBAN:</span> {companyDetails.bank.iban}</p>
            <p className="text-[10px] font-semibold italic">Account Number works as RAAST ID</p>
        </div>
        <div className="flex flex-col items-center justify-end">
            <div className="w-48 h-px bg-gray-800 mb-1"></div>
            <p className="font-bold text-[10px] uppercase">Authorized Operator Signature</p>
        </div>
      </footer>
      
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .printable-slip {
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
          header { border-bottom: 2px solid #000 !important; }
          footer { border-top: 2px solid #000 !important; }
        }
      `}</style>
    </div>
  );
}
