import type { Invoice } from '../types';

/**
 * Every newly posted sale is kept locally with TEMP-* until the authoritative
 * PostgreSQL transaction ACK supplies its official invoice number.
 * Only a server-assigned INV- serial may enter confirmed accounting reports.
 */
export const isConfirmedSalesInvoice = (
  invoice: Pick<Invoice,'invoiceNumber'> & {isOfficial?:boolean}
): boolean => {
  const number = String(invoice.invoiceNumber || '').trim();
  return /^INV-\d+$/.test(number) && invoice.isOfficial !== false;
};

export const separateInvoiceConfirmation = (
  invoices: readonly Invoice[]
): { confirmed: Invoice[]; awaitingConfirmation: Invoice[] } => {
  const confirmed:Invoice[]=[];
  const awaitingConfirmation:Invoice[]=[];
  for(const invoice of invoices) {
    (isConfirmedSalesInvoice(invoice)?confirmed:awaitingConfirmation).push(invoice);
  }
  return {confirmed,awaitingConfirmation};
};
