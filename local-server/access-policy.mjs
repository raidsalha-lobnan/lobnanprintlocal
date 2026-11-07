/**
 * Server-enforced permissions for the single-workspace transitional API.
 * Fail closed: UI-only permissions and user-selected company/branch are not trusted.
 * Roles and users can only be changed by future credential-aware admin endpoints.
 */
const PERMISSIONS={
  invoices:['view_invoices','view_pos'],
  salesReturns:['view_invoices'],
  printOrders:['view_print_orders'],
  inventory:['view_inventory','view_pos'],
  stockMovements:['view_inventory'],
  warehouseOperations:['view_inventory'],
  warehouses:['view_inventory'],
  purchases:['view_inventory'],
  purchaseReturns:['view_inventory'],
  parties:['view_invoices','view_accounting','view_pos'],
  accounts:['view_accounting'],
  journalEntries:['view_accounting'],
  vouchers:['view_accounting'],
  treasuries:['view_accounting'],
  treasuryTransactions:['view_accounting'],
  expenses:['view_accounting'],
  debtClearings:['view_accounting'],
  employees:['view_accounting','view_settings'],
  employeeAdvances:['view_accounting','view_settings'],
  employeeDeductions:['view_accounting','view_settings'],
  employeeIncentives:['view_accounting','view_settings'],
  payrollSheets:['view_accounting','view_settings'],
  dailyEntrySheets:['view_accounting'],
  companies:['view_dashboard','view_settings'],
  branches:['view_dashboard','view_pos','view_settings'],
  settings:['view_settings'],
  users:['view_settings'],
  roles:['view_settings']
};
const FINANCIAL_ENTITIES=new Set([
  'invoices','vouchers','journalEntries','purchases','purchaseReturns',
  'salesReturns','expenses','stockMovements','treasuryTransactions','debtClearings'
]);
const GLOBAL_ENTITIES=new Set(['settings','users','roles','companies','branches','accounts','parties','inventory','warehouses']);

const denied=(code='ACCESS_DENIED')=>{
  const e=new Error(code);
  e.status=403;
  return e;
};

export async function resolveAccess(pool,workspace,profile,initialAdminId=''){
  if(!profile||profile.status!=='active'||typeof profile.id!=='string')
    throw denied();
  if(!profile.roleId||typeof profile.roleId!=='string')throw denied('ROLE_REQUIRED');
  const result=await pool.query(
    "SELECT value FROM sync_records WHERE workspace=$1 AND entity='roles' AND record_id=$2 LIMIT 1",
    [workspace,profile.roleId]);
  const role=result.rows[0]?.value;
  const explicitlyConfiguredAdmin=!!initialAdminId && profile.id===initialAdminId;
  const systemAdmin=role && ['SYS_ADMIN','GEN_MGR'].includes(role.code);
  // No implicit admin grant from a name, email, user id, or unverified role label.
  const admin=!!(explicitlyConfiguredAdmin||systemAdmin);
  if(!admin && !role)throw denied('ROLE_NOT_IMPORTED');
  const permissions=role?.permissions||{};
  const overrides=profile.customPermissions||{};
  function can(key){
    if(Object.prototype.hasOwnProperty.call(overrides,key))
      return overrides[key]===true;
    return admin||permissions[key]===true;
  }
  const accessibleBranches=Array.isArray(profile.allowedBranchIds)
    ? profile.allowedBranchIds.filter(v=>typeof v==='string'):[];

  function branchScope(value,entity){
    if(admin)return true;
    if(!value||typeof value!=='object')return true;
    if(profile.companyId && value.companyId && value.companyId!==profile.companyId)return false;
    const branch=value.branchId||value.defaultBranchId;
    if(branch) return accessibleBranches.includes('*')||accessibleBranches.includes(branch);
    // Missing branch identifiers for financial records need administrator review.
    return GLOBAL_ENTITIES.has(entity) || accessibleBranches.includes('*');
  }

  function canRead(entity,value,id){
    if(!Object.prototype.hasOwnProperty.call(PERMISSIONS,entity))return false;
    if(entity==='users' && id===profile.id)return true;
    if(entity==='roles' && id===profile.roleId)return true;
    if(entity==='users'||entity==='roles'||entity==='settings'){
      return can('view_settings')&&branchScope(value,entity);
    }
    if(!can('view'))return false;
    if(!PERMISSIONS[entity].some(can))return false;
    return branchScope(value,entity);
  }

  function canChange(entity,value,previous){
    if(!Object.prototype.hasOwnProperty.call(PERMISSIONS,entity))return false;
    if(entity==='users'||entity==='roles')return false;
    if(value===null && FINANCIAL_ENTITIES.has(entity))return false;
    // Finalized invoices and journal postings cannot be edited in place.
    if(previous?.isOfficial === true && entity==='invoices')return false;
    if(!canRead(entity,value||previous,null))return false;
    if(!branchScope(value,entity)||!branchScope(previous,entity))return false;
    // Financial and configuration writes require explicit role permissions.
    const isNew=previous==null;
    if(!can(isNew?'add':'edit'))return false;
    if(entity==='vouchers' && !can('create_receipt')&&!can('create_payment'))return false;
    if(entity==='treasuryTransactions'&&!can('transfer_funds')&&!can('create_receipt')&&!can('create_payment'))return false;
    if(entity==='settings'&&!can('view_settings'))return false;
    return true;
  }

  return {profile,admin,role,can,canRead,canChange};
}

export function filterSnapshot(snapshot,access){
  return {...snapshot,records:snapshot.records.filter(row=>
    access.canRead(row.entity,row.value,row.id))};
}

export function filterEvents(events,access){
  return events.map(event=>({...event,changes:event.changes.filter(change=>
    // Legacy events lack a branch snapshot on tombstones: do not disclose
    // deleted record identities to a user whose branch cannot be verified.
    (change.value !== null || access.admin) &&
    access.canRead(change.entity,change.value,change.id))}));
}

export async function authorizeCommand(pool,workspace,access,command){
  if(!command||!Array.isArray(command.changes)||command.changes.length===0||
     command.changes.length>80)throw denied('INVALID_COMMAND');
  for(const change of command.changes){
    if(!change || typeof change.id!=='string'||!change.id ||
       typeof change.entity!=='string')throw denied();
    const row=await pool.query(
      'SELECT value FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id=$3',
      [workspace,change.entity,change.id]);
    const previous=row.rows[0]?.value||null;
    if(!access.canChange(change.entity,change.value,previous))throw denied('ENTITY_PERMISSION_DENIED');
  }
}
