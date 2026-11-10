import type {Invoice, Party} from '../types';

/** In official reports, distinguish child customers by saved IDs/explicit child
 * fields only. Never infer a child by splitting a normal business name on '-'. */
export function salesReportCustomerName(
 invoice: Invoice,parties:readonly Party[],
):string {
  const original=String(invoice.customerName || '').trim() || 'عميل غير محدد';
  const id=invoice.counterpartyId || invoice.customerId;
  const record=id?parties.find(p=>p.id===id):undefined;
  const child=invoice.subCustomerId?parties.find(p=>p.id===invoice.subCustomerId):
    record?.isSubCustomer?record:undefined;
  const parent=child?.parentPartyId?
    parties.find(p=>p.id===child.parentPartyId):undefined;
  const mainName=parent?.name?.trim() || original;
  const childName=child?.name?.trim() || String(invoice.subCustomerName || '').trim();
  if(!childName || childName===mainName)return mainName;
  if(mainName.endsWith(' / '+childName))return mainName;
  return mainName+' / '+childName;
}
