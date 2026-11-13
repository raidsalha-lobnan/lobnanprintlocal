import type {SyncCommand,CommitReceipt} from './types';
import {isNewAtomicPosSale} from './atomicRecoveryPolicy';

/** Only a centrally committed receipt for the SAME original immutable command
 * can clear a financial outbox conflict. Verify identity, structure and amount.
 * The POSTGRES server must separately prove actor and SHA-256 fingerprint.
 */
export function matchesCommittedAtomicPosReceipt(command:SyncCommand,receipt:CommitReceipt):boolean{
  if(!isNewAtomicPosSale(command)||receipt?.commandId!==command.id||
     !Array.isArray(receipt.changes)||receipt.changes.length!==command.changes.length)
    return false;
  const expected=new Map(command.changes.map(c=>[c.entity+'\u001f'+c.id,c]));
  const present=new Set<string>();
  for(const change of receipt.changes){
    const key=change.entity+'\u001f'+change.id;
    if(!expected.has(key)||present.has(key)||
       !Number.isSafeInteger(change.version)||change.version<1||
       change.value===null)return false;
    present.add(key);
  }
  const posted=receipt.changes.find(c=>c.entity==='invoices'&&c.id===command.atomicInvoiceId);
  const originally=command.changes.find(c=>c.entity==='invoices'&&c.id===command.atomicInvoiceId);
  if(!posted?.value||!originally?.value||posted.value.isAccountingPosted!==true||
     !/^INV-\d+$/.test(String(posted.value.invoiceNumber||''))||
     Number(posted.value.totalAmount)!==Number(originally.value.totalAmount))
    return false;
  return present.size===expected.size;
}
