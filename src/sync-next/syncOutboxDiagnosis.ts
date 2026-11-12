import type {SyncCommand} from './types';

const KNOWN_FAILURES=[
 'VERSION_CONFLICT','RECORD_HAS_UNRESOLVED_CONFLICT',
 'ENTITY_PERMISSION_DENIED','BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION',
 'SESSION_LOGIN_REQUIRED','OUTBOX_WAITING_FOR_ORIGINAL_USER_SESSION',
 'PARTY_HAS_FINANCIAL_REFERENCES','ENTITY_SERIAL_IMMUTABLE',
 'ENTITY_SERIAL_ALREADY_USED','OFFICIAL_INVOICE_REQUIRES_FINANCIAL_REVISION',
 'INVOICE_REVISION_BASELINE_NEEDS_RECONCILIATION','CASH_CUSTOMER_IMMUTABLE',
 'LOCAL_SYNC_HTTP_429','LOCAL_SYNC_HTTP_500','LOCAL_SYNC_HTTP_502',
 'LOCAL_SYNC_HTTP_503','LOCAL_SYNC_HTTP_504',
 'NETWORK','TIMEOUT'
] as const;

export function classifyQueueFailure(error:unknown):string{
 const raw=String(error||'');
 for(const code of KNOWN_FAILURES)if(raw.toUpperCase().includes(code))return code;
 if(!raw.trim())return 'NO_ERROR_RECORDED';
 return 'OTHER_ERROR_REQUIRES_REVIEW';
}

export type SafeQueueDiagnostic={
 kind:'LOBNA_SAFE_OUTBOX_DIAGNOSTIC_V1';
 savedAt:string;
 warning:string;
 totals:{all:number,pending:number,conflict:number,rejected:number};
 byFailure:Array<{code:string,count:number}>;
 byEntity:Array<{entity:string,count:number}>;
 blockers:Array<{entity:string,id:string,failed:number,pending:number}>;
 operations:Array<{
   commandId:string;status:string;createdAt:string;entityCount:number;
   records:Array<{entity:string,id:string,expectedVersion:number}>;
   errorCode:string;
 }>;
};
export function buildSafeQueueDiagnostic(
 commands:readonly SyncCommand[],savedAt=new Date().toISOString()
):SafeQueueDiagnostic{
 const failures=new Map<string,number>();
 const entities=new Map<string,number>();
 const blockers=new Map<string,{entity:string,id:string,failed:number,pending:number}>();
 const operations=commands.map(cmd=>{
   const errorCode=classifyQueueFailure(cmd.error);
   failures.set(errorCode,(failures.get(errorCode)||0)+1);
   const records=cmd.changes.map(change=>{
     entities.set(change.entity,(entities.get(change.entity)||0)+1);
     const key=change.entity+'\u001f'+change.id;
     const row=blockers.get(key)||{entity:change.entity,id:change.id,failed:0,pending:0};
     if(cmd.status==='pending')row.pending++;
     else row.failed++;
     blockers.set(key,row);
     return {entity:change.entity,id:change.id,expectedVersion:change.expectedVersion};
   });
   return {commandId:cmd.id,status:cmd.status,
     createdAt:Number.isFinite(cmd.createdAt)?new Date(cmd.createdAt).toISOString():'unknown',
     entityCount:records.length,records,errorCode};
 });
 const byFailure=[...failures].map(([code,count])=>({code,count}))
   .sort((a,b)=>b.count-a.count||a.code.localeCompare(b.code));
 const byEntity=[...entities].map(([entity,count])=>({entity,count}))
   .sort((a,b)=>b.count-a.count||a.entity.localeCompare(b.entity));
 const blocked=[...blockers.values()].filter(row=>row.failed>0)
   .sort((a,b)=>b.failed-a.failed||a.entity.localeCompare(b.entity)||a.id.localeCompare(b.id));
 return {
   kind:'LOBNA_SAFE_OUTBOX_DIAGNOSTIC_V1',savedAt,
   warning:'Technical metadata only. No invoice lines, amounts, customer names, passwords or bearer tokens. Do not publish internal IDs.',
   totals:{
     all:commands.length,
     pending:commands.filter(x=>x.status==='pending').length,
     conflict:commands.filter(x=>x.status==='conflict').length,
     rejected:commands.filter(x=>x.status==='rejected').length
   },
   byFailure,byEntity,blockers:blocked,
   operations
 };
}
