import type {Invoice} from '../types';

/**
 * Fingerprint the financial and descriptive contents actually loaded into the
 * POS editor. A device must not silently overwrite an invoice that another
 * device changed after the editor opened. Server version checks still guard
 * the commit-time race.
 */
export const invoiceEditSignature=(invoice:Invoice):string=>JSON.stringify([
 invoice.id,invoice.invoiceNumber,invoice.date,invoice.warehouse,invoice.branch,
 invoice.customerId,invoice.counterpartyType,invoice.counterpartyId,
 invoice.employeeId,invoice.subCustomerId,invoice.customerName,
 invoice.items?.map(item=>[
  item.id,item.itemId,item.itemCode,item.itemName,item.category,
  item.quantity,item.unitPrice,item.total,item.discount,item.tax,item.taxRate,
  item.length,item.width,item.count,item.hasDimensions,item.unit,
  item.description,item.notes,
  item.attachments?.map(attachment=>attachment.id),item.imageThumbnail
 ])||[],
 invoice.subtotal,invoice.discountTotal,invoice.taxRate,invoice.taxAmount,
 invoice.additionalCharges,invoice.totalAmount,invoice.paidAmount,
 invoice.remainingAmount,invoice.paymentMethod,invoice.currency,
 invoice.exchangeRate,invoice.baseTotalAmount,invoice.basePaidAmount,
 invoice.cashPaidAmount,invoice.bankPaidAmount,invoice.cashTreasuryCode,
 invoice.bankTreasuryCode,invoice.cashBaseAmount,invoice.bankBaseAmount,
 invoice.treasuryAccountCode,invoice.notes,invoice.paymentNotes,
 invoice.representative,invoice.workflowStatus
]);
