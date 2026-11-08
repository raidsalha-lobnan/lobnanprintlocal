/**
 * Private, one-time import of a complete legacy accounting snapshot.
 * Usage:
 *   node import-legacy-snapshot.mjs D:\\Backups\\master_drive_database_snapshot.json
 *   DATABASE_URL=... node import-legacy-snapshot.mjs <file> --apply --confirm-empty-workspace
 *
 * Never place the snapshot, DATABASE_URL or password logs in GitHub.
 * Refuses to overwrite any existing workspace or duplicate official numbers.
 */
import fs from 'node:fs';
import pg from 'pg';
import {hashPassword,normalizeLogin} from './user-auth.mjs';
import {prepareLegacySnapshot,fileChecksum} from './legacy-snapshot.mjs';
const workspace=process.env.SYNC_WORKSPACE||'lobnan_main';
const file=process.argv[2];
const apply=process.argv.includes('--apply');
const confirmed=process.argv.includes('--confirm-empty-workspace');
if(!file||!fs.existsSync(file)){
  console.error('Usage: node import-legacy-snapshot.mjs <private-snapshot.json> [--apply --confirm-empty-workspace]');
  process.exit(2);
}
const bytes=fs.readFileSync(file);
let source;
try{source=JSON.parse(bytes.toString('utf8'))}
catch{throw Error('INVALID_JSON_SNAPSHOT');}
const prepared=prepareLegacySnapshot(source);
console.log('Source checksum (SHA-256): '+fileChecksum(bytes));
console.log('Source exportedAt: '+String(prepared.exportedAt||'unknown'));
console.log('Validated entities: '+JSON.stringify(prepared.counts));
console.log('Total records: '+prepared.records.length);
console.log('Imported user profiles: '+prepared.users.length);
console.log('Reserved invoice numbers: '+prepared.invoiceNumbers.length);
if(!apply){
  console.log('DRY RUN: no database changes. Use --apply --confirm-empty-workspace after verifying a fresh backup.');
  process.exit(0);
}
if(!confirmed)throw Error('EXPLICIT_CONFIRM_EMPTY_WORKSPACE_REQUIRED');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL_MISSING');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
await pool.query(fs.readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
const client=await pool.connect();
try{
  await client.query('BEGIN');
  // Serialize imports to prevent concurrent writes or concurrent importers.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['lobnan-migrate-'+workspace]);
  await client.query('INSERT INTO sync_workspaces(id) VALUES($1) ON CONFLICT (id) DO NOTHING',[workspace]);
  await client.query('SELECT id FROM sync_workspaces WHERE id=$1 FOR UPDATE',[workspace]);
  const existing=await client.query(`SELECT
    (SELECT count(*) FROM sync_records WHERE workspace=$1) AS records,
    (SELECT count(*) FROM sync_commands WHERE workspace=$1) AS commands,
    (SELECT count(*) FROM sync_events WHERE workspace=$1) AS events,
    (SELECT count(*) FROM sync_auth_users WHERE workspace=$1) AS users,
    (SELECT count(*) FROM invoice_claims WHERE workspace=$1) AS invoices,
    (SELECT next_sequence FROM sync_workspaces WHERE id=$1) AS sequence`,[workspace]);
  const state=existing.rows[0];
  if(Object.values(state).some(v=>Number(v)>0))throw Error('WORKSPACE_NOT_EMPTY_REFUSING_TO_OVERWRITE');
  // All records are imported under one database transaction.
  for(const record of prepared.records){
    await client.query(
      'INSERT INTO sync_records(workspace,entity,record_id,version,value) VALUES($1,$2,$3,1,$4)',
      [workspace,record.entity,record.id,JSON.stringify(record.value)]);
  }
  for(const user of prepared.users){
    const hash=await hashPassword(user.password);
    await client.query(`INSERT INTO sync_auth_users
      (workspace,user_id,username_normalized,email_normalized,display_name,role_id,status,password_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [workspace,user.id,normalizeLogin(user.username),normalizeLogin(user.email)||null,
        String(user.fullName||user.username),user.roleId,user.status,hash]);
  }
  for(const invoice of Array.isArray(source.invoices)?source.invoices:[]){
    const number=String(invoice.invoiceNumber||'').trim();
    if(number){
      await client.query(
        'INSERT INTO invoice_claims(workspace,invoice_number,invoice_id) VALUES($1,$2,$3)',
        [workspace,number,invoice.id]);
    }
  }
  await client.query('UPDATE sync_workspaces SET next_invoice=$2 WHERE id=$1',[workspace,prepared.maxInvoice]);
  await client.query('COMMIT');
  console.log('IMPORT_COMMITTED: '+prepared.records.length+' records and '+prepared.users.length+' users. No plaintext passwords stored.');
}catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  console.error('IMPORT_ABORTED_AND_ROLLED_BACK: '+error.message);
  process.exitCode=1;
}finally{
  client.release();
  await pool.end();
}
