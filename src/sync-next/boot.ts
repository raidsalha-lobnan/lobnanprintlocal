import {registerLocalRepositoryWriter} from '../services/localRepositoryWrites';
import {LocalHttpSyncTransport, getLocalSyncConfig} from './httpTransport';
import {LocalSyncDb} from './localDb';
import {SyncCoordinator} from './coordinator';
import {UnifiedRepository} from './repository';
import type {EntityName} from './types';
import {secureLoginEnabled,getCurrentSessionActorId} from '../services/secureAuth';

/** New database is intentionally isolated from historical old cloud IndexedDB queues. */
export async function createUnifiedDataLayer(workspaceId:string){
  const config=getLocalSyncConfig();
  if(config.workspace!==workspaceId) throw new Error('WORKSPACE_MISMATCH');
  const local=new LocalSyncDb(workspaceId,'lobnan-offline-postgres-v1');
  // Best-effort protection against browser quota eviction. This does not
  // override private-mode deletion or explicit clearing of site storage.
  if(typeof navigator!=='undefined' && navigator.storage?.persist){
    void navigator.storage.persist().catch(error=>{
      console.warn('Persistent browser storage request unavailable',error);
    });
  }
  const remote=new LocalHttpSyncTransport(config.url,config.token,workspaceId);
  const coordinator=new SyncCoordinator(local,remote,workspaceId);
  const repository=new UnifiedRepository(local,coordinator);
  // Every supported UI record write is durably queued in IndexedDB, then synced to PostgreSQL.
  const supported=new Set<string>([
    'invoices','parties','inventory','vouchers','purchases','purchaseReturns','salesReturns',
    'accounts','treasuries','treasuryTransactions','employees','employeeAdvances',
    'employeeDeductions','employeeIncentives','payrollSheets','journalEntries','expenses',
    'stockMovements','printOrders','debtClearings','companies','branches','warehouses',
    'warehouseOperations','roles','users','dailyEntrySheets','settings']);
  const unregister=registerLocalRepositoryWriter(async(operation,ref,payload,options)=>{
    const segments=String(ref?.path||'').split('/');
    if(segments.length!==2)return false;
    const entity=segments[0]==='journals'?'journalEntries':segments[0];
    if(!supported.has(entity))return false;
    if(secureLoginEnabled() && (entity==='users'||entity==='roles'))
      throw new Error('USER_AND_ROLE_MANAGEMENT_REQUIRES_SERVER_ADMIN_API');
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
  let stopped=false;
  try {
    const status=await local.bootstrapStatus();
    // Read-only startup evidence: this lets an operator distinguish a lost
    // browser database from ordinary IndexedDB rehydration after an F5 refresh.
    try {
      sessionStorage.setItem('lobnan_accounting_boot_source_v1',JSON.stringify({
        source:status==='empty'?'postgres-initial':status==='initialized'?'indexeddb-cache':'indexeddb-review',
        at:new Date().toISOString()
      }));
    } catch { /* Browsers may disable session storage. */ }
    if(status==='empty') {
      // Never upload historical device localStorage or retired cloud cache automatically.
      const snapshot=await remote.fetchAuthoritativeBootstrap();
      await local.initializeAuthoritativeSnapshot(snapshot.records,snapshot.cursor);
    } else if(status==='existing-data' && !(await local.cursor())) {
      localStorage.setItem('lobnan_postgres_reconciliation_required','true');
      throw new Error('EXISTING_LOCAL_DATA_REQUIRES_RECONCILIATION');
    } else {
      // Device already has an authoritative snapshot and durable event cursor.
      // DO NOT download the whole database again on every launch. The sync
      // coordinator resumes from this cursor and pulls incremental events,
      // preserving local records, financial outbox and pending user changes.
      // Full refresh remains an explicit read-only repair workflow only.
      const cursor=await local.cursor();
      if(!cursor)throw new Error('EXISTING_LOCAL_DATA_REQUIRES_RECONCILIATION');
    }
    // The old global migration gate must remain for an unbootstrapped device.
    // Once a valid PostgreSQL cursor exists, it is safe to resume the durable
    // outbox with its original command IDs (idempotent server receipts).
    // Do not let a past local acknowledgement failure freeze every other item.
    const confirmedCursor=await local.cursor();
    if(confirmedCursor &&
       Number.isSafeInteger(confirmedCursor.sequence) &&
       confirmedCursor.sequence>=0 &&
       localStorage.getItem('lobnan_postgres_reconciliation_required')==='true'){
      localStorage.removeItem('lobnan_postgres_reconciliation_required');
    }
    // The incremental event cursor cannot supply pre-existing directory rows
    // when this browser was previously bootstrapped under a narrower role.
    // Fetch ONLY the authorized user/role directory, not the entire ledger.
    // Offline users keep the existing local directory without mutation.
    const actorId=getCurrentSessionActorId();
    const directoryKey='lobnan_verified_directory_'+workspaceId;
    const syncDirectoryAndStart=async()=>{
      if(secureLoginEnabled()&&actorId){
        try{
          const directory=await remote.fetchAuthorizedDirectory();
          if(stopped||actorId!==getCurrentSessionActorId())return;
          await local.refreshAuthorizedDirectory(directory.records,getCurrentSessionActorId());
          sessionStorage.setItem(directoryKey,actorId);
        }catch(error){
          console.warn('Authorized directory refresh postponed; financial outbox preserved',error);
        }
      }
      if(!stopped&&actorId===getCurrentSessionActorId())await coordinator.start();
    };
    // A reload of a previously verified session can use its durable local data
    // immediately while the directory and incremental sync resume in order.
    if(status==='initialized'&&actorId&&sessionStorage.getItem(directoryKey)===actorId){
      void syncDirectoryAndStart().catch(error=>console.warn('Background sync startup failed',error));
    }else{
      await syncDirectoryAndStart();
    }
  }catch(error){
    unregister();
    // An unsuccessful bootstrap previously leaked its IndexedDB connection,
    // BroadcastChannel and coordinator instance. Repeated startup attempts
    // must use fresh, explicitly cleaned-up resources, never a second writer.
    coordinator.stop();
    void local.close().catch(closeError => {
      console.warn('Unable to close failed repository startup', closeError);
    });
    console.error('Local server initialization failed; no hidden legacy cloud fallback',error);
    throw error;
  }
  return {repository,coordinator,local,stop:()=>{
    stopped=true;
    unregister();
    coordinator.stop();
    void local.close().catch(closeError => {
      console.warn('Unable to close stopped repository', closeError);
    });
  }};
}
