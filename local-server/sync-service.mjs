import {InputError, fingerprint, makeNumber, makeCursor, validateCommand} from './sync-domain.mjs';
import {preserveOfficialInvoiceFields} from './invoice-amendments.mjs';
import {telegramRelevantChanges} from './telegram-delivery.mjs';
import {validateAtomicInvoicePosting} from './atomic-invoice-posting.mjs';
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
      for(const change of command.changes) {
        const previous=await client.query('SELECT version,value FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id=$3',[workspace,change.entity,change.id]);
        const old=previous.rows[0]; const actual=old?Number(old.version):0;
        if(actual!==change.expectedVersion) throw new InputError('VERSION_CONFLICT',409,{entity:change.entity,id:change.id,expectedVersion:change.expectedVersion,actualVersion:actual});
        let val=change.value;
        if(change.entity==='invoices' && val) {
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
