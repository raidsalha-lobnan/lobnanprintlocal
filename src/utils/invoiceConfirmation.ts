import type { Invoice } from '../types';

/**
 * New POS sales always keep TEMP-* until PostgreSQL assigns an official INV- serial.
 * Old PostgreSQL invoices may have isOfficial=false despite being correctly
 * numbered and posted (e.g. audited INV-0026/0028/0031/0035/0055).
 * A stale legacy flag must not hide an otherwise official numbered document.
 * This is a display/report guard only; it never assigns a number or posts money.
 */
export const isConfirmedSalesInvoice = (
  invoice: Pick<Invoice,'invoiceNumber'> & {isOfficial?:boolean;isAccountingPosted?:boolean}
): boolean => {
  const number = String(invoice.invoiceNumber || '').trim();
  // Official serials are server-issued. Legacy posted records can carry the
  // obsolete false flag; unposted records with a false flag remain excluded.
  return /^INV-\d+$/.test(number) &&
    (invoice.isOfficial !== false || invoice.isAccountingPosted === true);
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
