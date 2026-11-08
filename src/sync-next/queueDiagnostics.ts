import type {StoredRecord,SyncCommand} from './types';
export type ChangeComparison={
  entity:string;
  id:string;
  expectedVersion:number;
  serverVersion:number|null;
  status:'identical'|'different'|'absent';
  differentFields:string[];
};
export type QueueComparison={
  commandId:string;
  status:string;
  changes:ChangeComparison[];
  allIdentical:boolean;
};
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value);
}
function fields(a:unknown,b:unknown):string[]{
  if(a!==null && b!==null && typeof a==='object' && typeof b==='object'
    && !Array.isArray(a) && !Array.isArray(b)){
    const av=a as Record<string,unknown>,bv=b as Record<string,unknown>;
    return [...new Set([...Object.keys(av),...Object.keys(bv)])]
      .filter(k=>canonical(av[k])!==canonical(bv[k]))
      .filter(k=>!/password|token|secret|hash|credential/i.test(k))
      .sort().slice(0,40);
  }
  return ['(record)'];
}
export function compareQueueWithAuthoritativeRecords(commands:SyncCommand[],records:StoredRecord[]):QueueComparison[]{
  const index=new Map(records.map(r=>[r.entity+'\u001f'+r.id,r]));
  return commands.map(cmd=>{
    const changes=cmd.changes.map(change=>{
      const remote=index.get(change.entity+'\u001f'+change.id);
      const status:ChangeComparison['status']=!remote?'absent':
        canonical(change.value)===canonical(remote.value)?'identical':'different';
      return {entity:change.entity,id:change.id,expectedVersion:change.expectedVersion,
        serverVersion:remote?.version??null,status,
        differentFields:status==='different'?fields(change.value,remote?.value):[]};
    });
    return {commandId:cmd.id,status:cmd.status,changes,
      allIdentical:changes.length>0&&changes.every(c=>c.status==='identical')};
  });
}
