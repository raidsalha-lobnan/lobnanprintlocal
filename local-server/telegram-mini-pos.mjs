import crypto from 'node:crypto';
import {InputError} from './sync-domain.mjs';
import {resolveAccess,authorizeCommand} from './access-policy.mjs';
import {validateAtomicInvoicePosting} from './atomic-invoice-posting.mjs';
import {buildNewAtomicPosSale} from './atomic-pos-builder.compiled.mjs';

const fail=(code,status=422)=>{throw new InputError(code,status);};
const uid=v=>typeof v==='string'&&v.length<=180&&/^[a-zA-Z0-9_-]+$/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const number=(value,label,min=0,max=1e8)=>{
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)
  fail('MINI_POS_INVALID_'+label);
 return value;
};
const text=(v,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';

export function verifyTelegramMiniInitData(initData,botToken,now=Date.now()){
 if(typeof initData!=='string'||initData.length<45||initData.length>8192)
  fail('TELEGRAM_MINI_AUTH_REQUIRED',401);
 if(typeof botToken!=='string'||botToken.length<20)
  fail('TELEGRAM_MINI_NOT_CONFIGURED',503);
 const params=new URLSearchParams(initData);
 const given=params.get('hash')||'';
 if(!/^[a-f0-9]{64}$/i.test(given)||params.getAll('hash').length!==1)
  fail('TELEGRAM_MINI_INVALID_SIGNATURE',401);
 const rows=[...params.entries()].filter(([k])=>k!=='hash')
  .sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v);
 const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest();
 const expected=crypto.createHmac('sha256',secret).update(rows.join('\n')).digest();
 if(!crypto.timingSafeEqual(Buffer.from(given,'hex'),expected))
  fail('TELEGRAM_MINI_INVALID_SIGNATURE',401);
 const authDate=Number(params.get('auth_date'));
 if(!Number.isSafeInteger(authDate)||Math.abs(now-authDate*1000)>12*60*60*1000)
  fail('TELEGRAM_MINI_SESSION_EXPIRED',401);
 let user=null;
 try{user=JSON.parse(params.get('user')||'null');}catch{}
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0)
  fail('TELEGRAM_MINI_INVALID_USER',401);
 return {telegramUserId:String(user.id),name:text(user.first_name,50)};
}

export function normalizeMiniSaleBody(body){
 if(!body||typeof body!=='object'||Array.isArray(body))
  fail('MINI_POS_INVALID_DRAFT');
 const items=body.items;
 if(!Array.isArray(items)||items.length<1||items.length>25)
  fail('MINI_POS_INVALID_ITEMS');
 const allowed=['cash','card','bank_transfer','credit'];
 const paymentMethod=allowed.includes(body.paymentMethod)?body.paymentMethod:'cash';
 const normalizedItems=items.map(x=>{
  if(!uid(x?.itemId))fail('MINI_POS_INVALID_ITEM_ID');
  const dimensioned=x.hasDimensions===true;
  const quantity=number(Number(x.quantity),'QUANTITY',.0001,1e6);
  const unitPrice=number(Number(x.unitPrice),'PRICE',0,1e8);
  const length=dimensioned?number(Number(x.length),'LENGTH',.001,10000):0;
  const width=dimensioned?number(Number(x.width),'WIDTH',.001,10000):0;
  const count=dimensioned?number(Number(x.count),'COUNT',1,100000):1;
  return {itemId:x.itemId,quantity,unitPrice,hasDimensions:dimensioned,
   length,width,count,notes:text(x.notes,300)};
 });
 const paidAmount=body.paidAmount===null||body.paidAmount===''||body.paidAmount===undefined
  ?null:number(Number(body.paidAmount),'PAID',0,1e9);
 return {
  customerId:uid(body.customerId)?body.customerId:'',
  items:normalizedItems,paymentMethod,paidAmount,
  overallDiscount:number(Number(body.overallDiscount||0),'DISCOUNT',0,1e9),
  notes:text(body.notes,1200),
  treasuryCode:uid(body.treasuryCode)?body.treasuryCode:'',
  customerName:text(body.customerName,160),
  subCustomerName:text(body.subCustomerName,100)
 };
}

export class TelegramMiniPos {
 constructor(pool,workspace,syncService,adminUserId=''){
  this.pool=pool;this.workspace=workspace;this.syncService=syncService;this.adminUserId=adminUserId;
  this.cachedBot=null;this.botFetched=0;
 }
 async botToken(){
  if(this.cachedBot&&Date.now()-this.botFetched<20000)return this.cachedBot;
  const r=await this.pool.query(
   "SELECT value->'telegramConfig' AS cfg FROM sync_records WHERE workspace=$1 AND entity='settings' AND record_id IN ('global','workspace-settings') ORDER BY CASE WHEN record_id='global' THEN 0 ELSE 1 END LIMIT 1",
   [this.workspace]);
  const config=r.rows[0]?.cfg;
  if(!config?.enabled||!config.botToken)fail('TELEGRAM_MINI_NOT_CONFIGURED',503);
  this.cachedBot=config.botToken;this.botFetched=Date.now();return this.cachedBot;
 }
 async identity(initData){
  return verifyTelegramMiniInitData(initData,await this.botToken());
 }
 ensurePosAccess(access){
  if(!access?.can('view')||!access.can('view_pos')||!access.can('add'))
   fail('TELEGRAM_POS_PERMISSION_DENIED',403);
 }
 async pairStart(user,access){
  this.ensurePosAccess(access);
  const code=crypto.randomBytes(10).toString('hex').toUpperCase();
  const encrypted=hash(this.workspace+':'+code);
  await this.pool.query(
   "DELETE FROM sync_telegram_pos_pair_codes WHERE workspace=$1 AND (app_user_id=$2 OR expires_at<now())",
   [this.workspace,user.id]);
  await this.pool.query(
   "INSERT INTO sync_telegram_pos_pair_codes(workspace,code_hash,app_user_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
   [this.workspace,encrypted,user.id]);
  return {code,expiresInSeconds:600,miniAppUrl:'https://lobnanprintlocal.vercel.app/telegram-pos'};
 }
 async pairFinish(initData,code){
  const identity=await this.identity(initData);
  if(!/^[A-F0-9]{20}$/.test(String(code||'')))fail('TELEGRAM_MINI_INVALID_PAIR_CODE',403);
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   const pair=await client.query(
    'SELECT app_user_id FROM sync_telegram_pos_pair_codes WHERE workspace=$1 AND code_hash=$2 AND expires_at>now() FOR UPDATE',
    [this.workspace,hash(this.workspace+':'+code)]);
   if(!pair.rows.length)fail('TELEGRAM_MINI_PAIR_CODE_EXPIRED',403);
   const appUserId=pair.rows[0].app_user_id;
   const active=await client.query(
    "SELECT 1 FROM sync_auth_users WHERE workspace=$1 AND user_id=$2 AND status='active'",
    [this.workspace,appUserId]);
   if(!active.rows.length)fail('TELEGRAM_MINI_PAIR_USER_INACTIVE',403);
   // Existing links cannot silently be taken over from a different program user.
   const already=await client.query(
    'SELECT app_user_id FROM sync_telegram_pos_links WHERE workspace=$1 AND telegram_user_id=$2',
    [this.workspace,identity.telegramUserId]);
   if(already.rows.length&&already.rows[0].app_user_id!==appUserId)
    fail('TELEGRAM_MINI_ACCOUNT_ALREADY_LINKED',409);
   await client.query(
    'DELETE FROM sync_telegram_pos_links WHERE workspace=$1 AND app_user_id=$2',
    [this.workspace,appUserId]);
   await client.query(
    'INSERT INTO sync_telegram_pos_links(workspace,telegram_user_id,app_user_id) VALUES($1,$2,$3)',
    [this.workspace,identity.telegramUserId,appUserId]);
   await client.query(
    'DELETE FROM sync_telegram_pos_pair_codes WHERE workspace=$1 AND app_user_id=$2',
    [this.workspace,appUserId]);
   await client.query('COMMIT');
   return {ok:true,linked:true};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
 }
 async session(initData){
  const identity=await this.identity(initData);
  const r=await this.pool.query(
   "SELECT l.app_user_id,p.value AS profile FROM sync_telegram_pos_links l JOIN sync_auth_users a ON a.workspace=l.workspace AND a.user_id=l.app_user_id AND a.status='active' JOIN sync_records p ON p.workspace=l.workspace AND p.entity='users' AND p.record_id=l.app_user_id WHERE l.workspace=$1 AND l.telegram_user_id=$2",
   [this.workspace,identity.telegramUserId]);
  if(!r.rows.length)fail('TELEGRAM_MINI_PAIR_REQUIRED',403);
  const profile=r.rows[0].profile;
  const access=await resolveAccess(this.pool,this.workspace,profile,this.adminUserId);
  this.ensurePosAccess(access);
  return {...identity,user:profile,access};
 }
 async bootstrap(initData){
  const auth=await this.session(initData);
  const rows=await this.pool.query(
   "SELECT entity,record_id,value FROM sync_records WHERE workspace=$1 AND entity IN ('settings','parties','treasuries')",
   [this.workspace]);
  const parties=rows.rows.filter(r=>r.entity==='parties'&&
    r.value&&!r.value.isSubCustomer&&['customer','both'].includes(r.value.type)&&
    auth.access.canRead('parties',r.value,r.record_id))
   .map(r=>({id:r.record_id,name:r.value.name,code:r.value.code,
    phone:r.value.phone||'',balance:r.value.balance||0}));
  const treasuries=rows.rows.filter(r=>r.entity==='treasuries'&&
    r.value?.status==='active'&&auth.access.canRead('treasuries',r.value,r.record_id))
   .map(r=>({id:r.record_id,name:r.value.name,accountCode:r.value.accountCode,
    type:r.value.type,isDefault:r.value.isDefault}));
  const settings=rows.rows.find(r=>r.entity==='settings'&&['global','workspace-settings'].includes(r.record_id))?.value||{};
  const draftRows=await this.pool.query(
   "SELECT draft_id,status,body,invoice_id,updated_at FROM sync_telegram_pos_drafts WHERE workspace=$1 AND telegram_user_id=$2 ORDER BY updated_at DESC LIMIT 8",
   [this.workspace,auth.telegramUserId]);
  return {ok:true,displayName:auth.user.name||auth.name,parties,treasuries,
   defaultCustomerId:parties.find(x=>x.code==='CUST-0001')?.id||parties[0]?.id||'',
   currency:'ILS',currencySymbol:'₪',vatRate:Number(settings.vatRate||0),
   drafts:draftRows.rows.map(r=>({draftId:r.draft_id,status:r.status,invoiceId:r.invoice_id,
     updatedAt:r.updated_at,body:r.body}))};
 }
 async search(initData,query){
  const auth=await this.session(initData);
  const q=text(query,60);
  if(!q)return {items:[]};
  const r=await this.pool.query(
   "SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='inventory' AND (value->>'name' ILIKE $2 OR value->>'code' ILIKE $2 OR value->>'barcode' ILIKE $2 OR record_id=$4) ORDER BY CASE WHEN value->>'code' ILIKE $3 THEN 0 ELSE 1 END,record_id LIMIT 35",
   [this.workspace,'%'+q+'%',q+'%',q]);
  const items=r.rows.filter(x=>x.value&&auth.access.canRead('inventory',x.value,x.record_id))
   .map(x=>({id:x.record_id,name:x.value.name,code:x.value.code,
    barcode:x.value.barcode||'',sellingPrice:Number(x.value.sellingPrice||0),
    purchasePrice:Number(x.value.purchasePrice||0),
    stockQuantity:Number(x.value.stockQuantity||0),
    category:x.value.category,unit:x.value.unit||''}));
  return {items};
 }
 async createCustomer(initData,details){
  const auth=await this.session(initData);
  const name=text(details?.name,120),phone=text(details?.phone,35);
  if(name.length<2)fail('MINI_POS_CUSTOMER_NAME_REQUIRED');
  const id='pt-mini-'+crypto.randomUUID();
  const command={id:crypto.randomUUID(),workspaceId:this.workspace,actorId:auth.user.id,
   createdAt:Date.now(),attempts:0,retryAt:0,status:'pending',
   changes:[{entity:'parties',id,expectedVersion:0,value:{
    id,code:'CUST-0002',_serverAutoCode:true,type:'customer',
    name,phone,email:'',balance:0,openingBalance:0
   }}]};
  await authorizeCommand(this.pool,this.workspace,auth.access,command);
  const receipt=await this.syncService.push(this.workspace,command,auth.user.id);
  const customer=receipt.changes.find(x=>x.entity==='parties'&&x.id===id)?.value;
  if(!customer)fail('MINI_POS_CUSTOMER_RECEIPT_MISSING',503);
  return {ok:true,customer:{id:customer.id,name:customer.name,code:customer.code,
    phone:customer.phone,balance:customer.balance}};
 }
 async saveDraft(initData,draftId,input){
  const auth=await this.session(initData);
  if(!uuid(draftId))fail('MINI_POS_DRAFT_ID_INVALID');
  const body=normalizeMiniSaleBody(input);
  const result=await this.pool.query(
   `INSERT INTO sync_telegram_pos_drafts(workspace,draft_id,telegram_user_id,app_user_id,body)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(workspace,draft_id) DO UPDATE
     SET body=EXCLUDED.body,updated_at=now()
    WHERE sync_telegram_pos_drafts.telegram_user_id=EXCLUDED.telegram_user_id
      AND sync_telegram_pos_drafts.app_user_id=EXCLUDED.app_user_id
      AND sync_telegram_pos_drafts.status='draft'
    RETURNING draft_id,status`,
   [this.workspace,draftId,auth.telegramUserId,auth.user.id,JSON.stringify(body)]);
  if(!result.rows.length){
   // Lost HTTP acknowledgement after a successful posting: let the client
   // proceed to the idempotent commit endpoint, never create another invoice.
   const existing=await this.pool.query(
    "SELECT status FROM sync_telegram_pos_drafts WHERE workspace=$1 AND draft_id=$2 AND telegram_user_id=$3 AND app_user_id=$4",
    [this.workspace,draftId,auth.telegramUserId,auth.user.id]);
   if(existing.rows[0]?.status==='posted')return {ok:true,draftId,status:'posted'};
   fail('MINI_POS_DRAFT_POSTED_OR_NOT_OWNED',409);
  }
  return {ok:true,draftId,status:'draft'};
 }
 async commit(initData,draftId){
  const auth=await this.session(initData);
  if(!uuid(draftId))fail('MINI_POS_DRAFT_ID_INVALID');
  return this.syncService.withTx(async client=>{
   const r=await client.query(
    "SELECT status,body,invoice_id,created_at FROM sync_telegram_pos_drafts WHERE workspace=$1 AND draft_id=$2 AND telegram_user_id=$3 AND app_user_id=$4 FOR UPDATE",
    [this.workspace,draftId,auth.telegramUserId,auth.user.id]);
   if(!r.rows.length)fail('MINI_POS_DRAFT_NOT_FOUND',404);
   const draft=r.rows[0];
   const invoiceId='inv-pos-'+draftId;
   if(draft.status==='posted'){
    const prev=await client.query(
     "SELECT value FROM sync_records WHERE workspace=$1 AND entity='invoices' AND record_id=$2",
     [this.workspace,invoiceId]);
    if(!prev.rows.length)fail('MINI_POS_POSTED_RECEIPT_MISSING',503);
    const invoice=prev.rows[0].value;
    return {ok:true,alreadyPosted:true,invoiceNumber:invoice.invoiceNumber,
     invoiceId,totalAmount:invoice.totalAmount,customerName:invoice.customerName};
   }
   const body=normalizeMiniSaleBody(draft.body);
   const ids=[...new Set(body.items.map(i=>i.itemId))];
   const [stock,parties,settings,treasuries]=await Promise.all([
    client.query("SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='inventory' AND record_id=ANY($2::text[])",[this.workspace,ids]),
    client.query("SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='parties' AND (record_id=$2 OR value->>'parentPartyId'=$2)",[this.workspace,body.customerId]),
    client.query("SELECT value FROM sync_records WHERE workspace=$1 AND entity='settings' AND record_id IN ('global','workspace-settings') ORDER BY CASE WHEN record_id='global' THEN 0 ELSE 1 END LIMIT 1",[this.workspace]),
    client.query("SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='treasuries'",[this.workspace])
   ]);
   if(stock.rows.length!==ids.length)fail('MINI_POS_ITEM_NOT_FOUND',409);
   const byId=new Map(stock.rows.map(row=>[row.record_id,row]));
   const selected=parties.rows.find(p=>p.record_id===body.customerId);
   if(!selected||!['customer','both'].includes(selected.value?.type)||
     selected.value.isSubCustomer===true)fail('MINI_POS_CUSTOMER_INVALID',409);
   for(const row of [...stock.rows,...parties.rows]){
    const entity=byId.has(row.record_id)?'inventory':'parties';
    if(!auth.access.canRead(entity,row.value,row.record_id))
     fail('MINI_POS_RECORD_NOT_AUTHORIZED',403);
   }
   const options={
    userId:auth.user.id,userName:auth.user.name||auth.user.username||'Telegram',
    branchId:auth.user.allowedBranchIds?.find(x=>x!=='*')||auth.user.branchId||undefined,
    currency:'ILS',currencySymbol:'₪',exchangeRate:1,
    overallDiscount:body.overallDiscount,
    ...(body.paidAmount===null?{}:{paidAmount:body.paidAmount}),
    ...(body.subCustomerName?{subCustomerName:body.subCustomerName}:{}),
   };
   if(body.treasuryCode){
    const treasury=treasuries.rows.find(r=>r.value?.accountCode===body.treasuryCode&&r.value.status==='active');
    if(!treasury||!auth.access.canRead('treasuries',treasury.value,treasury.record_id))
     fail('MINI_POS_TREASURY_INVALID',403);
    options.treasuryAccountCode=body.treasuryCode;
   }
   const inventory=stock.rows.map(r=>({id:r.record_id,value:r.value,version:Number(r.version),pending:false}));
   const partyViews=parties.rows.map(r=>({id:r.record_id,value:r.value,version:Number(r.version),pending:false}));
   const lines=body.items.map(line=>{
    const item=byId.get(line.itemId).value;
    return {item,quantity:line.quantity,unitPrice:line.unitPrice,
      hasDimensions:line.hasDimensions,length:line.length,width:line.width,
      count:line.count,notes:line.notes};
   });
   const {posting}=buildNewAtomicPosSale({
    invoiceId,commandId:draftId,createdAt:new Date(draft.created_at).toISOString(),
    items:lines,customerId:body.customerId,
    customerName:selected.value.name, // immutable server-resolved counterparty
    paymentMethod:body.paymentMethod,notes:body.notes,options,
    vatRate:Number(settings.rows[0]?.value?.vatRate||0),
    inventory,parties:partyViews
   });
   const versionMap=new Map([...stock.rows,...parties.rows].map(r=>[r.record_id,Number(r.version)]));
   const changes=[posting.invoice,...posting.journals,...posting.stockMovements,
     ...posting.partyChanges,...posting.inventoryChanges].map(c=>({
      ...c,expectedVersion:versionMap.get(c.id)||0
     }));
   const command={id:draftId,workspaceId:this.workspace,actorId:auth.user.id,
    atomicInvoiceId:invoiceId,changes,createdAt:Date.parse(draft.created_at),
    attempts:0,retryAt:0,status:'pending'};
   validateAtomicInvoicePosting(command);
   // authorization checks original user access and constrains derived ledger effects
   await authorizeCommand(this.pool,this.workspace,auth.access,command);
   const receipt=await this.syncService.pushInTx(this.workspace,command,auth.user.id,client);
   const invoice=receipt.changes.find(x=>x.entity==='invoices'&&x.id===invoiceId)?.value;
   if(!invoice||!/^INV-\d+$/.test(invoice.invoiceNumber))
    fail('MINI_POS_OFFICIAL_RECEIPT_MISSING',503);
   const updated=await client.query(
    "UPDATE sync_telegram_pos_drafts SET status='posted',invoice_id=$3,updated_at=now() WHERE workspace=$1 AND draft_id=$2 AND status='draft'",
    [this.workspace,draftId,invoiceId]);
   if(updated.rowCount!==1)fail('MINI_POS_COMMIT_CHECKPOINT_FAILED',503);
   return {ok:true,invoiceNumber:invoice.invoiceNumber,invoiceId,
    totalAmount:invoice.totalAmount,customerName:invoice.customerName};
  });
 }
}
