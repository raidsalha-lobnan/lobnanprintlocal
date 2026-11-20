import {InputError} from './sync-domain.mjs';

const HOLD_ID=/^held-[A-Za-z0-9_-]{8,128}$/;
const MAX_HELD_BYTES=7_500_000;
const MAX_HELD_PER_USER=50;
function kindOK(kind){if(kind!=='desktop'&&kind!=='mobile')throw new InputError('HELD_INVOICE_KIND_INVALID',400);}
function idOK(id){if(typeof id!=='string'||!HOLD_ID.test(id))throw new InputError('HELD_INVOICE_ID_INVALID',400);}
function ownerOK(id){if(typeof id!=='string'||!id)throw new InputError('HELD_INVOICE_LOGIN_REQUIRED',401);}
export function validateHeldInvoice(kind,held){
  kindOK(kind);
  if(!held||typeof held!=='object'||Array.isArray(held))throw new InputError('HELD_INVOICE_DATA_INVALID',400);
  idOK(held.id);
  const rows=kind==='desktop'?held.lines:held.cart;
  if(!Array.isArray(rows)||rows.length<1||rows.length>250)throw new InputError('HELD_INVOICE_ITEMS_INVALID',400);
  if(typeof held.customerName!=='string'||held.customerName.length>500)throw new InputError('HELD_INVOICE_CUSTOMER_INVALID',400);
  if(!Number.isFinite(Number(held.totalAmount))||Number(held.totalAmount)<0)
    throw new InputError('HELD_INVOICE_TOTAL_INVALID',400);
  const json=JSON.stringify(held);
  if(!json||Buffer.byteLength(json,'utf8')>MAX_HELD_BYTES)throw new InputError('HELD_INVOICE_DATA_TOO_LARGE',413);
  return json;
}
export async function listHeldPosInvoices(pool,workspace,ownerId,kind){
  ownerOK(ownerId);kindOK(kind);
  const rows=await pool.query(
    'SELECT body FROM sync_pos_held_invoices WHERE workspace=$1 AND owner_user_id=$2 AND kind=$3 ORDER BY updated_at DESC LIMIT 50',
    [workspace,ownerId,kind]);
  return rows.rows.map(r=>r.body);
}
export async function storeHeldPosInvoice(pool,workspace,ownerId,kind,held){
  ownerOK(ownerId);
  const body=validateHeldInvoice(kind,held);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('INSERT INTO sync_workspaces(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[workspace]);
    await client.query('SELECT id FROM sync_workspaces WHERE id=$1 FOR UPDATE',[workspace]);
    const existing=await client.query(
      'SELECT owner_user_id,kind FROM sync_pos_held_invoices WHERE workspace=$1 AND hold_id=$2',
      [workspace,held.id]);
    if(existing.rows.length){
      if(existing.rows[0].owner_user_id!==ownerId||existing.rows[0].kind!==kind)
        throw new InputError('HELD_INVOICE_ACCESS_DENIED',403);
    }else{
      const count=await client.query(
        'SELECT count(*)::integer AS count FROM sync_pos_held_invoices WHERE workspace=$1 AND owner_user_id=$2',
        [workspace,ownerId]);
      if(Number(count.rows[0]?.count||0)>=MAX_HELD_PER_USER)throw new InputError('HELD_INVOICE_LIMIT_REACHED',409);
    }
    const result=await client.query(
      'INSERT INTO sync_pos_held_invoices(workspace,hold_id,owner_user_id,kind,body) '+
      'VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(workspace,hold_id) '+
      'DO UPDATE SET body=EXCLUDED.body,updated_at=now() '+
      'WHERE sync_pos_held_invoices.owner_user_id=EXCLUDED.owner_user_id '+
      'AND sync_pos_held_invoices.kind=EXCLUDED.kind RETURNING hold_id',
      [workspace,held.id,ownerId,kind,body]);
    if(result.rowCount!==1)throw new InputError('HELD_INVOICE_ACCESS_DENIED',403);
    await client.query('COMMIT');
    return {id:held.id,saved:true};
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{client.release();}
}
export async function deleteHeldPosInvoice(pool,workspace,ownerId,id){
  ownerOK(ownerId);idOK(id);
  const result=await pool.query(
    'DELETE FROM sync_pos_held_invoices WHERE workspace=$1 AND owner_user_id=$2 AND hold_id=$3 RETURNING hold_id',
    [workspace,ownerId,id]);
  return {id,deleted:result.rowCount===1};
}
