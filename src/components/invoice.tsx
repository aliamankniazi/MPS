'use client';

import { format, differenceInDays, isValid } from 'date-fns';
import numWords from 'num-words';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';


interface InvoiceItem {
  name: string;
  group: string;
  quantity: number;
  price: number;
  amount: number;
}

interface InvoiceData {
  type: 'Sale' | 'Purchase' | 'Customer Payment' | 'Cash Advance';
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
    <div className="flex items-center justify-center w-16 h-16 bg-blue-600 text-white rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 8h.01"></path>
            <path d="M6 8h.01"></path>
            <path d="M10 4h.01"></path>
            <path d="M18 8h.01"></path>
            <path d="m3 22 1.3-1.3a1.5 1.5 0 0 0 0-2.1L3 17"></path>
            <path d="m19 17-1.3 1.3a1.5 1.5 0 0 0 0 2.1L19 22"></path>
            <path d="M10 18h4"></path>
            <path d="M12 14v4"></path>
            <path d="M10 10h.01"></path>
            <path d="M14 10h.01"></path>
        </svg>
    </div>
);


export function Invoice({ data }: { data: InvoiceData }) {
    
  const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmountInWords = numWords(Math.floor(data.totalAmount));
  const [currentTime, setCurrentTime] = useState('');
  const isValidInvoiceDate = data.date && isValid(new Date(data.date));

  const getDesiDate = (date: Date): { day: number; month: string; year: number } => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const day = date.getDate();
  
    // Based on Bikrami calendar for Punjab
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
        { name: 'پھگਣ', length: 30, start: { m: 1, d: 12 } }
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

  return (
    <div className="font-sans text-xs text-gray-800">
      <header className="flex justify-between items-start pb-4 border-b-2 border-gray-300">
        <div className="flex items-start gap-4">
            <InvoiceLogo />
            <div>
                <h1 className="text-xl font-bold text-gray-900">{companyDetails.name}</h1>
                <p>{companyDetails.branch}</p>
                <p>Mobile No1: {companyDetails.mobile1}</p>
                <p>Mobile No2: {companyDetails.mobile2}</p>
                <p className="font-semibold">Deals in: {companyDetails.dealsIn}</p>
                <p>Sale Tax Registration No. {companyDetails.saleTaxNo}</p>
            </div>
        </div>
        <div className="text-right flex-shrink-0">
            <h2 className="text-2xl font-bold text-blue-600 mb-2">
                {data.type === 'Customer Payment' ? 'PAYMENT RECEIPT'
                : data.type === 'Cash Advance' ? 'CASH ADVANCE VOUCHER'
                : `${data.type.toUpperCase()} INVOICE`}
            </h2>
            <p className="font-semibold">NTN NO: {companyDetails.ntn}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 py-4">
        <div className="text-blue-600">
            <h3 className="font-bold mb-1">Bill To:</h3>
            <p className="font-semibold">{data.partner.name}</p>
            <p>Contact No.: {data.partner.contact}</p>
             {data.bankDetails && (
                <p>Bank: {data.bankDetails.name} ({data.bankDetails.number})</p>
             )}
             {data.notes && <p className="text-sm mt-1">Notes: {data.notes}</p>}
        </div>
        <div className="text-right">
            <p><span className="font-semibold">Invoice No.:</span> {data.id.slice(0, 8)}</p>
            <p className="text-red-600"><span className="font-semibold">Date:</span> {isValidInvoiceDate ? format(new Date(data.date), 'dd-MMM-yyyy') : 'Invalid Date'}</p>
            <p className="font-semibold text-blue-600">{currentTime}</p>
        </div>
      </section>

      <section className="mb-4">
        <table className="w-full">
            <thead className="bg-blue-600 text-white">
                <tr>
                    <th className="p-2 text-left w-8">#</th>
                    <th className="p-2 text-left">Item name</th>
                    <th className="p-2 text-left">Group</th>
                    <th className="p-2 text-right">Quantity</th>
                    <th className="p-2 text-right">Price/Unit</th>
                    <th className="p-2 text-right">Discount</th>
                    <th className="p-2 text-right">Amount</th>
                </tr>
            </thead>
            <tbody>
                {data.items.map((item, index) => (
                    <tr key={index} className="border-b">
                        <td className="p-2">{index + 1}</td>
                        <td className={cn("p-2",
                            item.name.toLowerCase().includes('diesel') && 'text-green-600',
                            (item.name.toLowerCase().includes('unleaded') || item.name.toLowerCase().includes('premium')) && 'text-destructive'
                        )}>{item.name}</td>
                        <td className="p-2">{item.group}</td>
                        <td className="p-2 text-right">{item.group === 'Fuel' ? `${item.quantity.toFixed(3)} LTR` : item.quantity}</td>
                        <td className="p-2 text-right">{item.price.toFixed(2)}</td>
                        <td className="p-2 text-right">0.00%</td>
                        <td className="p-2 text-right text-red-600">{item.amount.toFixed(2)}</td>
                    </tr>
                ))}
            </tbody>
            <tfoot className="font-bold">
                <tr className="border-b-2 border-gray-300">
                    <td colSpan={3} className="p-2 text-left">Total</td>
                    <td className="p-2 text-right">{data.type === 'Sale' || data.type === 'Purchase' ? totalQuantity.toFixed(3) : ''}</td>
                    <td colSpan={2}></td>
                    <td className="p-2 text-right text-red-600">{data.totalAmount.toFixed(2)}</td>
                </tr>
            </tfoot>
        </table>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div>
            <h3 className="font-bold mb-1">Description</h3>
            <p>{data.partner.name} - {data.items[0]?.name || ''}</p>
            <h3 className="font-bold mt-4 mb-1">TERMS AND CONDITIONS</h3>
            <p>Thanks for doing business with us!</p>
            <p className="font-bold mt-4">Amount in Words:</p>
            <p className="capitalize font-bold">{totalAmountInWords} rupees only.</p>
        </div>
        <div className="text-right">
            <div className="inline-block text-left">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="font-semibold">Sub Total:</span>
                    <span className="font-bold text-red-600">RS {data.totalAmount.toFixed(2)}</span>
                    <span className="font-semibold">Discount:</span>
                    <span className="font-bold">RS 0 (0%)</span>
                    <span className="font-semibold">GST@:</span>
                    <span className="font-bold">0</span>
                    <span className="font-bold text-lg border-t-2 border-b-2 border-gray-800 py-1">Total Payable:</span>
                    <span className="font-bold text-lg border-t-2 border-b-2 border-gray-800 py-1 text-red-600">RS {data.totalAmount.toFixed(2)}</span>
                    
                    {data.partner.openingBalance !== undefined && (
                        <>
                            <span className="font-semibold">Previous Balance:</span>
                            <span className={cn("font-bold", data.partner.openingBalance > 0 ? "text-red-600" : "text-green-600")}>RS {data.partner.openingBalance.toFixed(2)}</span>
                        </>
                    )}
                    {data.partner.closingBalance !== undefined && (
                        <>
                            <span className="font-semibold text-lg">New Balance:</span>
                            <span className={cn("font-bold text-lg", data.partner.closingBalance > 0 ? "text-red-600" : "text-green-600")}>RS {data.partner.closingBalance.toFixed(2)}</span>
                        </>
                    )}

                    <span className="font-semibold">Payment Mode:</span>
                    <span className="font-bold">{data.paymentMethod}</span>
                </div>
            </div>
        </div>
      </section>

      <footer className="grid grid-cols-2 gap-4 pt-8 mt-8 border-t-2 border-gray-300">
        <div>
            <h3 className="font-bold">Pay To:</h3>
            <p>Title Of Account: {companyDetails.bank.title}</p>
            <p>Bank Name: {companyDetails.bank.name}</p>
            <p>Account Number: {companyDetails.bank.iban}</p>
            <p className="font-semibold">And Also Use Account Number As A Raast ID</p>
        </div>
        <div className="text-center self-end">
            <div className="w-48 h-12 border-b-2 border-gray-600 mx-auto mb-1"></div>
            <p className="pt-1 text-sm">Authorized Signatory</p>
        </div>
      </footer>
    </div>
  );
}
