// Every Add button calls the actual editor in its master-data screen.
// This small navigation bridge preserves the POS draft while switching screens.
// No duplicate quick-add form or separate entity creation path is used.
export type MasterKind = 'party' | 'supplier' | 'employee' | 'item';
export interface MasterRequest {
  kind: MasterKind;
  source: 'pos';
  initialName?: string;
  editId?: string;
  parentPartyId?: string;
  isSubCustomer?: boolean;
}
export interface MasterResult { kind: MasterKind; id: string; isSubCustomer?: boolean }

export const MASTER_OPEN_EVENT = 'lobnan:master-form-open';
export const MASTER_DONE_EVENT = 'lobnan:master-form-done';
const REQUEST_KEY = 'lobnan:master-create-request';
const ACTIVE_KEY = 'lobnan:master-create-active';
const RESULT_KEY = 'lobnan:master-create-result';

export function requestMasterForm(request: MasterRequest): void {
  sessionStorage.setItem(REQUEST_KEY, JSON.stringify(request));
  window.dispatchEvent(new Event(MASTER_OPEN_EVENT));
}

export function peekMasterFormRequest(): MasterRequest | null {
  try { return JSON.parse(sessionStorage.getItem(REQUEST_KEY) || 'null'); }
  catch { return null; }
}

export function claimMasterForm(kind: MasterKind): MasterRequest | null {
  const request = peekMasterFormRequest();
  if (!request || request.kind !== kind) return null;
  sessionStorage.removeItem(REQUEST_KEY);
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(request));
  return request;
}

export function finishMasterForm(kind: MasterKind, id: string): void {
  let active: MasterRequest | null = null;
  try { active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || 'null'); }
  catch { /* A broken pending request must not block creation. */ }
  if (!active || active.kind !== kind || active.source !== 'pos') return;
  sessionStorage.removeItem(ACTIVE_KEY);
  sessionStorage.setItem(RESULT_KEY, JSON.stringify({
    kind, id, isSubCustomer: Boolean(active.isSubCustomer)
  } satisfies MasterResult));
  window.dispatchEvent(new Event(MASTER_DONE_EVENT));
}

export function peekMasterResult(): MasterResult | null {
  try { return JSON.parse(sessionStorage.getItem(RESULT_KEY) || 'null'); }
  catch { return null; }
}

export function consumeMasterResult(): MasterResult | null {
  const result = peekMasterResult();
  if (result) sessionStorage.removeItem(RESULT_KEY);
  return result;
}
