import { LocalSyncDb } from './localDb';
import {planConflictResolution,planAtomicCommandAlreadyConfirmed} from './conflictResolution';
import {recordKey,type StoredRecord} from './types';
import {getCurrentSessionActorId,getCurrentSessionToken,secureLoginEnabled} from '../services/secureAuth';
import {isSafeAutoCodeRetryCandidate} from './catalogAutoRecovery';
import {mayProcessForCurrentActor} from './actorAffinity';
import {fingerprintSyncCommand,type SettingsReceiptProof,type VerifiedSettingsReceipt} from './settingsPatch';

import {
  sleep, PermanentSyncError,
  AppliedChange, ServerCursor, SyncCommand,
  VersionConflict
} from './types';

export interface SyncTransport {
  push(command: SyncCommand): Promise<{
    commandId: string;
    changes: any[];
  }>;

  pull(
    cursor: ServerCursor | null,
    pageSize?: number
  ): Promise<Array<{
    commandId: string;
    changes: any[];
    cursor: ServerCursor;
  }>>;

  fetchAuthoritativeBootstrap?():Promise<{records:StoredRecord[];cursor:ServerCursor}>;
  checkSettingsReceipts?(proofs:SettingsReceiptProof[]):Promise<VerifiedSettingsReceipt[]>;

  watchLatest(
    onChanged: () => void,
    onError: (error: unknown) => void
  ): () => void;
}

export interface SyncState {
  running: boolean;
  pending: number;
  conflict: number;
  archived?: number; // Locally quarantined, NOT server acknowledged.
  lastSuccessAt: number | null;
  lastError: string | null;
  isLeader: boolean;
}

export class SyncCoordinator {
  private started = false;
  private busy = false;
  private requested = false;
  private queueMaintenance = false;

  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  private listeners =
    new Set<(state: SyncState) => void>();
  private appliedListeners = new Set<(changes: AppliedChange[]) => void>();

  private state: SyncState = {
    running: false,
    pending: 0,
    conflict: 0,
    archived: 0,
    lastSuccessAt: null,
    lastError: null,
    isLeader: false
  };

  // LAN remains reachable even when the browser reports no public internet.
  private online = () => true;

  private cloudAllowed = () => {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(import.meta.env.VITE_SYNC_BACKEND === 'local-postgres' ? 'lobnan_postgres_reconciliation_required' : 'lobnan_sync_reconciliation_required') === 'true') {
        return false;
      }
      if (import.meta.env.VITE_SYNC_BACKEND === 'local-postgres') return true;
      return typeof localStorage === 'undefined' ||
        localStorage.getItem('accounting_is_local_only_mode') !== 'true';
    } catch { return true; }
  };

  // Network recovery should flush only *pending transport failures* promptly.
  // Never turn a rejected accounting/permission command back into a write.
  private onlineHandler = () => {
    void this.releaseTransportBackoffAfterReconnect().then(
      () => this.requestSync(),
      error => this.report({lastError:String(error)})
    );
  };

  private async releaseTransportBackoffAfterReconnect():Promise<void>{
    const commands=await this.local.pending();
    for(const command of commands){
      if(command.status!=='pending'||!command.error)continue;
      if(!/(?:LOCAL_SYNC_HTTP_(?:429|500|502|503|504)|NETWORK|FAILED TO FETCH|TIMEOUT|ECONN|FETCHERROR|OFFLINE)/i.test(command.error))continue;
      await this.local.retryCommand(command.id);
    }
  }

  private visibilityHandler = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.requestSync();
    }
  };

  private lockAbortController: AbortController | null = null;
  private lockRelease: (() => void) | null = null;
  private coordChannel: BroadcastChannel | null = null;

  constructor(
    private local: LocalSyncDb,
    private remote: SyncTransport,
    private workspaceId: string = 'default'
  ) {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.coordChannel = new BroadcastChannel(`lobnan-coord-${this.workspaceId}`);
      this.coordChannel.onmessage = (ev) => {
        if (ev.data === 'REQUEST_SYNC' && this.state.isLeader) {
          this.requestSync();
        }
      };
    }
  }

  onState(
    fn: (state: SyncState) => void
  ): () => void {
    this.listeners.add(fn);
    fn({ ...this.state });

    return () => this.listeners.delete(fn);
  }

  onApplied(listener: (changes: AppliedChange[]) => void): () => void {
    this.appliedListeners.add(listener);
    return () => this.appliedListeners.delete(listener);
  }

  private emitApplied(changes: AppliedChange[]) {
    for (const callback of this.appliedListeners) {
      try { callback(changes); } catch (error) {
        console.error('Unable to refresh synced UI records', error);
      }
    }
  }

  private report(partial: Partial<SyncState>) {
    const next = { ...this.state, ...partial };
    // Avoid broadcasting a new React state when no observable state changed.
    // Retry attempts and no-op polling must not keep re-rendering the UI.
    if ((Object.keys(next) as Array<keyof SyncState>)
      .every(key => Object.is(next[key], this.state[key]))) return;
    this.state = next;
    for (const fn of this.listeners) fn({ ...this.state });
  }

  async start() {
    if (this.started) return;

    this.started = true;

    if (typeof window !== 'undefined') {
      window.addEventListener(
        'online',
        this.onlineHandler
      );

      document.addEventListener(
        'visibilitychange',
        this.visibilityHandler
      );
    }

    // Single-leader election using Web Locks when available
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && (navigator as any).locks?.request) {
      this.lockAbortController = new AbortController();
      (navigator as any).locks.request(
        `lobnan_sync_leader_${this.workspaceId}`,
        { signal: this.lockAbortController.signal },
        async () => {
          this.report({ isLeader: true });
          this.timer = setInterval(
            () => this.requestSync(),
            120000
          );
          this.unsubscribe = this.remote.watchLatest(
            () => this.requestSync(),
            error => this.report({
              lastError: String(error)
            })
          );
          this.requestSync();
          return new Promise<void>(resolve => {
            this.lockRelease = resolve;
          });
        }
      ).catch(() => {
        // Lock released or aborted on stop
      });
    } else {
      // Environments without Web Locks (e.g. node:test or non-browser) act as direct leader
      this.report({ isLeader: true });
      this.timer = setInterval(
        () => this.requestSync(),
        120000
      );
      this.unsubscribe = this.remote.watchLatest(
        () => this.requestSync(),
        error => this.report({
          lastError: String(error)
        })
      );
      this.requestSync();
    }
  }

  stop() {
    this.started = false;

    if (this.timer) clearInterval(this.timer);

    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;

    if (this.lockRelease) {
      this.lockRelease();
      this.lockRelease = null;
    }

    if (this.lockAbortController) {
      this.lockAbortController.abort();
      this.lockAbortController = null;
    }

    if (this.coordChannel) {
      this.coordChannel.close();
      this.coordChannel = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener(
        'online',
        this.onlineHandler
      );

      document.removeEventListener(
        'visibilitychange',
        this.visibilityHandler
      );
    }

    this.report({ isLeader: false });
  }

  /** Archive only while this browser is the inactive network leader.
   * Never remove a command while a push may still be in flight.
   */
  async withPausedQueueMaintenance<T>(action:()=>Promise<T>):Promise<T>{
    if(!this.started||!this.state.isLeader)
      throw new Error('QUEUE_MAINTENANCE_REQUIRES_SYNC_LEADER_TAB');
    if(this.queueMaintenance)throw new Error('QUEUE_MAINTENANCE_ALREADY_ACTIVE');
    this.queueMaintenance=true;
    try{
      // Halt NEW network work, then allow an in-flight push to reach its ACK
      // before touching the outbox. If it changed, the backup fingerprint
      // check below will reject archival rather than hide a committed write.
      for(let i=0;i<100&&this.busy;i++)await sleep(75);
      if(this.busy)throw new Error('SYNC_IN_PROGRESS_RETRY_AFTER_IDLE');
      return await action();
    }finally{this.queueMaintenance=false;this.requestSync();}
  }

  requestSync() {
    if (!this.started || !this.cloudAllowed() || this.queueMaintenance) return;

    if (!this.state.isLeader) {
      // Non-leader tab requests the active leader tab to drain outbox
      this.coordChannel?.postMessage('REQUEST_SYNC');
      void this.refreshCounts().catch(error =>
        this.report({
          lastError: String(error)
        })
      );
      return;
    }

    this.requested = true;

    void this.refreshCounts().catch(error =>
      this.report({
        lastError: String(error)
      })
    );

    void this.drain();
  }

  private async drain() {
    if (this.busy || this.queueMaintenance || !this.online() || !this.cloudAllowed()) return;

    this.busy = true;
    this.report({ running: true });

    try {
      while (
        this.requested &&
        this.started &&
        this.online() && this.cloudAllowed()
      ) {
        this.requested = false;

        // First receive other devices' committed changes. Otherwise every
        // ordinary offline edit tries to write against an obsolete version.
        if(this.remote.fetchAuthoritativeBootstrap) await this.pullAllPages();
        await this.confirmCommittedSettingsReceipts();
        await this.reconcileConflicts();
        await this.pushPending();
        await this.pullAllPages();
      }

      await this.refreshCounts();

      if (this.state.pending === 0 && this.state.conflict === 0) {
        this.report({
          lastSuccessAt: Date.now(),
          lastError: null
        });
      }
    } catch (error) {
      this.report({
        lastError: String(error)
      });
    } finally {
      this.busy = false;
      this.report({ running: false });

      if (this.requested && this.started) {
        void this.drain();
      }
    }
  }

  private async refreshCounts() {
    const commands = await this.local.pending();

    // Existing test stubs and legacy sync clients might not expose the new
    // archive API. It is informational, never a prerequisite for sending.
    const archives=typeof this.local.listQuarantinedArchives==='function'
      ? await this.local.listQuarantinedArchives() : [];
    this.report({
      archived:archives.reduce((n,x)=>n+x.counts.quarantined,0),
      // Separate queued transport work from conflicts/rejections. Mixing them
      // made the dashboard's waiting count and success banners misleading.
      pending: commands.filter(c => c.status === 'pending').length,
      conflict: commands.filter(
        c => c.status !== 'pending'
      ).length
    });
  }

  private async confirmCommittedSettingsReceipts():Promise<void> {
    if(!this.remote.checkSettingsReceipts)return;
    const outstanding=(await this.local.pending()).filter(cmd=>
      cmd.changes.length===1 && cmd.changes[0].entity==='settings' &&
      ['global','workspace-settings'].includes(cmd.changes[0].id)
    );
    if(!outstanding.length)return;
    try {
      for(let i=0;i<outstanding.length;i+=24){
        const group=outstanding.slice(i,i+24);
        const proofs=await Promise.all(group.map(async cmd=>({
          id:cmd.id,fingerprint:await fingerprintSyncCommand(cmd),
        })));
        // Authentication + exact command fingerprint + owner + committed receipt
        // are verified on PostgreSQL BEFORE the browser removes anything.
        const verified=await this.remote.checkSettingsReceipts(proofs);
        if(verified.length && this.remote.fetchAuthoritativeBootstrap){
          const authoritative=await this.remote.fetchAuthoritativeBootstrap();
          // The local event cursor may be ahead of a missed ACK. Apply only
          // the authenticated, higher-version settings record before clearing
          // its matching, server-committed command receipt.
          await this.local.installAuthoritativeSettingsRows(authoritative.records);
        }
        await this.local.acknowledgeVerifiedSettingsReceipts(verified);
      }
    }catch(error){
      // A receipt-check outage must never discard the queue or prevent sync of
      // unrelated financial records.
      this.report({lastError:'SETTINGS_RECEIPT_CHECK_FAILED: '+String(error)});
    }
  }

  /** Evidence-based recovery across ALL entities, not a one-off invoice patch.
   * Identical authoritative state is confirmed without posting again;
   * disjoint non-financial contact edits are rebased using their saved base;
   * monetary, same-field and unknown-base differences stay visible for review.
   */
  private async reconcileConflicts():Promise<void>{
    const queued=await this.local.pending();
    const unresolved=queued.filter(c=>c.status==='conflict'||c.status==='rejected');
    if(!unresolved.length||!this.remote.fetchAuthoritativeBootstrap)return;
    const snapshot=await this.remote.fetchAuthoritativeBootstrap();
    const index=new Map(snapshot.records.map(r=>[recordKey(r.entity,r.id),r]));
    // Verify every harmless bystander in a rejected historical bulk snapshot
    // against authenticated PostgreSQL. Preserve the original queued command.
    try{await this.local.recordVerifiedRejectedBulkBystanders(unresolved,snapshot.records);}
    catch(error){this.report({lastError:'BULK_BYSTANDER_PROOF_UNAVAILABLE: '+String(error)});}
    for(const cmd of unresolved){
      try{
      if(!this.started)return;
      // Different program users share a browser's IndexedDB database, but
      // only the original actor may reconcile or resend their own outbox.
      // Older untagged commands remain preserved for manual provenance review.
      if(!mayProcessForCurrentActor(cmd,getCurrentSessionActorId(),
         secureLoginEnabled()))continue;
      const keys=new Set(cmd.changes.map(c=>recordKey(c.entity,c.id)));
      const hasDependents=queued.some(other=>other.id!==cmd.id&&
        other.changes.some(c=>keys.has(recordKey(c.entity,c.id))));
      if(cmd.changes.length>1) {
        const confirmed=planAtomicCommandAlreadyConfirmed(cmd,index,hasDependents);
        if(confirmed){
          const settled=await this.local.reconcileAlreadyConfirmed(
            cmd.id,confirmed,'ATOMIC_SERVER_STATE_VERIFIED');
          if(settled)this.emitApplied(confirmed.map(r=>({
            entity:r.entity,id:r.id,version:r.version,value:r.value
          })));
        }
        continue;
      }
      const change=cmd.changes[0];
      if(!change)continue;
      const key=recordKey(change.entity,change.id);
      // A *new, explicitly auto-coded* catalog record may have been refused
      // because an older running backend did not allocate a concurrent serial.
      // Once authenticated PostgreSQL proves that this exact record ID does
      // not exist, retry the ORIGINAL immutable command ID and payload once.
      // Only the server can choose the approved free code; no local renumber,
      // command duplication, deletion, journal changes, or owner bypass.
      const autoCodeRejected=isSafeAutoCodeRetryCandidate(
        cmd,index.has(key),hasDependents
      );
      if(autoCodeRejected){
        await this.local.markError(cmd.id,'pending','',0);
        this.requested=true;
        continue;
      }
      const record=index.get(key);
      const related=hasDependents;
      const plan=planConflictResolution(cmd,record||null,related);
      if(plan.kind==='already-confirmed'){
        const resolved=await this.local.reconcileAlreadyConfirmed(cmd.id,
          [plan.authoritative],plan.reason);
        if(resolved)this.emitApplied([{entity:plan.authoritative.entity,
          id:plan.authoritative.id,version:plan.authoritative.version,
          value:plan.authoritative.value}]);
      }else if(plan.kind==='rebase' && cmd.status==='conflict'){
        await this.local.rebaseContactChange(cmd.id,plan.authoritative,plan.merged);
      }
      }catch(error){
        // Only this old conflict needs extra review. Never stop unrelated sync.
        this.report({lastError:'ISOLATED_CONFLICT_REVIEW_FAILED: '+cmd.id+': '+String(error)});
        continue;
      }
    }
  }

  private async pushPending() {
    const commands = await this.local.pending();

    const blocked = new Set<string>();
    for (const cmd of commands) {
      if (!this.started || !this.online()) return;
      const keys = cmd.changes.map(c => `${c.entity}\u001f${c.id}`);
      if(!mayProcessForCurrentActor(cmd,getCurrentSessionActorId(),
         secureLoginEnabled())){
        // Never send user A's cached operation under user B's bearer token.
        // Keep it on disk unchanged until the original user signs in.
        const proven=await this.local.confirmedBystanderKeys(cmd);
        keys.filter(k=>!proven.has(k)).forEach(k=>blocked.add(k));
        this.report({lastError:'OUTBOX_WAITING_FOR_ORIGINAL_USER_SESSION'});
        continue;
      }
      if (cmd.status !== 'pending') {
        if (cmd.error?.startsWith('Superseded by')) continue;
        const proven=await this.local.confirmedBystanderKeys(cmd);
        keys.filter(k=>!proven.has(k)).forEach(k=>blocked.add(k));
        this.report({ lastError: `Review required: ${cmd.status}: ${cmd.id}` });
        continue;
      }
      if (keys.some(k => blocked.has(k))) continue;
      const refreshedSession=secureLoginEnabled() &&
        cmd.error?.includes('SESSION_LOGIN_REQUIRED') &&
        !!getCurrentSessionToken();
      if (cmd.retryAt > Date.now() && !refreshedSession) {
        keys.forEach(k => blocked.add(k));
        continue;
      }

      try {
        const receipt = await this.remote.push(cmd);

        // ACK means a confirmed cloud transaction.
        await this.local.ack(
          receipt.commandId,
          receipt.changes
        );
        this.emitApplied(receipt.changes);
      } catch (error) {
        if (error instanceof VersionConflict) {
          await this.local.markError(
            cmd.id,
            'conflict',
            error.message
          );

          this.report({ lastError: error.message });
          // Re-read the authoritative snapshot in a fresh pass, then either
          // auto-confirm/rebase safely or retain the conflict for review.
          this.requested=true;
          keys.forEach(k => blocked.add(k));
          continue;
        }

        if (
          error instanceof PermanentSyncError ||
          isPermanentBackendError(error)
        ) {
          await this.local.markError(
            cmd.id,
            'rejected',
            String(error)
          );

          this.report({ lastError: String(error) });
          keys.forEach(k => blocked.add(k));
          continue;
        }

        const delay = Math.min(
          300000,
          1000 * Math.pow(
            2,
            Math.min(cmd.attempts, 8)
          )
        );

        await this.local.markError(
          cmd.id,
          'pending',
          String(error),
          Date.now() +
            delay +
            Math.floor(Math.random() * 500)
        );

        this.report({ lastError: String(error) });
        // Only this failed record is delayed. Other records are independent.
        keys.forEach(k=>blocked.add(k));
        continue;
      }
    }
  }

  private async pullAllPages() {
    let cursor = await this.local.cursor();

    while (this.started && this.online()) {
      const page = await this.remote.pull(
        cursor,
        100
      );

      if (page.length === 0) break;

      for (const event of page) {
        // Local data and cursor advance atomically.
        await this.local.applyEvent(event);
        this.emitApplied(event.changes);
        cursor = event.cursor;
      }

      if (page.length < 100) break;
    }
  }

  async syncNow(timeoutMs = 30000): Promise<SyncState> {
    if (!this.started) throw new Error('Synchronizer is not running');
    if (!this.cloudAllowed()) throw new Error('Reconciliation required before cloud synchronization');
    if (!this.online()) throw new Error('Offline: records are retained in IndexedDB until PostgreSQL sync resumes');
    // A follower tab is not allowed to report the leader's unknown cloud state as its own success.
    if (!this.state.isLeader) {
      this.coordChannel?.postMessage('REQUEST_SYNC');
      throw new Error('Another tab is the active sync leader; check the authoritative status there');
    }
    const startedAt = Date.now();
    this.requestSync();
    await sleep(0);
    while (this.busy || this.requested) {
      if (!this.started || Date.now() - startedAt > timeoutMs) {
        throw new Error('SYNC_TIMEOUT: no cloud confirmation was received');
      }
      await sleep(35);
    }
    await this.refreshCounts();
    const result = { ...this.state };
    if (result.pending || result.conflict || result.lastError ||
        !result.lastSuccessAt || result.lastSuccessAt < startedAt) {
      throw new Error(`SYNC_INCOMPLETE: pending=${result.pending} conflicts=${result.conflict} error=${result.lastError || 'none'}`);
    }
    return result;
  }

  async waitUntilIdle(
    timeoutMs = 10000
  ): Promise<void> {
    // A call immediately after start() used to report idle while drain()
    // had merely been scheduled, and could miss changes from another device.
    // Explicitly request a catch-up pass before observing quiescence.
    if (this.started && this.state.isLeader) this.requestSync();
    const start = Date.now();
    while (this.busy || this.requested) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Sync timeout');
      }
      await sleep(25);
    }
    // Let queued acknowledgement and onApplied callbacks settle.
    await sleep(0);
    if (this.busy || this.requested) {
      if (Date.now() - start > timeoutMs) throw new Error('Sync timeout');
      return this.waitUntilIdle(timeoutMs - (Date.now() - start));
    }
  }
}

function isPermanentBackendError(
  error: unknown
): boolean {
  const code = String(
    (error as any)?.code ?? ''
  );

  return (
    code === 'permission-denied' ||
    code === 'invalid-argument' ||
    code === 'failed-precondition'
  );
}
