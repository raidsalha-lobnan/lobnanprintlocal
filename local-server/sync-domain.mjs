import crypto from 'node:crypto';
export const ENTITIES = new Set([
'invoices','parties','inventory','vouchers','purchases','purchaseReturns','salesReturns',
'accounts','treasuries','treasuryTransactions','employees','employeeAdvances',
'employeeDeductions','employeeIncentives','payrollSheets','journalEntries','expenses',
'stockMovements','printOrders','debtClearings','companies','branches','warehouses',
'warehouseOperations','roles','users','dailyEntrySheets','settings']);
export class InputError extends Error { constructor(message, status=422, detail=null) { super(message);this.status=status;this.detail=detail; } }
export const validId = v => typeof v==='string' && v.length>0 && v.length<=180 && !/[/\u001f]/.test(v);
export function validateCommand(cmd, workspace) {
  if (!cmd || !validId(cmd.id) || cmd.workspaceId !== workspace ||
      !Array.isArray(cmd.changes) || cmd.changes.length<1 || cmd.changes.length>80)
    throw new InputError('INVALID_COMMAND');
  const seen = new Set();
  for (const c of cmd.changes) {
    if (!c || !ENTITIES.has(c.entity) || !validId(c.id) || !Number.isSafeInteger(c.expectedVersion) || c.expectedVersion<0)
      throw new InputError('INVALID_CHANGE');
    if (c.value !== null && (typeof c.value!=='object' || Array.isArray(c.value) || !c.value))
      throw new InputError('INVALID_RECORD');
    if (c.value && c.value.id!=null && c.value.id!==c.id) throw new InputError('RECORD_ID_MISMATCH');
    const key=c.entity+'\u001f'+c.id;
    if (seen.has(key)) throw new InputError('DUPLICATE_RECORD_IN_COMMAND');
    seen.add(key);
    if(c.value===null && ['invoices','vouchers','journalEntries','stockMovements','purchases','purchaseReturns','salesReturns','expenses'].includes(c.entity)) throw new InputError('FINANCIAL_RECORD_REQUIRES_REVERSAL');
    if (c.entity==='journalEntries' && c.value) validateJournal(c.value);
    if (c.entity==='invoices' && c.value && c.expectedVersion===0) {
      const n=c.value.invoiceNumber;
      if (n && !String(n).startsWith('TEMP-')) throw new InputError('NEW_INVOICE_REQUIRES_TEMP_NUMBER');
    }
  }
  return cmd;
}
export function validateJournal(value) {
  if (!Array.isArray(value.lines) || value.lines.length < 2) throw new InputError('JOURNAL_REQUIRES_LINES');
  let d=0, c=0;
  const minor=(amount)=>{
    if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0) throw new InputError('INVALID_JOURNAL_AMOUNT');
    const n=Math.round(amount*100);
    if(!Number.isSafeInteger(n)||Math.abs(n-amount*100)>0.000001)throw new InputError('INVALID_MONEY_PRECISION');
    return n;
  };
  for(const x of value.lines) {
    const key=x.accountId||x.accountCode;
    if(!validId(key))throw new InputError('INVALID_JOURNAL_ACCOUNT');
    const md=x.debitMinor!==undefined?x.debitMinor:minor(x.debit);
    const mc=x.creditMinor!==undefined?x.creditMinor:minor(x.credit);
    if(!Number.isSafeInteger(md)||!Number.isSafeInteger(mc)||md<0||mc<0||(md>0&&mc>0)||(md===0&&mc===0)) throw new InputError('INVALID_JOURNAL_LINE');
    d+=md; c+=mc;
  }
  if(!Number.isSafeInteger(d)||!Number.isSafeInteger(c)||d===0||d!==c)throw new InputError('UNBALANCED_JOURNAL');
}
export function fingerprint(command) {
  return crypto.createHash('sha256').update(JSON.stringify({workspaceId:command.workspaceId,changes:command.changes})).digest('hex');
}
export const makeNumber = seq => 'INV-'+String(seq).padStart(4,'0');
export const makeCursor = seq => ({sequence:Number(seq),seconds:0,nanoseconds:0,eventId:String(seq)});
