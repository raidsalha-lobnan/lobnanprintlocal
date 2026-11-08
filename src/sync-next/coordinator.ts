import { LocalSyncDb } from './localDb';
import {getCurrentSessionToken,secureLoginEnabled} from '../services/secureAuth';

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

  watchLatest(
    onChanged: () => void,
    onError: (error: unknown) => void
  ): () => void;
}

export interface SyncState {
  running: boolean;
  pending: number;
  conflict: number;
  lastSuccessAt: number | null;
  lastError: string | null;
  isLeader: boolean;
}

export class SyncCoordinator {
  private started = false;
  private busy = false;
  private requested = false;

  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  private listeners =
    new Set<(state: SyncState) => void>();
  private appliedListeners = new Set<(changes: AppliedChange[]) => void>();

  private state: SyncState = {
    running: false,
    pending: 0,
    conflict: 0,
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

  private onlineHandler = () => this.requestSync();

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
    this.state = { ...this.state, ...partial };

    for (const fn of this.listeners) {
      fn({ ...this.state });
    }
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

  requestSync() {
    if (!this.started || !this.cloudAllowed()) return;

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
    if (this.busy || !this.online() || !this.cloudAllowed()) return;

    this.busy = true;
    this.report({ running: true });

    try {
      while (
        this.requested &&
        this.started &&
        this.online() && this.cloudAllowed()
      ) {
        this.requested = false;

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

    this.report({
      pending: commands.length,
      conflict: commands.filter(
        c => c.status !== 'pending'
      ).length
    });
  }

  private async pushPending() {
    const commands = await this.local.pending();

    const blocked = new Set<string>();
    for (const cmd of commands) {
      if (!this.started || !this.online()) return;
      const keys = cmd.changes.map(c => `${c.entity}\u001f${c.id}`);
      if (cmd.status !== 'pending') {
        if (cmd.error?.startsWith('Superseded by')) continue;
        keys.forEach(k => blocked.add(k));
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
          keys.forEach(k => blocked.add(k));
          continue;
        }

        if (
          error instanceof PermanentSyncError ||
          isPermanentFirebaseError(error)
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
        return;
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

function isPermanentFirebaseError(
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
