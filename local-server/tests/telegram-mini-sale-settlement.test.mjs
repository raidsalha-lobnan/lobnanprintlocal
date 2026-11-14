import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNewAtomicPosSale} from '../atomic-pos-builder.compiled.mjs';
import {miniSaleReceiptChanges,validateMiniSaleReceiptBundle,
 authoritativeMiniSaleSettlementEffect} from '../telegram-mini-sale-settlement.mjs';
import {validateAtomicInvoicePosting} from '../atomic-invoice-posting.mjs';
const draft='ea84b673-3c05-43e4-8c78-f3d0c2300001';
const invId='inv-pos-'+draft;
const date='2026-11-14';
const cash={entity:'treasuries',record_id:'treasury-cash-main',version:3,
 value:{id:'treasury-cash-main',name:'Main Cash',type:'cash_box',isDefault:true,
  status:'active',accountCode:'CASH-1101',balance:100,currencyBalances:{ILS:100},transactions:[]}};
const bank={entity:'treasuries',record_id:'bank-wallet-1',version:7,
 value:{id:'bank-wallet-1',name:'Wallet',type:'digital_wallet',isDefault:false,
  status:'active',accountCode:'CASH-1106',balance:200,currencyBalances:{ILS:200},transactions:[]}};
const stocks=[{id:'item-1',value:{id:'item-1',name:'Paper',code:'PRI-00001',
 category:'printing',unit:'sheet',stockQuantity:15,purchasePrice:2,sellingPrice:10},version:3}];
const parties=[{id:'customer-2',value:{id:'customer-2',code:'CUST-0002',name:'Client',
 type:'customer',balance:0,openingBalance:0},version:2}];
const ledger=['1101','1102','1201','4101','5101','1301'].map((code,i)=>({
 entity:'accounts',record_id:'act-'+code,version:i+2,
 value:{id:'act-'+code,code,name:'Ledger '+code,
 type:['4101'].includes(code)?'revenue':code==='5101'?'expense':'asset',
 balance:1000}
}));
function sale(cashPaidAmount=5,bankPaidAmount=2){
 const {posting}=buildNewAtomicPosSale({
  invoiceId:invId,commandId:draft,createdAt:date+'T14:00:00Z',
  items:[{item:stocks[0].value,quantity:1,unitPrice:10}],
  customerId:parties[0].id,customerName:'Client',paymentMethod:'bank_transfer',
  options:{date,currency:'ILS',currencySymbol:'₪',exchangeRate:1,
   cashPaidAmount,bankPaidAmount,paidAmount:cashPaidAmount+bankPaidAmount,
   cashTreasuryCode:'CASH-1101',bankTreasuryCode:'CASH-1106',paymentNotes:'split payment'},
  vatRate:0,inventory:stocks,parties
 });
 const settlement=miniSaleReceiptChanges({invoice:posting.invoice.value,postings:posting,
  draftId:draft,treasuryRows:[cash,bank],accountRows:ledger,createdAt:date+'T14:00:00Z'});
 const versions=new Map([...stocks,...parties,...[cash,bank],...ledger]
  .map(r=>[r.record_id||r.id,r.version]));
 const changes=[posting.invoice,...posting.journals,...posting.stockMovements,
  ...posting.partyChanges,...posting.inventoryChanges,...settlement]
  .map(c=>({...c,expectedVersion:versions.get(c.id)||0}));
 return {posting,settlement,command:{id:draft,workspaceId:'lobnan_main',
  atomicInvoiceId:invId,miniSaleSettlement:true,changes}};
}
test('mini sale cash and wallet receipts post once with the same atomic journal and stock changes',()=>{
 const {posting,settlement,command}=sale();
 assert.equal(validateAtomicInvoicePosting(command),true);
 assert.equal(settlement.filter(c=>c.entity==='treasuries').length,2);
 assert.equal(settlement.filter(c=>c.entity==='vouchers').length,2);
 assert.equal(settlement.filter(c=>c.entity==='journalEntries').length,0);
 assert.equal(settlement.filter(c=>c.entity==='accounts').length,6);
 const afterCash=settlement.find(c=>c.entity==='treasuries'&&c.id===cash.record_id).value;
 const afterBank=settlement.find(c=>c.entity==='treasuries'&&c.id===bank.record_id).value;
 assert.equal(afterCash.balance,105);
 assert.equal(afterBank.balance,202);
 assert.equal(afterCash.transactions[0].type,'deposit');
 assert.equal(afterBank.transactions[0].type,'deposit');
 assert.equal(afterCash.transactions[0].referenceId,invId);
 assert.equal(afterBank.transactions[0].referenceId,invId);
 assert.ok(settlement.filter(c=>c.entity==='vouchers').every(c=>c.value.type==='receipt'&&c.value.relatedDocId===invId));
 for(const updated of settlement.filter(c=>['treasuries','accounts'].includes(c.entity))){
  const before=[cash,bank,...ledger].find(r=>r.record_id===updated.id);
  assert.equal(authoritativeMiniSaleSettlementEffect(command,updated,before.value),true);
 }
 const journal=posting.journals.find(j=>j.value.referenceType==='pos_invoice').value;
 const cashDebit=journal.lines.find(l=>l.accountCode==='1101');
 const bankDebit=journal.lines.find(l=>l.accountCode==='1102');
 assert.equal(cashDebit.debit,5);
 assert.equal(bankDebit.debit,2);
 assert.equal(journal.lines.find(l=>l.accountCode==='1201').debit,3);
 assert.equal(posting.invoice.value.remainingAmount,3);
});
test('credit-only sale updates ledger and customer but NEVER creates a fake receipt or treasury deposit',()=>{
 const {posting,settlement,command}=sale(0,0);
 assert.equal(validateAtomicInvoicePosting(command),true);
 assert.equal(settlement.filter(c=>['vouchers','treasuries'].includes(c.entity)).length,0);
 assert.equal(settlement.filter(c=>c.entity==='accounts').length,4);
 assert.equal(posting.partyChanges[0].value.balance,10);
});
test('rejected forged receipts, wrong payment amount, account edits, or extra vouchers',()=>{
 const {command,settlement}=sale();
 const wrong=structuredClone(command);
 wrong.changes.find(c=>c.entity==='vouchers').value.amount+=4;
 assert.throws(()=>validateAtomicInvoicePosting(wrong),/MINI_RECEIPT_VOUCHER_LINK_INVALID/);
 const extra=structuredClone(command);
 extra.changes.push({...settlement.find(c=>c.entity==='vouchers'),id:'extra-voucher'});
 assert.throws(()=>validateAtomicInvoicePosting(extra),/MINI_RECEIPT_EVIDENCE_COUNT_INVALID/);
 const ledgerChange=command.changes.find(c=>c.entity==='accounts');
 assert.throws(()=>authoritativeMiniSaleSettlementEffect(command,{
  ...ledgerChange,value:{...ledgerChange.value,balance:ledgerChange.value.balance+100}
 },ledger.find(r=>r.record_id===ledgerChange.id).value),/MINI_RECEIPT_LEDGER_BALANCE_MISMATCH/);
});
