import type {Account,JournalEntry} from '../types';

// All book calculations use integer minor units. This is a read-only projection:
// no client account.balance snapshot is silently used as a journal opening entry.
export const bookCents=(amount:unknown):number=>{
 const value=Number(amount);
 return typeof amount!=='undefined'&&amount!==null&&amount!==''&&Number.isFinite(value)
  &&Number.isSafeInteger(Math.round(value*100))?Math.round(value*100):0;
};
export const bookAmount=(cents:number)=>Number((cents/100).toFixed(2));
export const bookMoney=(cents:number)=>bookAmount(cents).toLocaleString('en-US',{
 minimumFractionDigits:2,maximumFractionDigits:2
});
export const accountNormalSide=(type:Account['type'])=>
 type==='asset'||type==='expense'?'debit':'credit';

export type JournalRow={
 entry:JournalEntry;debit:number;credit:number;difference:number;
 balanced:boolean;valid:boolean;issues:string[];
};
export type LedgerRow={
 id:string;date:string;entryNumber:string;description:string;source:string;
 referenceId:string;debit:number;credit:number;running:number;
};
export type TrialRow={
 code:string;name:string;debit:number;credit:number;debitBalance:number;creditBalance:number;
 movement:number;stored:number;storedDifference:number;
};
const dateOrder=(a:JournalEntry,b:JournalEntry)=>
 String(a.date||'').localeCompare(String(b.date||''))||
 String(a.createdAt||'').localeCompare(String(b.createdAt||''))||
 String(a.entryNumber||'').localeCompare(String(b.entryNumber||''))||
 String(a.id||'').localeCompare(String(b.id||''));

export const makeJournalBook=(entries:JournalEntry[],accounts:Account[])=>{
 const known=new Set(accounts.map(a=>a.code));
 const rows=entries.map(entry=>{
  const issues:string[]=[];
  let debit=0,credit=0;
  if(!Array.isArray(entry.lines)||entry.lines.length<2)issues.push('قيد غير مكتمل');
  for(const line of entry.lines||[]){
   const d=bookCents(line.debit),c=bookCents(line.credit);
   if(!known.has(line.accountCode))issues.push('حساب غير معرّف: '+line.accountCode);
   if(!Number.isFinite(Number(line.debit))||!Number.isFinite(Number(line.credit))||
      Number(line.debit)<0||Number(line.credit)<0)
    issues.push('مبلغ غير صالح');
   if(d>0&&c>0)issues.push('طرف مدين ودائن في السطر نفسه');
   if(d===0&&c===0)issues.push('سطر بلا مبلغ');
   debit+=d;credit+=c;
  }
  const balanced=debit===credit&&debit>0;
  if(!balanced)issues.push('عدم توازن القيد');
  return {entry,debit,credit,difference:debit-credit,balanced,
   valid:issues.length===0,issues:[...new Set(issues)]} satisfies JournalRow;
 });
 return rows;
};

export const makeLedgerBook=(entries:JournalEntry[],accountCode:string,from='',to='')=>{
 const sorted=[...entries].sort(dateOrder);
 let opening=0,closing=0,totalDebit=0,totalCredit=0;
 const lines:LedgerRow[]=[];
 for(const entry of sorted){
  if(to&&entry.date>to)continue;
  for(let index=0;index<(entry.lines||[]).length;index++){
   const line=entry.lines[index];
   if(line.accountCode!==accountCode)continue;
   const debit=bookCents(line.debit),credit=bookCents(line.credit);
   const delta=debit-credit;
   if(from&&entry.date<from){opening+=delta;continue;}
   closing+=delta;totalDebit+=debit;totalCredit+=credit;
   lines.push({
    id:entry.id+':'+index,date:entry.date,entryNumber:entry.entryNumber,
    description:line.description||entry.description,source:entry.referenceType,
    referenceId:entry.referenceId||'',debit,credit,running:opening+closing
   });
  }
 }
 return {opening,rows:lines,totalDebit,totalCredit,closing:opening+closing};
};

export const makeTrialBalance=(entries:JournalEntry[],accounts:Account[],to='')=>{
 const balances=new Map<string,{debit:number;credit:number}>();
 for(const entry of entries){
  if(to&&entry.date>to)continue;
  for(const line of entry.lines||[]){
   const item=balances.get(line.accountCode)||{debit:0,credit:0};
   item.debit+=bookCents(line.debit);item.credit+=bookCents(line.credit);
   balances.set(line.accountCode,item);
  }
 }
 const codes=new Map(accounts.map(a=>[a.code,a]));
 const rows:TrialRow[]=[];
 for(const code of [...new Set([...codes.keys(),...balances.keys()])].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}))){
  const acc=codes.get(code);
  const t=balances.get(code)||{debit:0,credit:0};
  const movement=t.debit-t.credit;
  const normal=acc?accountNormalSide(acc.type):'debit';
  const expected=normal==='debit'?movement:-movement;
  const stored=acc?bookCents(acc.balance):0;
  rows.push({code,name:acc?.name||'حساب غير موجود في الدليل',
   debit:t.debit,credit:t.credit,movement,stored,
   storedDifference:acc?stored-expected:0,
   debitBalance:Math.max(0,movement),
   creditBalance:Math.max(0,-movement)});
 }
 const debit=rows.reduce((n,r)=>n+r.debitBalance,0);
 const credit=rows.reduce((n,r)=>n+r.creditBalance,0);
 return {rows,debit,credit,balanced:debit===credit,
  mismatchedSnapshots:rows.filter(r=>codes.has(r.code)&&r.storedDifference!==0).length,
  unknownAccounts:rows.filter(r=>!codes.has(r.code)).length};
};
