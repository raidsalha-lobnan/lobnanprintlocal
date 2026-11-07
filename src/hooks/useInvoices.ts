import { useAccounting } from '../context/AccountingContext';
import type { Invoice } from '../types';

export function useInvoices() {
  const { invoices } = useAccounting();
  const loading = false;

  return { 
    invoices, 
    loading, 
    count: invoices.length,
    totalSales: invoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0),
    totalPaid: invoices.reduce((sum, inv) => sum + (Number(inv.paidAmount) || 0), 0),
    totalRemaining: invoices.reduce((sum, inv) => sum + (Number(inv.remainingAmount) || 0), 0)
  };
}
