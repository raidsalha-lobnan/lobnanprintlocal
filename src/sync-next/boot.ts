import {registerDurableWriter} from '../firebase';
import {LocalHttpSyncTransport, getLocalSyncConfig} from './httpTransport';
import {LocalSyncDb} from './localDb';
import {SyncCoordinator} from './coordinator';
import {UnifiedRepository} from './repository';
import type {EntityName} from './types';

/** New database is intentionally isolated from historical Firebase IndexedDB queues. */
export async function createUnifiedDataLayer(workspaceId:string){
  const config=getLocalSyncConfig();
  if(config.workspace!==workspaceId) throw new Error('WORKSPACE_MISMATCH');
  const local=new LocalSyncDb(workspaceId,'lobnan-offline-postgres-v1');
  const remote=new LocalHttpSyncTransport(config.url,config.token,workspaceId);
  const coordinator=new SyncCoordinator(local,remote,workspaceId);
  const repository=new UnifiedRepository(local,coordinator);
  // Legacy top-level SDK writes from existing UI are redirected to the same durable local queue.
  const supported=new Set<string>([
    'invoices','parties','inventory','vouchers','purchases','purchaseReturns','salesReturns',
    'accounts','treasuries','treasuryTransactions','employees','employeeAdvances',
    'employeeDeductions','employeeIncentives','payrollSheets','journalEntries','expenses',
    'stockMovements','printOrders','debtClearings','companies','branches','warehouses',
    'warehouseOperations','roles','users','dailyEntrySheets','settings']);
  const unregister=registerDurableWriter(async(operation,ref,payload,options)=>{
    const segments=String(ref?.path||'').split('/');
    if(segments.length!==2)return false;
    const entity=segments[0]==='journals'?'journalEntries':segments[0];
    if(!supported.has(entity))return false;
    const id=segments[1];
    if(!id)throw new Error('Missing stable record identity');
    if(operation==='delete') await repository.tombstone(entity as EntityName,id);
    else {
      if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Invalid payload');
      const previous=options?.merge?(await repository.all(entity as EntityName)).find(r=>r.id===id)?.value:null;
      await repository.put(entity as EntityName,id,{...(previous||{}),...payload,id});
    }
    return true;
  });
  try {
    const status=await local.bootstrapStatus();
    if(status==='empty') {
      // Never upload historical device localStorage or Firebase cache automatically.
      const snapshot=await remote.fetchAuthoritativeBootstrap();
      await local.initializeAuthoritativeSnapshot(snapshot.records,snapshot.cursor);
    } else if(status==='existing-data' && !(await local.cursor())) {
      localStorage.setItem('lobnan_postgres_reconciliation_required','true');
      throw new Error('EXISTING_LOCAL_DATA_REQUIRES_RECONCILIATION');
    }
    await coordinator.start();
  }catch(error){
    unregister();
    console.error('Local server initialization failed; no hidden Firebase fallback',error);
    throw error;
  }
  return {repository,coordinator,local,stop:()=>{unregister();coordinator.stop();}};
}
