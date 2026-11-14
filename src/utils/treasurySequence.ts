import type {Treasury} from '../types';

// Stable order by the actual serialized CASH-#### identifier, never grid
// position, creation time, or a lexical comparison that sorts 11010 before 1102.
export function compareTreasurySequence(a:Pick<Treasury,'accountCode'|'name'|'id'>,b:Pick<Treasury,'accountCode'|'name'|'id'>){
 const number=(s?:string)=>{
  const match=/^CASH-([0-9]+)$/.exec(String(s||'').trim());
  return match?BigInt(match[1]):null;
 };
 const aa=number(a.accountCode),bb=number(b.accountCode);
 if(aa!==null&&bb!==null){
  if(aa<bb)return -1;
  if(aa>bb)return 1;
 }else if(aa!==null)return -1;
 else if(bb!==null)return 1;
 return String(a.accountCode||'').localeCompare(String(b.accountCode||''),'en',{numeric:true})||
  String(a.name||'').localeCompare(String(b.name||''),'ar')||
  String(a.id||'').localeCompare(String(b.id||''));
}
