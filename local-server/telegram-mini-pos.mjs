import crypto from 'node:crypto';
import {InputError} from './sync-domain.mjs';
import {resolveAccess,authorizeCommand} from './access-policy.mjs';
import {validateAtomicInvoicePosting} from './atomic-invoice-posting.mjs';
import {buildNewAtomicPosSale} from './atomic-pos-builder.compiled.mjs';
import {miniFinancialChanges,MINI_EXPENSE_CATEGORIES} from './telegram-mini-purchase-posting.mjs';

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
export function validMiniInvoiceDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const time=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}

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
 const documentType=body.documentType||'sale';
 if(!['sale','print','purchase','expense'].includes(documentType))fail('MINI_POS_DOCUMENT_TYPE_NOT_IMPLEMENTED',409);
 const items=body.items;
 if(!Array.isArray(items)||items.length<1||items.length>25)
  fail('MINI_POS_INVALID_ITEMS');
 const allowed=['cash','card','bank_transfer','credit'];
 const paymentMethod=allowed.includes(body.paymentMethod)?body.paymentMethod:'cash';
 const date=body.date===undefined||body.date===null||body.date===''?'':body.date;
 if(date!==''&&!validMiniInvoiceDate(date))fail('MINI_POS_DATE_INVALID');
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
 const split=body.cashPaidAmount!==undefined||body.bankPaidAmount!==undefined;
 const cashPaidAmount=split?number(Number(body.cashPaidAmount||0),'CASH_PAID',0,1e9):0;
 const bankPaidAmount=split?number(Number(body.bankPaidAmount||0),'BANK_PAID',0,1e9):0;
 const cashTreasuryCode=body.cashTreasuryCode||'';
 const bankTreasuryCode=body.bankTreasuryCode||'';
 if(split&&bankPaidAmount>0&&!/^CASH-\d{4,}$/.test(bankTreasuryCode))
  fail('MINI_POS_PAYMENT_TREASURY_REQUIRED');
 const subCustomerId=body.subCustomerId||'';
 if(subCustomerId&&!uid(subCustomerId))fail('MINI_POS_SUBCUSTOMER_ID_INVALID');
 return {
  customerId:uid(body.customerId)?body.customerId:'',
  date,documentType,items:normalizedItems,
  paymentMethod:split?(bankPaidAmount>0?'bank_transfer':cashPaidAmount>0?'cash':'credit'):paymentMethod,
  paidAmount:split?Math.round((cashPaidAmount+bankPaidAmount)*100)/100:paidAmount,
  cashPaidAmount,bankPaidAmount,cashTreasuryCode,bankTreasuryCode,hasPaymentSplit:split,
  overallDiscount:number(Number(body.overallDiscount||0),'DISCOUNT',0,1e9),
  notes:text(body.notes,1200),
  treasuryCode:uid(body.treasuryCode)?body.treasuryCode:'',
  customerName:text(body.customerName,160),
  subCustomerId:uid(body.subCustomerId)?body.subCustomerId:'',
  subCustomerName:text(body.subCustomerName,100),
  paymentNotes:text(body.paymentNotes,1000),
  counterpartyKind:['customer','supplier','employee'].includes(body.counterpartyKind)
   ?body.counterpartyKind:(['sale','print'].includes(documentType)?'customer':'supplier'),
  supplierInvoiceNumber:text(body.supplierInvoiceNumber,100),
  expenseCategory:Object.hasOwn(MINI_EXPENSE_CATEGORIES,body.expenseCategory)?body.expenseCategory:'other',
  expenseAccountCode:uid(body.expenseAccountCode)?body.expenseAccountCode:''
 };
}

// Cash always belongs to the single default cash_box in the authoritative
// workspace, irrespective of any previously saved/browser-submitted code.
export function resolveMiniCashBox(body,treasuryRows,access){
 if(!body||!(Number(body.cashPaidAmount)>0))return body;
 const cash=treasuryRows.filter(row=>row.record_id==='treasury-cash-main'&&
  row.value?.status==='active'&&row.value?.type==='cash_box'&&
  row.value?.accountCode==='CASH-1101'&&row.value?.isDefault===true);
 const main=cash.length===1?cash[0]:null;
 if(!main)
  fail('MINI_POS_DEFAULT_CASH_BOX_MISSING_OR_AMBIGUOUS',409);
 if(access&&!access.canRead('treasuries',main.value,main.record_id))
  fail('MINI_POS_DEFAULT_CASH_BOX_NOT_AUTHORIZED',403);
 return {...body,cashTreasuryCode:main.value.accountCode,
  treasuryCode:body.bankPaidAmount>0?body.bankTreasuryCode:main.value.accountCode};
}

// Only presentation IDs for treasuries differ from general-ledger account codes.
// Never change the invoice's actual cash or bank treasury identities.
export function mapMiniTreasuryJournalAccounts(journals,body){
 return journals.map(j=>({
  ...j,value:{...j.value,lines:(j.value.lines||[]).map(line=>{
   const cash=body.cashPaidAmount>0&&line.accountCode===body.cashTreasuryCode;
   const bank=body.bankPaidAmount>0&&line.accountCode===body.bankTreasuryCode;
   if(!cash&&!bank)return line;
   return {...line,accountCode:cash?'1101':'1102',
    accountName:cash?'الصندوق النقدي الرئيسي':'الحساب البنكي والمحافظ'};
  })}
 }));
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
   return {ok:true,linked:true,requiresRePair:false};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
 }
 async session(initData){
  const identity=await this.identity(initData);
  // A linking code lasts ten minutes. The actual Telegram-account link is durable
  // and must not depend on the pairing code, login token, or its expiry.
  const link=await this.pool.query(
   'SELECT app_user_id FROM sync_telegram_pos_links WHERE workspace=$1 AND telegram_user_id=$2',
   [this.workspace,identity.telegramUserId]);
  if(!link.rows.length)fail('TELEGRAM_MINI_PAIR_REQUIRED',403);
  const r=await this.pool.query(
   "SELECT p.value AS profile FROM sync_auth_users a JOIN sync_records p ON p.workspace=a.workspace AND p.entity='users' AND p.record_id=a.user_id WHERE a.workspace=$1 AND a.user_id=$2 AND a.status='active'",
   [this.workspace,link.rows[0].app_user_id]);
  // An inactive/deleted user is not an unpaired user: refuse access, never
  // encourage re-linking to bypass a revoked account or missing profile.
  if(!r.rows.length)fail('TELEGRAM_MINI_LINKED_USER_UNAVAILABLE',403);
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
  const suppliers=rows.rows.filter(r=>r.entity==='parties'&&
    r.value&&!r.value.isSubCustomer&&['supplier','both'].includes(r.value.type)&&
    auth.access.canRead('parties',r.value,r.record_id))
   .map(r=>({id:r.record_id,name:r.value.name,code:r.value.code,
     phone:r.value.phone||'',balance:r.value.balance||0}));
  const financialRows=await this.pool.query(
   "SELECT entity,record_id,value FROM sync_records WHERE workspace=$1 AND entity IN ('accounts','employees')",
   [this.workspace]);
  const expenseAccounts=financialRows.rows.filter(r=>r.entity==='accounts'&&r.value&&
    r.value.type==='expense'&&String(r.value.code||'').startsWith('5')&&
    auth.access.canRead('accounts',r.value,r.record_id))
   .map(r=>({id:r.record_id,code:r.value.code,name:r.value.name}));
  const employees=financialRows.rows.filter(r=>r.entity==='employees'&&r.value&&
    r.value.status!=='inactive'&&auth.access.canRead('employees',r.value,r.record_id))
   .map(r=>({id:r.record_id,name:r.value.name,code:r.value.code||''}));
  const parties=rows.rows.filter(r=>r.entity==='parties'&&
    r.value&&!r.value.isSubCustomer&&['customer','both'].includes(r.value.type)&&
    auth.access.canRead('parties',r.value,r.record_id))
   .map(r=>({id:r.record_id,name:r.value.name,code:r.value.code,
    phone:r.value.phone||'',balance:r.value.balance||0}));
  const permittedParentIds=new Set(parties.map(p=>p.id));
  const subCustomers=rows.rows.filter(r=>r.entity==='parties'&&
    r.value?.isSubCustomer===true&&permittedParentIds.has(r.value.parentPartyId)&&
    ['customer','both'].includes(r.value.type)&&
    auth.access.canRead('parties',r.value,r.record_id))
   .map(r=>({id:r.record_id,name:r.value.name,code:r.value.code,
    parentPartyId:r.value.parentPartyId}));
  const treasuries=rows.rows.filter(r=>r.entity==='treasuries'&&
    r.value?.status==='active'&&auth.access.canRead('treasuries',r.value,r.record_id))
   .map(r=>({id:r.record_id,name:r.value.name,accountCode:r.value.accountCode,
    type:r.value.type,isDefault:r.value.isDefault}));
  const settings=rows.rows.find(r=>r.entity==='settings'&&['global','workspace-settings'].includes(r.record_id))?.value||{};
  const draftRows=await this.pool.query(
   "SELECT draft_id,status,body,invoice_id,updated_at FROM sync_telegram_pos_drafts WHERE workspace=$1 AND telegram_user_id=$2 ORDER BY updated_at DESC LIMIT 8",
   [this.workspace,auth.telegramUserId]);
  return {ok:true,linked:true,linkExpires:false,displayName:auth.user.name||auth.name,
   parties,subCustomers,suppliers,employees,expenseAccounts,treasuries,
   canPurchases:auth.access.can('view_inventory')&&auth.access.can('view_accounting')&&auth.access.can('add'),
   canExpenses:auth.access.can('view_accounting')&&auth.access.can('add'),
   defaultSupplierId:suppliers[0]?.id||'',
   canPrintOrders:typeof auth.access.can==='function'&&
    auth.access.can('view_print_orders')&&auth.access.can('add'),
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
    category:x.value.category,unit:x.value.unit||'',
    unitCalculationType:x.value.unitCalculationType||'unit'}));
  return {items};
 }
 async createCustomer(initData,details){
  const auth=await this.session(initData);
  const name=text(details?.name,120),phone=text(details?.phone,35);
  const partyType=details?.type==='supplier'?'supplier':'customer';
  if(name.length<2)fail('MINI_POS_CUSTOMER_NAME_REQUIRED');
  const id='pt-mini-'+crypto.randomUUID();
  const command={id:crypto.randomUUID(),workspaceId:this.workspace,actorId:auth.user.id,
   createdAt:Date.now(),attempts:0,retryAt:0,status:'pending',
   changes:[{entity:'parties',id,expectedVersion:0,value:{
    id,code:partyType==='supplier'?'SUPP-0001':'CUST-0002',
    _serverAutoCode:true,type:partyType,
    name,phone,email:'',balance:0,openingBalance:0
   }}]};
  await authorizeCommand(this.pool,this.workspace,auth.access,command);
  const receipt=await this.syncService.push(this.workspace,command,auth.user.id);
  const customer=receipt.changes.find(x=>x.entity==='parties'&&x.id===id)?.value;
  if(!customer)fail('MINI_POS_CUSTOMER_RECEIPT_MISSING',503);
  return {ok:true,customer:{id:customer.id,name:customer.name,code:customer.code,
    phone:customer.phone,balance:customer.balance,type:customer.type}};
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
   if((draft.body?.documentType||'sale')==='print')
    return this.commitPrintOrderInTx(client,auth,draftId,draft);
   if(['purchase','expense'].includes(draft.body?.documentType))
    return this.commitPurchaseOrExpenseInTx(client,auth,draftId,draft);
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
   let body=normalizeMiniSaleBody(draft.body);
   const ids=[...new Set(body.items.map(i=>i.itemId))];
   // A pg client must execute statements sequentially inside a single open transaction.
   const stock=await client.query("SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='inventory' AND record_id=ANY($2::text[])",[this.workspace,ids]);
   const parties=await client.query("SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND ((entity='parties' AND (record_id=$2 OR value->>'parentPartyId'=$2)) OR (entity='employees' AND record_id=$2))",[this.workspace,body.customerId]);
   const settings=await client.query("SELECT value FROM sync_records WHERE workspace=$1 AND entity='settings' AND record_id IN ('global','workspace-settings') ORDER BY CASE WHEN record_id='global' THEN 0 ELSE 1 END LIMIT 1",[this.workspace]);
   const treasuries=await client.query("SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='treasuries'",[this.workspace]);
   body=resolveMiniCashBox(body,treasuries.rows,auth.access);
   const warehouses=await client.query("SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='warehouses'",[this.workspace]);
   if(warehouses.rows.length!==1)fail('MINI_POS_SINGLE_WAREHOUSE_REQUIRED',409);
   const warehouseName=text(warehouses.rows[0].value?.name,120);
   if(!warehouseName)fail('MINI_POS_WAREHOUSE_NAME_MISSING',409);
   if(stock.rows.length!==ids.length)fail('MINI_POS_ITEM_NOT_FOUND',409);
   const byId=new Map(stock.rows.map(row=>[row.record_id,row]));
   const selected=parties.rows.find(p=>p.record_id===body.customerId);
   const type=body.counterpartyKind;
   const partyAllowed=type==='employee'
    ?selected?.entity==='employees'&&selected.value?.status!=='terminated'&&
      selected.value?.status!=='inactive'
    :selected?.entity==='parties'&&!selected.value?.isSubCustomer&&
      [type,'both'].includes(selected.value?.type);
   if(!partyAllowed)fail('MINI_POS_COUNTERPARTY_INVALID',409);
   // A selected sub-customer must be an existing child of the selected main
   // customer. Never trust names or relationships submitted by the browser.
   if(type!=='customer'&&(body.subCustomerId||body.subCustomerName))
    fail('MINI_POS_SUBCUSTOMER_REQUIRES_CUSTOMER',409);
   const linkedSub=body.subCustomerId
    ?parties.rows.find(p=>p.entity==='parties'&&
       p.record_id===body.subCustomerId&&
      p.value?.isSubCustomer===true&&p.value?.parentPartyId===body.customerId&&
      ['customer','both'].includes(p.value?.type))
    :null;
   if(body.subCustomerId&&!linkedSub)fail('MINI_POS_SUBCUSTOMER_PARENT_INVALID',409);
   if(linkedSub&&!auth.access.canRead('parties',linkedSub.value,linkedSub.record_id))
    fail('MINI_POS_SUBCUSTOMER_NOT_AUTHORIZED',403);
   for(const row of [...stock.rows,...parties.rows]){
    const entity=byId.has(row.record_id)?'inventory':
     row.entity==='employees'?'employees':'parties';
    if(!auth.access.canRead(entity,row.value,row.record_id))
     fail('MINI_POS_RECORD_NOT_AUTHORIZED',403);
   }
   const options={
    userId:auth.user.id,userName:auth.user.name||auth.user.username||'Telegram',
    branchId:auth.user.allowedBranchIds?.find(x=>x!=='*')||auth.user.branchId||undefined,
    currency:'ILS',currencySymbol:'₪',exchangeRate:1,
    date:body.date||new Date(draft.created_at).toISOString().slice(0,10),
    warehouse:warehouseName,
    overallDiscount:body.overallDiscount,
    ...(body.paidAmount===null?{}:{paidAmount:body.paidAmount}),
    ...(linkedSub?{subCustomerId:linkedSub.record_id,subCustomerName:linkedSub.value.name}:
       body.subCustomerName?{subCustomerName:body.subCustomerName}:{}),
    paymentNotes:body.paymentNotes,
    counterpartyType:type,counterpartyId:body.customerId,
   };
   if(body.hasPaymentSplit){
    for(const [sum,code,target] of [
      [body.cashPaidAmount,body.cashTreasuryCode,'cashTreasuryCode'],
      [body.bankPaidAmount,body.bankTreasuryCode,'bankTreasuryCode']]){
     if(sum<=0)continue;
     const row=treasuries.rows.find(r=>r.value?.status==='active'&&r.value?.accountCode===code);
     if(!row||!auth.access.canRead('treasuries',row.value,row.record_id)||
       (target==='cashTreasuryCode'&&row.value.type!=='cash_box')||
       (target==='bankTreasuryCode'&&row.value.type==='cash_box'))
      fail('MINI_POS_PAYMENT_TREASURY_NOT_AUTHORIZED',403);
     options[target]=code;
    }
    options.cashPaidAmount=body.cashPaidAmount;
    options.bankPaidAmount=body.bankPaidAmount;
   }
   if(body.treasuryCode){
    const treasury=treasuries.rows.find(r=>r.value?.accountCode===body.treasuryCode&&r.value.status==='active');
    if(!treasury||!auth.access.canRead('treasuries',treasury.value,treasury.record_id))
     fail('MINI_POS_TREASURY_INVALID',403);
    options.treasuryAccountCode=body.treasuryCode;
   }
   const inventory=stock.rows.map(r=>({id:r.record_id,value:r.value,version:Number(r.version),pending:false}));
   const partyViews=parties.rows.filter(r=>r.entity==='parties')
    .map(r=>({id:r.record_id,value:r.value,version:Number(r.version),pending:false}));
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
   // Treasury identifiers (CASH-1101, CASH-1102, wallets...) are not GL
   // account numbers. Preserve treasury codes on invoice and payment records,
   // but debit their official chart accounts in the journal.
   const ledgerJournals=mapMiniTreasuryJournalAccounts(posting.journals,body);
   const changes=[posting.invoice,...ledgerJournals,...posting.stockMovements,
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
 // Purchase and expense invoices are separate authoritative business entities.
 // A purchase creates stock receipts; an expense invoice debits a selected
 // expense account and NEVER moves stock. Every effect is one SQL transaction.
 async commitPurchaseOrExpenseInTx(client,auth,draftId,draft){
  let body=normalizeMiniSaleBody(draft.body);
  const type=body.documentType,entity=type==='purchase'?'purchases':'expenses';
  const id=(type==='purchase'?'pur-mini-':'exp-mini-')+draftId;
  if(!['purchase','expense'].includes(type))fail('MINI_FINANCIAL_TYPE_INVALID');
  if(draft.status==='posted'){
   const previous=await client.query(
    'SELECT value FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id=$3',
    [this.workspace,entity,id]);
   const doc=previous.rows[0]?.value;
   if(!doc)fail('MINI_FINANCIAL_POSTED_RECEIPT_NOT_FOUND',503);
   return {ok:true,alreadyPosted:true,documentType:type,
    invoiceNumber:doc.invoiceNumber,invoiceId:id,
    customerName:doc.supplierName||doc.beneficiary,totalAmount:doc.totalAmount};
  }
  if(!auth.access.can('add')||!auth.access.can('view_accounting')||
    (type==='purchase'&&!auth.access.can('view_inventory')))
   fail('MINI_FINANCIAL_PERMISSION_DENIED',403);
  if(!['customer','supplier','employee'].includes(body.counterpartyKind))
   fail('MINI_FINANCIAL_COUNTERPARTY_TYPE_INVALID',409);
  // Lock the workspace BEFORE reading versions and issuing document numbers.
  // pushInTx obtains this same lock reentrantly on the same pg client.
  await client.query('INSERT INTO sync_workspaces(id) VALUES($1) ON CONFLICT(id) DO NOTHING',
    [this.workspace]);
  await client.query('SELECT next_sequence FROM sync_workspaces WHERE id=$1 FOR UPDATE',
    [this.workspace]);
  const itemIds=[...new Set(body.items.map(i=>i.itemId))];
  const records=await client.query(
   "SELECT entity,record_id,version,value FROM sync_records WHERE workspace=$1 AND ((entity='inventory' AND record_id=ANY($2::text[])) OR (entity='parties' AND record_id=$3) OR (entity='employees' AND record_id=$3) OR entity IN ('accounts','treasuries','warehouses','settings'))",
   [this.workspace,itemIds,body.customerId]);
  const rows=records.rows.filter(r=>r.value&&r.value._deleted!==true);
  const inventoryRows=rows.filter(r=>r.entity==='inventory');
  if(inventoryRows.length!==itemIds.length)fail('MINI_FINANCIAL_ITEM_NOT_FOUND',409);
  for(const row of inventoryRows){
   if(!auth.access.canRead('inventory',row.value,row.record_id))
    fail('MINI_FINANCIAL_ITEM_NOT_AUTHORIZED',403);
  }
  const employeeRow=body.counterpartyKind==='employee'
   ?rows.find(r=>r.entity==='employees'&&r.record_id===body.customerId):null;
  if(body.counterpartyKind==='employee'&&!employeeRow)
   fail('MINI_FINANCIAL_EMPLOYEE_NOT_FOUND',409);
  const supplierRow=!employeeRow
   ?rows.find(r=>r.entity==='parties'&&r.record_id===body.customerId):null;
  if(employeeRow){
   if(!auth.access.canRead('employees',employeeRow.value,employeeRow.record_id)||
     employeeRow.value.status==='inactive')
    fail('MINI_FINANCIAL_EMPLOYEE_NOT_AUTHORIZED',403);
  }else if(!supplierRow||
    ![body.counterpartyKind,'both'].includes(supplierRow.value.type)||
    supplierRow.value.isSubCustomer===true||
    !auth.access.canRead('parties',supplierRow.value,supplierRow.record_id)){
   fail('MINI_FINANCIAL_COUNTERPARTY_NOT_AUTHORIZED',409);
  }
  const accountRows=rows.filter(r=>r.entity==='accounts');
  const treasuryRows=rows.filter(r=>r.entity==='treasuries');
  body=resolveMiniCashBox(body,treasuryRows,auth.access);
  const accountCodes=new Set(['1302','2101','2103',body.expenseAccountCode,
   body.cashPaidAmount>0?'1101':null,
   body.bankPaidAmount>0?'1102':null].filter(Boolean));
  for(const code of accountCodes){
   const account=accountRows.find(r=>r.value.code===code);
   if(account&&!auth.access.canRead('accounts',account.value,account.record_id))
    fail('MINI_FINANCIAL_ACCOUNT_NOT_AUTHORIZED',403);
  }
  for(const [amt,code,expectedType] of [
   [body.cashPaidAmount,body.cashTreasuryCode,'cash_box'],
   [body.bankPaidAmount,body.bankTreasuryCode,'bank']]){
   if(amt<=0)continue;
   const row=treasuryRows.find(r=>r.value.accountCode===code&&
     r.value.status==='active');
   if(!row||!auth.access.canRead('treasuries',row.value,row.record_id)||
      (expectedType==='cash_box'&&row.value.type!=='cash_box')||
      (expectedType==='bank'&&row.value.type==='cash_box'))
    fail('MINI_FINANCIAL_TREASURY_NOT_AUTHORIZED',403);
  }
  const warehouses=rows.filter(r=>r.entity==='warehouses');
  if(type==='purchase'&&warehouses.length!==1)
   fail('MINI_PURCHASE_SINGLE_WAREHOUSE_REQUIRED',409);
  const selectedWarehouse=warehouses[0];
  if(selectedWarehouse&&type==='purchase'&&
    !auth.access.canRead('warehouses',selectedWarehouse.value,selectedWarehouse.record_id))
   fail('MINI_PURCHASE_WAREHOUSE_NOT_AUTHORIZED',403);
  const settings=rows.find(r=>r.entity==='settings'&&r.record_id==='global')?.
    value||rows.find(r=>r.entity==='settings')?.value||{};
  const vatRate=Number(settings.vatRate||0);
  const year=(body.date||new Date(draft.created_at).toISOString().slice(0,10)).slice(0,4);
  const prefix=type==='purchase'?'PUR-'+year+'-':'EXP-'+year+'-';
  const existing=await client.query(
   "SELECT value->>'invoiceNumber' AS code FROM sync_records WHERE workspace=$1 AND entity=$2 AND value->>'invoiceNumber' LIKE $3",
   [this.workspace,entity,prefix+'%']);
  const maximum=existing.rows.reduce((num,r)=>{
   const str=String(r.code||'');
   const suffix=str.startsWith(prefix)?str.slice(prefix.length):'';
   return /^[0-9]+$/.test(suffix)?Math.max(num,Number(suffix)):num;
  },0);
  const documentNumber=prefix+String(maximum+1).padStart(4,'0');
  const actor={id:auth.user.id,name:auth.user.name||auth.name,
   branchId:auth.user.allowedBranchIds?.find(x=>x!=='*')||auth.user.branchId};
  const output=miniFinancialChanges({
   workspace:this.workspace,body,draftId,
   createdAt:new Date(draft.created_at).toISOString(),
   documentNumber,supplierRow,employeeRow,
   stockRows:inventoryRows,accountRows,treasuryRows,
   warehouseId:selectedWarehouse?.record_id,
   warehouseName:selectedWarehouse?.value?.name||'الرئيسي',
   vatRate,actor
  });
  await authorizeCommand(this.pool,this.workspace,auth.access,output.command);
  const receipt=await this.syncService.pushInTx(
   this.workspace,output.command,auth.user.id,client,null,type==='purchase');
  const official=receipt.changes.find(r=>r.entity===entity&&r.id===id)?.value;
  if(!official||official.invoiceNumber!==documentNumber)
   fail('MINI_FINANCIAL_OFFICIAL_RECEIPT_MISSING',503);
  const updated=await client.query(
   "UPDATE sync_telegram_pos_drafts SET status='posted',invoice_id=$3,updated_at=now() WHERE workspace=$1 AND draft_id=$2 AND status='draft'",
   [this.workspace,draftId,id]);
  if(updated.rowCount!==1)fail('MINI_FINANCIAL_CHECKPOINT_FAILED',503);
  return {ok:true,documentType:type,invoiceNumber:documentNumber,invoiceId:id,
   customerName:output.partyName,totalAmount:output.amount.totalAmount};
 }
 // Print orders use the program's nonfinancial printOrders record. No sales
 // invoice, inventory movement, receipt, voucher or journal is ever generated.
 async commitPrintOrderInTx(client,auth,draftId,draft){
  const id='job-mini-'+draftId;
  if(draft.status==='posted'){
   const old=await client.query(
    "SELECT value FROM sync_records WHERE workspace=$1 AND entity='printOrders' AND record_id=$2",
    [this.workspace,id]);
   if(!old.rows.length)fail('MINI_PRINT_ORDER_RECEIPT_NOT_FOUND',503);
   const order=old.rows[0].value;
   return {ok:true,alreadyPosted:true,invoiceNumber:order.orderNumber,
    invoiceId:id,totalAmount:0,customerName:order.customerName,documentType:'print'};
  }
  const body=normalizeMiniSaleBody(draft.body);
  if(body.documentType!=='print')fail('MINI_PRINT_ORDER_INVALID_TYPE');
  if(Number(body.paidAmount||0)>0||body.cashPaidAmount>0||body.bankPaidAmount>0)
   fail('MINI_PRINT_ORDER_FINANCIAL_PAYMENT_NOT_ALLOWED',409);
  if(!auth.access.can('view_print_orders')||!auth.access.can('add'))
   fail('MINI_PRINT_ORDER_PERMISSION_DENIED',403);
  const parties=await client.query(
   "SELECT entity,record_id,value FROM sync_records WHERE workspace=$1 AND ((entity='parties' AND (record_id=$2 OR value->>'parentPartyId'=$2)) OR (entity='employees' AND record_id=$2))",
   [this.workspace,body.customerId]);
  const customer=parties.rows.find(row=>row.record_id===body.customerId);
  const kind=body.counterpartyKind;
  const valid=kind==='employee'
   ?customer?.entity==='employees'&&customer.value?.status!=='terminated'&&
     customer.value?.status!=='inactive'
   :customer?.entity==='parties'&&
     [kind,'both'].includes(customer.value?.type)&&
     customer.value?.isSubCustomer!==true;
  if(!valid)fail('MINI_PRINT_ORDER_COUNTERPARTY_INVALID',409);
  if(!auth.access.canRead(kind==='employee'?'employees':'parties',
    customer.value,customer.record_id))
   fail('MINI_PRINT_ORDER_COUNTERPARTY_FORBIDDEN',403);
  if(kind!=='customer'&&(body.subCustomerId||body.subCustomerName))
   fail('MINI_PRINT_ORDER_SUBCUSTOMER_REQUIRES_CUSTOMER',409);
  const sub=body.subCustomerId?parties.rows.find(row=>
   row.entity==='parties'&&row.record_id===body.subCustomerId&&
   row.value?.isSubCustomer===true&&
   row.value?.parentPartyId===body.customerId):null;
  if(body.subCustomerId&&!sub)fail('MINI_PRINT_ORDER_SUBCUSTOMER_INVALID',409);
  if(sub&&!auth.access.canRead('parties',sub.value,sub.record_id))
   fail('MINI_PRINT_ORDER_SUBCUSTOMER_FORBIDDEN',403);
  const ids=[...new Set(body.items.map(x=>x.itemId))];
  const stock=await client.query(
   "SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='inventory' AND record_id=ANY($2::text[])",
   [this.workspace,ids]);
  if(stock.rows.length!==ids.length)fail('MINI_PRINT_ORDER_ITEM_NOT_FOUND',409);
  const byId=new Map(stock.rows.map(row=>[row.record_id,row]));
  for(const row of stock.rows)
   if(!row.value||!auth.access.canRead('inventory',row.value,row.record_id))
    fail('MINI_PRINT_ORDER_ITEM_FORBIDDEN',403);
  // The workspace row is locked BEFORE selecting the next public job number.
  // This prevents two devices from allocating the same JOB-YYYY-NNNN number.
  await client.query('INSERT INTO sync_workspaces(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[this.workspace]);
  await client.query('SELECT next_sequence FROM sync_workspaces WHERE id=$1 FOR UPDATE',[this.workspace]);
  const year=(body.date||new Date(draft.created_at).toISOString().slice(0,10)).slice(0,4);
  const prefix='JOB-'+year+'-';
  const used=await client.query(
   "SELECT value->>'orderNumber' AS code FROM sync_records WHERE workspace=$1 AND entity='printOrders' AND value->>'orderNumber' LIKE $2",
   [this.workspace,prefix+'%']);
  const maximum=used.rows.reduce((n,row)=>{
   const value=String(row.code||'');
   const suffix=value.startsWith(prefix)?value.slice(prefix.length):'';
   return /^[0-9]+$/.test(suffix)?Math.max(n,Number(suffix)):n;
  },0);
  const orderNumber=prefix+String(maximum+1).padStart(4,'0');
  const createdAt=new Date(draft.created_at).toISOString();
  const items=body.items.map(line=>{
   const record=byId.get(line.itemId).value;
   const qty=line.hasDimensions
    ?Number((line.length*line.width*line.count).toFixed(3)):line.quantity;
   return {itemId:line.itemId,itemCode:record.code,itemName:record.name,
    quantity:qty,unit:record.unit||'',notes:line.notes,
    description:line.notes,hasDimensions:line.hasDimensions,
    length:line.hasDimensions?line.length:0,width:line.hasDimensions?line.width:0,
    count:line.hasDimensions?line.count:1,
    unitPrice:0,discount:0,tax:0,total:0};
  });
  const order={
   id,orderNumber,customerId:body.customerId,customerName:customer.value.name,
   counterpartyType:kind,counterpartyId:body.customerId,
   ...(kind==='employee'?{employeeId:body.customerId}:{}),
   customerPhone:customer.value.phone||'',subCustomerName:sub?.value?.name||body.subCustomerName||undefined,
   title:'أمر طباعة: '+String(items[0]?.itemName||'طلب جديد').slice(0,100),
   serviceType:'custom_print',paperType:'',dimensions:'',
   quantity:items.reduce((n,item)=>n+Number(item.count||item.quantity||1),0),
   colorType:'',finishingOptions:[],unitCost:0,totalPrice:0,
   depositPaid:0,remainingBalance:0,status:'new',
   notes:body.notes||'',createdAt,deliveryDate:body.date||createdAt.slice(0,10),
   items,isExternalPrint:false
  };
  const command={id:draftId,workspaceId:this.workspace,actorId:auth.user.id,
   changes:[{entity:'printOrders',id,expectedVersion:0,value:order}],
   createdAt:Date.parse(draft.created_at),attempts:0,retryAt:0,status:'pending'};
  await authorizeCommand(this.pool,this.workspace,auth.access,command);
  const receipt=await this.syncService.pushInTx(this.workspace,command,auth.user.id,client);
  const official=receipt.changes.find(row=>row.entity==='printOrders'&&row.id===id)?.value;
  if(!official||official.orderNumber!==orderNumber)fail('MINI_PRINT_ORDER_RECEIPT_INVALID',503);
  const updated=await client.query(
   "UPDATE sync_telegram_pos_drafts SET status='posted',invoice_id=$3,updated_at=now() WHERE workspace=$1 AND draft_id=$2 AND status='draft'",
   [this.workspace,draftId,id]);
  if(updated.rowCount!==1)fail('MINI_PRINT_ORDER_CHECKPOINT_FAILED',503);
  return {ok:true,invoiceNumber:official.orderNumber,invoiceId:id,
   totalAmount:0,customerName:official.customerName,documentType:'print'};
 }
}
