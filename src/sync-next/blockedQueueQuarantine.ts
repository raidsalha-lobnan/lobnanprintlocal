import type {SyncCommand} from './types';
import {recordKey} from './types';

/** Never quarantine an unrelated healthy command.
 * Closure includes later pending operations that depend on a blocked record;
 * an atomic multi-record command joins all of its records to the closure.
 */
export function planBlockedCommandQuarantine(commands:readonly SyncCommand[]) {
  const roots=commands.filter(c=>c.status==='conflict'||c.status==='rejected');
  const chosen=new Set(roots.map(c=>c.id));
  const keys=new Set(roots.flatMap(c=>c.changes.map(x=>recordKey(x.entity,x.id))));
  let changed=true;
  while(changed) {
    changed=false;
    for(const command of commands) {
      if(chosen.has(command.id)||command.status!=='pending')continue;
      if(!command.changes.some(c=>keys.has(recordKey(c.entity,c.id))))continue;
      chosen.add(command.id);
      for(const c of command.changes)keys.add(recordKey(c.entity,c.id));
      changed=true;
    }
  }
  const quarantined=commands.filter(cmd=>chosen.has(cmd.id));
  const healthy=commands.filter(cmd=>!chosen.has(cmd.id));
  return {
    quarantined,
    healthy,
    quarantinedIds:quarantined.map(cmd=>cmd.id),
    counts:{
      quarantined:quarantined.length,
      rejected:quarantined.filter(c=>c.status==='rejected').length,
      conflict:quarantined.filter(c=>c.status==='conflict').length,
      dependentPending:quarantined.filter(c=>c.status==='pending').length,
      healthyPending:healthy.filter(c=>c.status==='pending').length
    }
  };
}
