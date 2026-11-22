/**
 * Protect the employee directory from partial IndexedDB projections.
 * An unexpected one-employee loss is NOT an authorized deletion; verify
 * the exact server roster before replacing previously visible staff.
 * Never sends a create, update or delete command to PostgreSQL.
 */
export interface EmployeeLike {id:string}
export interface EmployeeDirectoryVerification {
  centralIds:string[];
  stillMissing:Array<{id:string}>;
}
export interface EmployeeDirectoryReader<T extends EmployeeLike> {
  checkEmployeeDirectory():Promise<EmployeeDirectoryVerification>;
  getAllVisibleGrouped(entities:readonly 'employees'[]):Promise<Record<string,T[]>>;
}
export interface EmployeeProjectionDecision<T extends EmployeeLike>{
  employees:T[];
  reason:'unchanged'|'repaired'|'verified-server-absence'|'pending-local-conflict'|'offline-retained';
  missingIds:string[];
}
export async function reconcileUnexpectedEmployeeLoss<T extends EmployeeLike>(
  reader:EmployeeDirectoryReader<T>,previous:readonly T[],incoming:readonly T[]
):Promise<EmployeeProjectionDecision<T>>{
  const currentIds=new Set(incoming.map(row=>row.id));
  const missing=previous.filter(row=>!currentIds.has(row.id));
  if(!missing.length)return {employees:[...incoming],reason:'unchanged',missingIds:[]};
  const missingIds=missing.map(row=>row.id);
  try{
    const verification=await reader.checkEmployeeDirectory();
    const grouped=await reader.getAllVisibleGrouped(['employees']);
    const verifiedRows=[...(grouped.employees||[])];
    const verifiedIds=new Set(verifiedRows.map(row=>row.id));
    const centralIds=new Set(verification.centralIds);
    const blocked=new Set(verification.stillMissing.map(row=>row.id));
    // A local outbox overlay may temporarily conceal a server-confirmed
    // employee. Preserve the prior on-screen row until reconciliation.
    const held=missing.filter(row=>centralIds.has(row.id)&&
      blocked.has(row.id)&&!verifiedIds.has(row.id));
    const result=[...verifiedRows,...held];
    const stillAbsent=missingIds.filter(id=>!result.some(row=>row.id===id));
    return {
      employees:result,
      reason:held.length?'pending-local-conflict':
        stillAbsent.length?'verified-server-absence':'repaired',
      missingIds
    };
  }catch(error){
    // An offline/failed comparison is never proof of deletion. Keep what was
    // already visible; include any genuinely newly appeared local records.
    console.warn('EMPLOYEE_UNEXPECTED_LOSS_VERIFICATION_FAILED; retaining prior display',error);
    const previousIds=new Set(previous.map(row=>row.id));
    const additional=incoming.filter(row=>!previousIds.has(row.id));
    return {
      employees:[...previous,...additional],
      reason:'offline-retained',
      missingIds
    };
  }
}
