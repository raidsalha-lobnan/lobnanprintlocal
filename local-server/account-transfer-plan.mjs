import {InputError,validateJournal,validId} from './sync-domain.mjs';

// The same account mapping used by atomic POS posting. A clearing transfers
// a subledger balance; it never creates cash, revenue, expense, or stock.
export const TRANSFER_ACCOUNTS=Object.freeze({
 customer:{code:'1201',name:'العملاء والذمم المدينة'},
 supplier:{code:'2101',name:'الموردون والذمم الدائنة'},
 employee:{code:'1104',name:'سلف ومستحقات الموظفين'}
});
const fail=code=>{throw new InputError(code,422);};
const minor=n=>{
 if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>=1e12)
  fail('ACCOUNT_TRANSFER_AMOUNT_INVALID');
 const x=Math.round(n*100);
 if(!Number.isSafeInteger(x)||Math.abs(x-n*100)>0.00001)
  fail('ACCOUNT_TRANSFER_MONEY_PRECISION');
 return x;
};
const money=n=>n/100;
function endpoint(p){
 if(!p||!Object.hasOwn(TRANSFER_ACCOUNTS,p.type)||!validId(p.id)||
    typeof p.name!=='string'||!p.name.trim())
  fail('ACCOUNT_TRANSFER_PARTY_INVALID');
 const entity=p.type==='employee'?'employees':'parties';
 return {...p,entity,account:TRANSFER_ACCOUNTS[p.type]};
}
/** A debit balance transferred from A to B credits A and debits B.
 * A credit balance transferred from A to B debits A and credits B.
 * The normal party balance is debit-positive; employee statements are
 * entitlement-positive (credit-positive) and must use the opposite sign.
 * The account-card sign is independent of the subledger sign.
 */
export function buildAccountTransferPlan({source,target,amount,balanceSide='debit'}){
 const a=endpoint(source),b=endpoint(target),n=minor(amount);
 if(n<=0)fail('ACCOUNT_TRANSFER_AMOUNT_INVALID');
 if(!['debit','credit'].includes(balanceSide))fail('ACCOUNT_TRANSFER_SIDE_INVALID');
 // A party marked both uses ONE underlying balance, not two distinct cards.
 if(a.entity===b.entity&&a.id===b.id)fail('ACCOUNT_TRANSFER_SAME_ACCOUNT');
 if([a,b].some(x=>x.entity==='parties'&&(
  ['pt-cust-1','cust-0001','c-0001','1'].includes(x.id.toLowerCase())||
  String(x.code||'').toUpperCase()==='CUST-0001')))
  fail('CASH_CUSTOMER_IMMUTABLE');
 const debit=balanceSide==='debit'?b:a;
 const credit=balanceSide==='debit'?a:b;
 const lines=[
  {accountCode:debit.account.code,accountName:debit.account.name,
   debit:money(n),credit:0,counterpartyType:debit.type,counterpartyId:debit.id,
   description:'مقاصة وتحويل حساب - '+debit.name},
  {accountCode:credit.account.code,accountName:credit.account.name,
   debit:0,credit:money(n),counterpartyType:credit.type,counterpartyId:credit.id,
   description:'مقاصة وتحويل حساب - '+credit.name}
 ];
 validateJournal({lines});
 const side=(p,signed)=>({entity:p.entity,id:p.id,type:p.type,
   signedLedgerDelta:money(signed),
   statementDelta:money(p.type==='employee'?-signed:signed)});
 const effects=[side(debit,n),side(credit,-n)];
 const accountDeltas={};
 for(const l of lines){
  const delta=minor(l.debit)-minor(l.credit);
  // Liability account cards are credit-normal.
  accountDeltas[l.accountCode]=(accountDeltas[l.accountCode]||0)+
    (l.accountCode==='2101'?-delta:delta);
 }
 return {lines,effects,accountDeltas:Object.fromEntries(
  Object.entries(accountDeltas).map(([k,v])=>[k,money(v)]))};
}
