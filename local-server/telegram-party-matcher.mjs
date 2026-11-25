/**
 * Approximate Telegram party lookup.
 * Read-only: only caller-authorized party names/codes are ranked.
 * Never alter stored names, account IDs, accounting records or balances.
 */
export function normalizePartySearch(value){
 return String(value??'').normalize('NFKC').toLowerCase()
  .replace(/[\u064b-\u065f\u0670\u0640]/g,'')
  .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي')
  .replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
  .replace(/[^\p{L}\p{N}\s-]/gu,' ')
  .replace(/\s+/g,' ').trim();
}
function editDistanceBounded(a,b,maxDistance){
 if(Math.abs(a.length-b.length)>maxDistance)return maxDistance+1;
 if(a===b)return 0;
 let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const curr=[i];
  let minimum=curr[0];
  for(let j=1;j<=b.length;j++){
   curr[j]=Math.min(prev[j]+1,curr[j-1]+1,
    prev[j-1]+(a[i-1]===b[j-1]?0:1));
   if(curr[j]<minimum)minimum=curr[j];
  }
  if(minimum>maxDistance)return maxDistance+1;
  prev=curr;
 }
 return prev[b.length];
}
function approximateScore(query,value){
 const key=normalizePartySearch(value?.name);
 const code=normalizePartySearch(value?.code);
 const phone=normalizePartySearch(value?.phone);
 if(!key)return Number.POSITIVE_INFINITY;
 const compact=query.replace(/\s+/g,'');
 if(code && (code===query||code.startsWith(query)))return 0;
 if(phone && phone.includes(query))return 1;
 if(key===query)return 2;
 if(key.startsWith(query))return 3;
 if(key.includes(query))return 4;
 if(key.replace(/\s+/g,'').includes(compact))return 5;
 const nameWords=key.split(' ').filter(Boolean);
 const queryWords=query.split(' ').filter(Boolean);
 if(!queryWords.length||queryWords.length>6)return Number.POSITIVE_INFINITY;
 let penalties=0;
 for(const term of queryWords){
  let best=Number.POSITIVE_INFINITY;
  for(const word of nameWords){
   if(word===term){best=0;break;}
   if(word.startsWith(term)){best=Math.min(best,0.1);continue;}
   if(word.includes(term)){best=Math.min(best,0.3);continue;}
   if(term.length<3)continue;
   const allowance=term.length>=6?2:1;
   const distance=editDistanceBounded(term,word,allowance);
   if(distance<=allowance)best=Math.min(best,1+distance);
  }
  if(!Number.isFinite(best))return Number.POSITIVE_INFINITY;
  penalties+=best;
 }
 // A minor spelling difference may be suggested; unrelated names are excluded.
 return 8+penalties+Math.abs(nameWords.length-queryWords.length)*0.05;
}
/**
 * Use after exact/partial SQL search found no permitted matches.
 * Cap candidates and return only previously authorized identities.
 */
export function rankApproximateParties(rows,rawQuery,{
 entity='parties',partyType='customer',canRead=()=>false,limit=7
}={}){
 const query=normalizePartySearch(rawQuery);
 if(query.length<2)return [];
 return (Array.isArray(rows)?rows:[])
  .filter(row=>row?.record_id&&row.value&&canRead(entity,row.value,row.record_id))
  .filter(row=>entity==='employees'||(partyType==='supplier'
   ?['supplier','both'].includes(row.value.type)
   :['customer','both'].includes(row.value.type)))
  .map(row=>({...row,rank:approximateScore(query,row.value)}))
  .filter(row=>Number.isFinite(row.rank))
  .sort((a,b)=>a.rank-b.rank ||
   String(a.value?.name||'').localeCompare(String(b.value?.name||''),'ar') ||
   String(a.record_id).localeCompare(String(b.record_id)))
  .slice(0,Math.min(7,Math.max(1,limit)));
}
