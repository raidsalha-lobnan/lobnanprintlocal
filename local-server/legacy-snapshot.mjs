import crypto from 'node:crypto';

export const SNAPSHOT_ENTITIES=[
  'invoices','parties','inventory','vouchers','purchases','purchaseReturns','salesReturns',
  'accounts','treasuries','treasuryTransactions','employees','employeeAdvances',
  'employeeDeductions','employeeIncentives','payrollSheets','journalEntries','expenses',
  'stockMovements','printOrders','debtClearings','companies','branches','warehouses',
  'warehouseOperations','roles','users','dailyEntrySheets','settings'
];
const privateField=/^(?:password|passwordHash|password_hash|passphrase|token|accessToken|refreshToken|idToken|bearerToken|apiToken|authToken|deviceToken|privateKey|clientSecret|serviceAccount|service_account|apiKey|api_key|googleDriveTokens|firebaseCredentials)$/i;
export function stripPrivateFields(value){
  if(Array.isArray(value))return value.map(stripPrivateFields);
  if(!value||typeof value!=='object')return value;
  const safe={};
  for(const [k,v] of Object.entries(value)){
    if(privateField.test(k))continue;
    safe[k]=stripPrivateFields(v);
  }
  return safe;
}
export function prepareLegacySnapshot(snapshot){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))
    throw Error('INVALID_LEGACY_SNAPSHOT');
  const users=snapshot.users;
  const roles=snapshot.roles;
  if(!Array.isArray(users)||!users.length||!Array.isArray(roles)||!roles.length)
    throw Error('USERS_AND_ROLES_REQUIRED');
  const roleIds=new Set(roles.map(x=>x?.id).filter(Boolean));
  const records=[], counts={}, ids=new Set();
  for(const entity of SNAPSHOT_ENTITIES){
    let data=snapshot[entity];
    if(data==null){counts[entity]=0;continue;}
    if(entity==='settings'){
      if(typeof data!=='object'||Array.isArray(data))throw Error('INVALID_SETTINGS');
      data=[{...data,id:'workspace-settings'}];
    }else if(entity==='dailyEntrySheets' && !Array.isArray(data)){
      if(typeof data!=='object')throw Error('INVALID_SHEETS');
      data=Object.entries(data).map(([id,val])=>({...val,id:val?.id||id}));
    }
    if(!Array.isArray(data))throw Error('NOT_AN_ARRAY:'+entity);
    counts[entity]=data.length;
    for(const row of data){
      if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id)
        throw Error('BAD_RECORD_ID:'+entity);
      const key=entity+'\u001f'+row.id;
      if(ids.has(key))throw Error('DUPLICATE_RECORD_ID:'+entity);
      ids.add(key);
      records.push({entity,id:row.id,value:stripPrivateFields(row)});
    }
  }
  const usernames=new Set(),emails=new Set(),userIds=new Set();
  for(const u of users){
    if(!u||typeof u.id!=='string'||!u.id||typeof u.username!=='string'||!u.username.trim()||
       typeof u.password!=='string'||!u.password||typeof u.roleId!=='string'||!roleIds.has(u.roleId)||
       !['active','inactive'].includes(u.status))
      throw Error('INCOMPLETE_LEGACY_USER');
    if(!Array.isArray(u.allowedBranchIds)||typeof u.companyId!=='string')
      throw Error('UNSUPPORTED_LEGACY_USER');
    const name=u.username.trim().toLowerCase();
    const email=typeof u.email==='string'?u.email.trim().toLowerCase():'';
    if(usernames.has(name)||userIds.has(u.id)||(email&&emails.has(email)))
      throw Error('DUPLICATE_LEGACY_ACCOUNT');
    usernames.add(name);userIds.add(u.id);if(email)emails.add(email);
  }
  // A username identical to the SAME account's email is legitimate.
  // Reject only aliases that could authenticate two different user IDs.
  const loginOwners=new Map();
  for(const u of users){
    for(const alias of [u.username,u.email]){
      const normalized=String(alias||'').trim().toLowerCase();
      if(!normalized)continue;
      if(loginOwners.has(normalized) && loginOwners.get(normalized)!==u.id)
        throw Error('AMBIGUOUS_USERNAME_EMAIL');
      loginOwners.set(normalized,u.id);
    }
  }
  const invoiceNumbers=new Set();
  let maxInvoice=0;
  for(const invoice of Array.isArray(snapshot.invoices)?snapshot.invoices:[]){
    const number=String(invoice.invoiceNumber||'').trim();
    if(!number)continue;
    if(invoiceNumbers.has(number))throw Error('DUPLICATE_INVOICE_NUMBER');
    invoiceNumbers.add(number);
    const match=/^INV-(\d{1,12})$/.exec(number);
    if(match)maxInvoice=Math.max(maxInvoice,Number(match[1]));
  }
  return {records,counts,users,invoiceNumbers:[...invoiceNumbers],maxInvoice,
    exportedAt:snapshot.exportedAt||null};
}
export function fileChecksum(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
