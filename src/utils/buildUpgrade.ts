/** Decide whether a running JavaScript bundle is older than the live deployment.
 * PostgreSQL outbox state must not influence this decision: it survives reloads.
 */
export function shouldUpgradeClientBuild(
  compiledSha:string,
  lastSeenServerVersion:string|null,
  liveServerVersion:string
):boolean{
  const current=String(liveServerVersion||'').trim();
  if(!current)return false;
  const local=String(compiledSha||'').trim();
  if(local)return current!==local;
  // Development and legacy builds without a stamped SHA use a baseline first poll.
  return lastSeenServerVersion!==null && current!==lastSeenServerVersion;
}
