import {InputError, fingerprint, makeNumber, makeCursor, validateCommand} from './sync-domain.mjs';
import {preserveOfficialInvoiceFields} from './invoice-amendments.mjs';
import {telegramRelevantChanges} from './telegram-delivery.mjs';
import {validateAtomicInvoicePosting} from './atomic-invoice-posting.mjs';
import {assertStableEntitySerial,allocateAutomaticEntityCode} from './entity-identity.mjs';
import {validateInvoiceCounterparty} from './invoice-counterparty.mjs';
import {normalizeSingleWarehouseInventory} from './single-warehouse-inventory.mjs';
import {preserveWorkspaceSettingsCredentials} from './workspace-settings-public.mjs';
import {APPROVED_CATALOG_MIGRATION_ID,preserveApprovedCatalogSettings} from './approved-settings-guard.mjs';
import {applySettingsFieldPatch,isSettingsFieldPatch} from './settings-field-patch.mjs';
function parseRows(rows) { return rows.map(r=>({key:r.entity+'\u001f'+r.record_id,entity:r.entity,id:r.record_id,version:Number(r.version),value:r.value})); }
export class SyncService {
  constructor(pool) {this.pool=pool;}
  async withTx(fn, isolation='READ COMMITTED') {
    const client=await this.pool.connect();
    try { await client.query('BEGIN ISOLATION LEVEL '+isolation); const result=await fn(client); await client.query('COMMIT'); return result; }
    catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}
    finally {client.release();}
  }
  async head(workspace) {
    const r=await this.pool.query('SELECT next_sequence FROM sync_workspaces WHERE id=$1',[workspace]);
    return Number(r.rows[0]?.next_sequence ?? 0);
  }
  async bootstrap(workspace) {
    return this.withTx(async client=>{
      const w=await client.query('SELECT next_sequence FROM sync_workspaces WHERE id=$1',[workspace]);
      const r=await client.query('SELECT entity,record_id,version,value FROM sync_records WHERE workspace=$1 ORDER BY entity,record_id',[workspace]);
      return {records:parseRows(r.rows),cursor:makeCursor(w.rows[0]?.next_sequence ?? 0)};
    },'REPEATABLE READ READ ONLY');
  }
  async pull(workspace,after=0,limit=100) {
    if (!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>500) throw new InputError('INVALID_CURSOR');
    const r=await this.pool.query('SELECT sequence,command_id,changes FROM sync_events WHERE workspace=$1 AND sequence>$2 ORDER BY sequence ASC LIMIT $3',[workspace,after,limit]);
    return r.rows.map(x=>({commandId:x.command_id,changes:x.changes,cursor:makeCursor(x.sequence)}));
  }
  async push(workspace,command,actorId=null) {
    validateCommand(command,workspace);
    validateAtomicInvoicePosting(command);
    return this.withTx(client=>this.pushInTx(workspace,command,actorId,client));
  }
  // Internal only: must be called inside an open PostgreSQL transaction.
  async pushInTx(workspace,command,actorId,client,authorizedRevisionInvoiceId=null) {
    validateCommand(command,workspace);
    validateAtomicInvoicePosting(command);
    const hash=fingerprint(command);

      // Serializing all commits per workspace guarantees a commit-ordered, gap-free cursor.
      await client.query('INSERT INTO sync_workspaces(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[workspace]);
      const ws=await client.query('SELECT next_sequence,next_invoice FROM sync_workspaces WHERE id=$1 FOR UPDATE',[workspace]);
      const duplicate=await client.query('SELECT fingerprint,receipt,actor_id FROM sync_commands WHERE workspace=$1 AND command_id=$2',[workspace,command.id]);
      if (duplicate.rows.length) {
        if (duplicate.rows[0].fingerprint!==hash) throw new InputError('IDEMPOTENCY_KEY_REUSED',409);
        if (actorId !== null && duplicate.rows[0].actor_id!==actorId)
          throw new InputError('COMMAND_OWNER_MISMATCH',403);
        return duplicate.rows[0].receipt;
      }
      // Legacy browser balance auto-reconciliation used to send ALL 71 party
      // snapshots as independent writes. Never let stale bulk snapshots replace
      // authoritative party balances, even if their versions still match.
      const partyOnlyBulk=command.changes.length>10 &&
        command.changes.every(change=>change.entity==='parties');
      if(partyOnlyBulk) throw new InputError('BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION',409);
      let nextInvoice=Number(ws.rows[0].next_invoice);
      const applied=[];
      const hasInventoryUpdate=command.changes.some(change=>change.entity==='inventory');
      const warehouses=hasInventoryUpdate?(await client.query(
        "SELECT record_id AS id FROM sync_records WHERE workspace=$1 AND entity='warehouses'",
        [workspace])).rows:[];
      const singleWarehouseId=warehouses.length===1?warehouses[0].id:null;
      for(const change of command.changes) {
        const previous=await client.query('SELECT version,value FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id=$3',[workspace,change.entity,change.id]);
        const old=previous.rows[0]; const actual=old?Number(old.version):0;
        const isFieldPatch=change.entity==='settings'&&isSettingsFieldPatch(change.value);
        if(actual!==change.expectedVersion && !isFieldPatch)
          throw new InputError('VERSION_CONFLICT',409,{entity:change.entity,id:change.id,expectedVersion:change.expectedVersion,actualVersion:actual});
        let val=isFieldPatch
          ? applySettingsFieldPatch(old?.value,change.value,actual,change.expectedVersion)
          : change.value;
        if(change.entity==='settings' && val){
          if(!['global','workspace-settings'].includes(change.id))
            throw new InputError('INVALID_WORKSPACE_SETTINGS_ID',422);
          // Do not erase private server-side Telegram credentials when the
          // authenticated client's sanitized bootstrap omits them.
          val=preserveWorkspaceSettingsCredentials(old?.value,val);
          // A previously approved catalog migration locks category identities.
          // Old browser settings snapshots still contain retired categories;
          // retain the SQL-authoritative three definitions while accepting
          // independent settings edits. Never change the SQL catalog guard.
          const approval=await client.query(
            'SELECT EXISTS(SELECT 1 FROM sync_catalog_admin_migrations WHERE workspace=$1 AND migration_id=$2) AS approved',
            [workspace,APPROVED_CATALOG_MIGRATION_ID]
          );
          const protectedSettings=preserveApprovedCatalogSettings(
            old?.value,val,approval.rows[0]?.approved===true
          );
          if(protectedSettings.guarded) {
            console.warn('PROTECTED_APPROVED_SETTINGS_CATEGORIES_RETAINED', {
              commandId:command.id,settingsRecordId:change.id
            });
          }
          val=protectedSettings.value;
        }
        if (change.entity==='parties' && old?.value) {
          const existingParty=old.value;
          const cashId=['pt-cust-1','cust-0001','c-0001','1'].includes(String(change.id).toLowerCase());
          const cashCode=String(existingParty.code||'').toUpperCase()==='CUST-0001';
          if (cashId || cashCode)
            throw new InputError('CASH_CUSTOMER_IMMUTABLE',403,{partyId:change.id});
          if (val?._deleted===true) {
            const linked=await client.query(
              `SELECT entity,record_id FROM sync_records
               WHERE workspace=$1 AND (
                (entity='invoices' AND
                 (value->>'customerId'=$2 OR value->>'subCustomerId'=$2 OR value->>'counterpartyId'=$2))
                OR (entity='parties' AND value->>'parentPartyId'=$2)
                OR (entity=ANY($3::text[]) AND
                 (value->>'partyId'=$2 OR value->>'customerId'=$2 OR
                  value->>'supplierId'=$2 OR value->>'counterpartyId'=$2))
               ) LIMIT 1`,
              [workspace,change.id,[
                'vouchers','purchases','purchaseReturns','salesReturns',
                'printOrders','debtClearings','treasuryTransactions'
              ]]);
            if (linked.rows.length) throw new InputError('PARTY_HAS_FINANCIAL_REFERENCES',409,{
              partyId:change.id,entity:linked.rows[0].entity,recordId:linked.rows[0].record_id});
          }
        }
        if(change.entity==='inventory'&&singleWarehouseId){
          val=normalizeSingleWarehouseInventory({
            previous:old?.value,next:val,warehouseId:singleWarehouseId,
            commandId:command.id,now:new Date().toISOString()
          });
        }
        // The workspace row is locked above. Resolve only explicitly automatic
        // NEW customer/item codes; never change existing identities or manual
        // codes, even if two devices submitted the same proposed number.
        if(actual===0 && (change.entity==='parties'||change.entity==='inventory')){
          val=await allocateAutomaticEntityCode(
            client,workspace,change.entity,change.id,old?.value,val
          );
        }
        if(actual===0 && change.entity==='stockMovements' && val?.itemId &&
           val?.referenceType==='opening'){
          const linked=await client.query(
            "SELECT value->>'code' AS code FROM sync_records WHERE workspace=$1 AND entity='inventory' AND record_id=$2",
            [workspace,String(val.itemId)]
          );
          const authoritativeCode=linked.rows[0]?.code;
          if(authoritativeCode && authoritativeCode!==val.itemCode){
            const oldCode=String(val.itemCode||'');
            val={...val,itemCode:authoritativeCode,
              referenceNumber:val.referenceNumber==='OP-'+oldCode
                ?'OP-'+authoritativeCode:val.referenceNumber};
          }
        }
        // Enforce business-code identity inside the serialized PostgreSQL commit.
        // A display-name edit cannot change account/customer/item identity.
        await assertStableEntitySerial(client,workspace,change.entity,change.id,old?.value,val);
        // Never accept journal/stock correction markers from an ordinary client.
        // Only the authenticated, server-built invoice revision can create them.
        if((change.entity==='journalEntries'||change.entity==='stockMovements') &&
          val?.referenceType==='invoice_correction' &&
          authorizedRevisionInvoiceId!==val.referenceId &&
          authorizedRevisionInvoiceId!==val.sourceInvoiceId)
          throw new InputError('INVOICE_CORRECTION_REQUIRES_SERVER_REVISION',403);
        // Old POS clients can retry the same business action using new IDs.
        // A second revenue or COGS journal must never silently double-post it.
        if(actual===0 && change.entity==='journalEntries' &&
           ['pos_invoice','cogs'].includes(val?.referenceType)){
          if(!val.referenceId)throw new InputError('INVOICE_JOURNAL_REFERENCE_REQUIRED',422);
          const existing=await client.query(
            "SELECT record_id FROM sync_records WHERE workspace=$1 AND entity='journalEntries' AND value->>'referenceId'=$2 AND value->>'referenceType'=$3 LIMIT 1",
            [workspace,val.referenceId,val.referenceType]);
          if(existing.rows.length)
            throw new InputError('DUPLICATE_INVOICE_JOURNAL_REJECTED',409,{
              invoiceId:val.referenceId,referenceType:val.referenceType,
              existingEntryId:existing.rows[0].record_id});
        }
        if(change.entity==='invoices' && val) {
          // Sales targets are namespace-qualified: customer/supplier/employee.
          // Historical invoices with no explicit target type remain intact.
          await validateInvoiceCounterparty(client,workspace,val);
          if(actual===0) {
            nextInvoice++;
            const invoiceNumber=makeNumber(nextInvoice);
            val={...val,invoiceNumber,tempInvoiceNumber:val.invoiceNumber||('TEMP-'+change.id),isOfficial:true};
            await client.query('INSERT INTO invoice_claims(workspace,invoice_number,invoice_id) VALUES($1,$2,$3)',[workspace,invoiceNumber,change.id]);
          } else {
            const official=old?.value?.invoiceNumber;
            if(official && val.invoiceNumber!==official) throw new InputError('OFFICIAL_NUMBER_IMMUTABLE');
            // Enforce immutable posted fields in the commit transaction too:
            // even trusted/internal writers cannot bypass the access-policy check.
            if(authorizedRevisionInvoiceId===change.id && old?.value?.id===change.id &&
              val?.invoiceNumber===old.value.invoiceNumber) {
              val={...val,id:old.value.id,invoiceNumber:old.value.invoiceNumber,
                isOfficial:true,postedAt:old.value.postedAt};
            } else val=preserveOfficialInvoiceFields(old?.value,val);
          }
        }
        if(actual===0) await client.query('INSERT INTO sync_records(workspace,entity,record_id,version,value) VALUES($1,$2,$3,$4,$5)',[workspace,change.entity,change.id,1,val]);
        else await client.query('UPDATE sync_records SET version=$4,value=$5,updated_at=now() WHERE workspace=$1 AND entity=$2 AND record_id=$3',[workspace,change.entity,change.id,actual+1,val]);
        applied.push({entity:change.entity,id:change.id,value:val,version:actual+1});
      }
      const nextSequence=Number(ws.rows[0].next_sequence)+1;
      const receipt={commandId:command.id,changes:applied};
      await client.query('UPDATE sync_workspaces SET next_sequence=$2,next_invoice=$3 WHERE id=$1',[workspace,nextSequence,nextInvoice]);
      await client.query('INSERT INTO sync_commands(workspace,command_id,fingerprint,receipt,actor_id) VALUES($1,$2,$3,$4,$5)',[workspace,command.id,hash,JSON.stringify(receipt),actorId]);
      await client.query('INSERT INTO sync_events(workspace,sequence,command_id,changes) VALUES($1,$2,$3,$4)',[workspace,nextSequence,command.id,JSON.stringify(applied)]);
      // Durable notification is committed atomically with the accounting record.
      // No Telegram send takes place until PostgreSQL has committed.
      if (telegramRelevantChanges(applied).length) {
        await client.query('INSERT INTO sync_telegram_outbox(workspace,command_id,changes) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [workspace,command.id,JSON.stringify(applied)]);
      }
      return receipt;
  }
}
