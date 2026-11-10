import type {BusinessSettings} from '../types';
import {sharedWorkspaceSettings} from '../utils/workspaceSettingsSync';
import type {JsonObject,SyncCommand} from './types';

export const SETTINGS_PATCH_MARKER='_settingsPatchV1';
export interface SettingsReceiptProof {id:string; fingerprint:string;}
export interface VerifiedSettingsReceipt {id:string;changes:Array<{entity:'settings';id:string;version:number}>;}
export interface SettingsFieldPatch {
  id:string;
  _settingsPatchV1:true;
  changes:Record<string,unknown>;
  before:Record<string,string>;
}

export function canonicalJson(value:unknown):string {
  if(value===undefined)return '__undefined__';
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  const obj=value as Record<string,unknown>;
  return '{'+Object.keys(obj).sort().filter(k=>obj[k]!==undefined).map(
    k=>JSON.stringify(k)+':'+canonicalJson(obj[k])
  ).join(',')+'}';
}
export async function sha256Hex(payload:string):Promise<string> {
  const binary=new TextEncoder().encode(payload);
  const digested=await crypto.subtle.digest('SHA-256',binary);
  return [...new Uint8Array(digested)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function createWorkspaceSettingsPatch(
  base:unknown,draft:Partial<BusinessSettings>,id:string,
):Promise<SettingsFieldPatch|null> {
  const old=sharedWorkspaceSettings(base,id);
  const values=sharedWorkspaceSettings(draft,id);
  const changes:Record<string,unknown>={};
  const before:Record<string,string>={};
  for(const key of Object.keys(values)){
    if(key==='id')continue;
    if(canonicalJson(old[key])===canonicalJson(values[key]))continue;
    changes[key]=values[key];
    before[key]=await sha256Hex(canonicalJson(old[key]));
  }
  if(!Object.keys(changes).length)return null;
  return {id,_settingsPatchV1:true,changes,before};
}
export function composeLocalSettingsDraft(
  base:unknown,patch:SettingsFieldPatch,
):JsonObject {
  const existing=base&&typeof base==='object'&&!Array.isArray(base)
    ? base as Record<string,unknown>:{};
  return {...existing,...patch.changes,id:patch.id} as JsonObject;
}
export async function fingerprintSyncCommand(cmd:SyncCommand):Promise<string> {
  const payload:{workspaceId:string;changes:typeof cmd.changes;atomicInvoiceId?:string}={
    workspaceId:cmd.workspaceId,changes:cmd.changes,
  };
  if(cmd.atomicInvoiceId)payload.atomicInvoiceId=cmd.atomicInvoiceId;
  return sha256Hex(JSON.stringify(payload));
}
