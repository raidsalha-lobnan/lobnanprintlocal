import type {SyncCommand} from './types';

/** Server access policy is always authoritative.
 * This advisory guard only stops a browser from attributing an earlier
 * logged-in user's offline command to a different program user.
 * Legacy commands without known provenance remain in the existing queue.
 */
export function mayProcessForCurrentActor(
  cmd: Pick<SyncCommand,'actorId'>,
  currentActorId: string,
  secureUserAuth: boolean
): boolean {
  if(!secureUserAuth||!cmd.actorId)return true;
  return !!currentActorId && cmd.actorId===currentActorId;
}
