import {
  collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, startAfter, Timestamp, type Firestore
} from 'firebase/firestore';
import {
  AppliedChange, CommitReceipt, recordKey, ServerCursor,
  ServerEvent, SyncCommand, VersionConflict
} from './types';
import {
  planInvoiceNumbers
} from './invoiceNumberGuard';

/**
 * NEW namespace, intentionally separate from legacy collections; never mirror legacy writes in parallel.
 * This client-side transaction transport REQUIRES compatible Firestore rules and a migration gate.
 * One atomic operation = N entity writes + 1 immutable event write; no extra per-screen delta writes.
 */
export class FirestoreSyncTransport {
  constructor(private db: Firestore, private workspaceId: string) {
    if (!workspaceId || workspaceId.includes('/')) throw new Error('Invalid workspaceId');
  }
  private records() { return collection(this.db, 'lobnan_sync_workspaces', this.workspaceId, 'records'); }
  private events() { return collection(this.db, 'lobnan_sync_workspaces', this.workspaceId, 'events'); }
  private recId(entity: string,id: string): string { return encodeURIComponent(recordKey(entity as any, id)); }

  private counters() { return collection(this.db, 'lobnan_sync_workspaces', this.workspaceId, 'counters'); }
  private sequenceRef() { return doc(this.db, 'lobnan_sync_workspaces', this.workspaceId, 'meta', 'sequence'); }

  async push(command: SyncCommand): Promise<CommitReceipt> {
    if (command.workspaceId !== this.workspaceId) throw new Error('Wrong workspace');
    if (command.changes.length === 0 || command.changes.length > 80) throw new Error('Invalid transaction size');
    const encoded = new TextEncoder().encode(JSON.stringify({workspace:command.workspaceId,changes:command.changes}));
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
    const eventRef = doc(this.events(),command.id);
    const recRefs = command.changes.map(c=>doc(this.records(),this.recId(c.entity,c.id)));

    // Detect which central numbering counters need to be read/allocated (invoices handled by planInvoiceNumbers)
    const neededCounters = new Set<string>();
    for (const c of command.changes) {
      if (!c.value || typeof c.value !== 'object') continue;
      const v = c.value as Record<string, any>;
      const dateStr = String(v.date || v.createdAt || new Date().toISOString());
      const year = dateStr.slice(0, 4) || '2026';

      if (c.entity === 'vouchers' && (typeof v.voucherNumber !== 'string' || v.voucherNumber.startsWith('TEMP-') || !v.voucherNumber)) {
        const prefix = v.type === 'payment' ? 'PV' : 'RC';
        neededCounters.add(`vouchers_${prefix}_${year}`);
      } else if (c.entity === 'purchases' && (typeof v.invoiceNumber !== 'string' || v.invoiceNumber.startsWith('TEMP-') || !v.invoiceNumber)) {
        neededCounters.add(`purchases_${year}`);
      } else if (c.entity === 'parties' && (typeof v.code !== 'string' || v.code.startsWith('TEMP-') || !v.code)) {
        const prefix = v.type === 'supplier' ? 'SUPP' : 'CUST';
        neededCounters.add(`parties_${prefix}`);
      } else if (c.entity === 'journalEntries' && (typeof v.entryNumber !== 'string' || v.entryNumber.startsWith('TEMP-') || !v.entryNumber)) {
        neededCounters.add(`journal_${year}`);
      }
    }

    return runTransaction(this.db, async tx => {
      // 1. Every read MUST precede any write; callback may be retried by Firestore on conflict.
      const already = await tx.get(eventRef);
      if (already.exists()) {
        const existing = already.data();
        if (existing.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_ID_REUSED_WITH_DIFFERENT_PAYLOAD');
        return {commandId:command.id,changes:existing.changes as AppliedChange[]};
      }

      // Read all records being modified
      const existing = await Promise.all(recRefs.map(ref=>tx.get(ref)));
      // Global transactional commit counter avoids timestamp-pagination gaps.
      // This extra document write is intentional for accounting correctness.
      const sequenceRef = this.sequenceRef();
      const sequenceSnap = await tx.get(sequenceRef);
      const nextSequence = Number(sequenceSnap.exists() ? sequenceSnap.data()?.value ?? 0 : 0) + 1;
      if (!Number.isSafeInteger(nextSequence) || nextSequence < 1) {
        throw new Error('Invalid authoritative event sequence');
      }

      // Read all needed counter documents
      const counterKeys = Array.from(neededCounters);
      const counterSnaps = await Promise.all(counterKeys.map(k => tx.get(doc(this.counters(), k))));
      const counterState = new Map<string, number>();
      for (let i = 0; i < counterKeys.length; i++) {
        const snap = counterSnaps[i];
        counterState.set(counterKeys[i], snap.exists() ? Number(snap.data()?.seq ?? 0) : 0);
      }

      // Plan official invoice numbers centrally and atomically (all transaction reads executed inside)
      const invoicePlan = await planInvoiceNumbers(
        this.db,
        tx,
        this.workspaceId,
        command.changes
      );

      // 2. Validate versions and allocate central atomic sequences
      const applied: AppliedChange[] = [];
      const updatedCounters = new Map<string, number>();

      for (let i = 0; i < command.changes.length; i++) {
        const proposed = command.changes[i];
        const actual = existing[i].exists() ? Number(existing[i].data()?.version ?? 0) : 0;
        if (actual !== proposed.expectedVersion) {
          throw new VersionConflict(proposed.entity, proposed.id, proposed.expectedVersion, actual);
        }

        let assignedValue = proposed.value;
        if (assignedValue && typeof assignedValue === 'object') {
          const v = { ...assignedValue } as Record<string, any>;
          const dateStr = String(v.date || v.createdAt || new Date().toISOString());
          const year = dateStr.slice(0, 4) || '2026';

          if (proposed.entity === 'invoices') {
            if (proposed.expectedVersion === 0) {
              const assigned = invoicePlan.numbers.get(
                proposed.id
              );

              if (!assigned) {
                throw new Error('INVOICE_NUMBER_NOT_ALLOCATED');
              }

              v.tempInvoiceNumber =
                v.invoiceNumber || `TEMP-${proposed.id}`;

              v.invoiceNumber = assigned;
              v.isOfficial = true;

            } else {
              const originalNumber =
                existing[i].data()?.value?.invoiceNumber;

              if (
                originalNumber &&
                v.invoiceNumber !== originalNumber
              ) {
                throw new Error(
                  'OFFICIAL_INVOICE_NUMBER_IS_IMMUTABLE'
                );
              }
            }
          } else if (proposed.entity === 'vouchers' && (typeof v.voucherNumber !== 'string' || v.voucherNumber.startsWith('TEMP-') || !v.voucherNumber)) {
            const prefix = v.type === 'payment' ? 'PV' : 'RC';
            const key = `vouchers_${prefix}_${year}`;
            const seq = (counterState.get(key) ?? 0) + 1;
            counterState.set(key, seq);
            updatedCounters.set(key, seq);
            v.tempVoucherNumber = v.voucherNumber || `TEMP-${proposed.id}`;
            v.voucherNumber = `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
            v.isOfficial = true;
            v.officialAllocatedAt = Date.now();
          } else if (proposed.entity === 'purchases' && (typeof v.invoiceNumber !== 'string' || v.invoiceNumber.startsWith('TEMP-') || !v.invoiceNumber)) {
            const key = `purchases_${year}`;
            const seq = (counterState.get(key) ?? 0) + 1;
            counterState.set(key, seq);
            updatedCounters.set(key, seq);
            v.tempInvoiceNumber = v.invoiceNumber || `TEMP-${proposed.id}`;
            v.invoiceNumber = `PUR-${year}-${String(seq).padStart(5, '0')}`;
            v.isOfficial = true;
            v.officialAllocatedAt = Date.now();
          } else if (proposed.entity === 'parties' && (typeof v.code !== 'string' || v.code.startsWith('TEMP-') || !v.code)) {
            const prefix = v.type === 'supplier' ? 'SUPP' : 'CUST';
            const key = `parties_${prefix}`;
            const seq = (counterState.get(key) ?? 0) + 1;
            counterState.set(key, seq);
            updatedCounters.set(key, seq);
            v.tempCode = v.code || `TEMP-${proposed.id}`;
            v.code = `${prefix}-${String(seq).padStart(4, '0')}`;
            v.isOfficial = true;
          } else if (proposed.entity === 'journalEntries' && (typeof v.entryNumber !== 'string' || v.entryNumber.startsWith('TEMP-') || !v.entryNumber)) {
            const key = `journal_${year}`;
            const seq = (counterState.get(key) ?? 0) + 1;
            counterState.set(key, seq);
            updatedCounters.set(key, seq);
            v.tempEntryNumber = v.entryNumber || `TEMP-${proposed.id}`;
            v.entryNumber = `JE-${year}-${String(seq).padStart(5, '0')}`;
            v.isOfficial = true;
          }

          assignedValue = v;
        }

        applied.push({
          entity: proposed.entity,
          id: proposed.id,
          value: assignedValue,
          version: actual + 1
        });
      }

      // 3. Perform Writes (Invoice Claims & Counter, Sequence, Other Counters, Records, Event)
      invoicePlan.write();
      tx.set(sequenceRef, { value: nextSequence, updatedAt: serverTimestamp() });
      for (const [key, seq] of updatedCounters.entries()) {
        tx.set(doc(this.counters(), key), { seq, updatedAt: serverTimestamp() }, { merge: true });
      }

      for (let i = 0; i < applied.length; i++) {
        const r = applied[i];
        tx.set(recRefs[i], {
          entity: r.entity,
          id: r.id,
          version: r.version,
          value: r.value,
          deleted: r.value === null,
          updatedAt: serverTimestamp()
        });
      }

      // Immutable event also serves as idempotency receipt; replay of same command consumes no writes.
      tx.set(eventRef, { commandId: command.id, fingerprint, changes: applied,
        sequence: nextSequence, committedAt: serverTimestamp() });
      return { commandId: command.id, changes: applied };
    }, { maxAttempts: 5 });
  }

  async pull(cursor: ServerCursor|null, pageSize=100): Promise<ServerEvent[]> {
    const bounded = Math.min(100, Math.max(1, Math.trunc(pageSize)));
    // Once the first sequenced event is applied, queries become gap-free.
    // For existing databases a legacy migration/backfill is still required.
    const hasSequence = cursor?.sequence != null;
    const clauses = hasSequence
      ? [orderBy('sequence', 'asc'), startAfter(cursor!.sequence), limit(bounded)]
      : cursor
        ? [orderBy('committedAt','asc'), orderBy(documentId(),'asc'),
            startAfter(new Timestamp(cursor.seconds,cursor.nanoseconds),cursor.eventId), limit(bounded)]
        : [orderBy('committedAt','asc'), orderBy(documentId(),'asc'),limit(bounded)];
    const snapshot = await getDocsFromServer(query(this.events(),...clauses));
    return snapshot.docs.map(s => {
      const data = s.data();
      const at = data.committedAt as Timestamp | undefined;
      if (!at || typeof at.seconds !== 'number') throw new Error('Invalid server event timestamp');
      const sequence = Number(data.sequence);
      return {
        commandId: String(data.commandId),
        changes: data.changes as AppliedChange[],
        cursor: {
          seconds: at.seconds, nanoseconds: at.nanoseconds, eventId: s.id,
          ...(Number.isSafeInteger(sequence) && sequence > 0 ? { sequence } : {})
        }
      };
    });
  }

  /** A SINGLE lightweight change signal per active application instance; never limit the catch-up to 100. */
  watchLatest(onChanged:()=>void,onError:(e:unknown)=>void):()=>void {
    const q=query(this.events(),orderBy('committedAt','desc'),limit(1));
    return onSnapshot(q, snapshot=>{
      if (!snapshot.metadata.fromCache) onChanged();
    },onError);
  }

  /** Initial download for a NEW and EMPTY device only.
   * Read sequence high-water BEFORE records: replay all events committed later.
   * Return full document metadata so optimistic concurrency starts from the
   * actual server version, rather than an invented local version 1.
   */
  async fetchAuthoritativeBootstrap(): Promise<{
    records: import('./types').StoredRecord[];
    cursor: ServerCursor;
  }> {
    const checkpoint = await getDocFromServer(this.sequenceRef());
    const highWater = Number(checkpoint.exists() ? checkpoint.data()?.value : 0);
    if (!Number.isSafeInteger(highWater) || highWater < 0) {
      throw new Error('INVALID_AUTHORITATIVE_SEQUENCE');
    }
    const snap = await getDocsFromServer(this.records());
    // Old deployments without a sequence checkpoint must be migrated first.
    // Creating a cursor at zero over historical unsequenced events is unsafe.
    if (!checkpoint.exists() && !snap.empty) {
      throw new Error('LEGACY_WORKSPACE_REQUIRES_RECONCILIATION');
    }
    const records: import('./types').StoredRecord[] = [];
    for (const result of snap.docs) {
      const item = result.data();
      const entity = String(item.entity || '') as import('./types').EntityName;
      const id = String(item.id || item.value?.id || '');
      const version = Number(item.version);
      if (!entity || !id || !Number.isSafeInteger(version) || version < 1 ||
          !item.value && item.deleted !== true) {
        throw new Error(`UNTRUSTED_CLOUD_RECORD: ${result.id}`);
      }
      const key = recordKey(entity, id);
      if (result.id !== encodeURIComponent(key)) {
        throw new Error(`CLOUD_RECORD_ID_MISMATCH: ${result.id}`);
      }
      records.push({
        key, entity, id, version,
        value: item.deleted === true ? null : item.value
      });
    }
    // Sequence cursor is a replay checkpoint; timestamps are not used for ordering here.
    return {
      records,
      cursor: { seconds: 0, nanoseconds: 0, eventId: '', sequence: highWater }
    };
  }

  /**
   * Fetches the authoritative live records directly from the Firestore sync workspace.
   * This is the single source of truth for the entire database in the cloud.
   */
  async fetchCloudSnapshot(): Promise<Record<string, any[]>> {
    try {
      const snap = await getDocsFromServer(this.records());
      const grouped: Record<string, any[]> = {};
      for (const d of snap.docs) {
        const data = d.data();
        if (data.deleted || !data.value) continue;
        const ent = data.entity;
        if (!grouped[ent]) grouped[ent] = [];
        grouped[ent].push(data.value);
      }
      return grouped;
    } catch (e: any) {
      console.warn('Error fetching cloud snapshot from records:', e);
      throw new Error(`تعذرت قراءة السجلات السحابية: ${e?.message || e}`);
    }
  }
}

/**
 * Global helper to read the authoritative cloud records collection directly
 */
export async function fetchAuthoritativeCloudRecords(
  db: Firestore,
  workspaceId: string = 'lobnan_main'
): Promise<Record<string, any[]>> {
  try {
    const recordsCol = collection(db, 'lobnan_sync_workspaces', workspaceId, 'records');
    const snap = await getDocsFromServer(recordsCol);
    const grouped: Record<string, any[]> = {};
    for (const d of snap.docs) {
      const data = d.data();
      if (data.deleted || !data.value) continue;
      const ent = data.entity;
      if (!grouped[ent]) grouped[ent] = [];
      grouped[ent].push(data.value);
    }
    return grouped;
  } catch (e: any) {
    console.warn('Error fetching authoritative cloud records:', e);
    throw new Error(`تعذر قراءة السجلات السحابية المعتمدة: ${e?.message || e}`);
  }
}

