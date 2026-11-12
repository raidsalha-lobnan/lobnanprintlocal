import {
  AppliedChange, EntityName, JsonObject, LocalView,
  ProposedChange, VersionedChange, recordKey, ServerCursor,
  ServerEvent, StoredRecord, SyncCommand,
  toJsonObject, validateChanges
} from './types';
import {composeLocalSettingsDraft,type SettingsFieldPatch,type VerifiedSettingsReceipt} from './settingsPatch';
import {getCurrentSessionActorId,secureLoginEnabled} from '../services/secureAuth';

const DB_VERSION = 2;
const RECORDS = 'records';
const OUTBOX = 'outbox';
const META = 'meta';
const RECEIPTS = 'receipts';
const CURSOR_KEY = 'serverCursor';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () =>
      reject(tx.error ?? new Error('Transaction failed'));
  });
}

export class LocalSyncDb {
  private dbPromise: Promise<IDBDatabase>;
  private disposed = false;
  private readonly databaseName: string;
  private listeners = new Set<(recordsChanged: boolean) => void>();
  private channel: BroadcastChannel | null = null;

  constructor(private workspaceId: string, namespace = 'lobnan-offline-v1') {
    if (!workspaceId || /[/\u001f]/.test(workspaceId)) {
      throw new Error('Invalid workspace ID');
    }

    this.databaseName = `${namespace}-${workspaceId}`;
    this.dbPromise = this.openDatabase();

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`lobnan-sync-${workspaceId}`);
      this.channel.onmessage = event => {
        // Outbox retry metadata is not a change to any accounting record.
        const recordsChanged = event.data?.recordsChanged !== false;
        for (const fn of this.listeners) fn(recordsChanged);
      };
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(
        this.databaseName,
        DB_VERSION
      );

      r.onupgradeneeded = () => {
        const db = r.result;
        const tx = r.transaction!;

        const records = db.objectStoreNames.contains(RECORDS)
          ? tx.objectStore(RECORDS)
          : db.createObjectStore(RECORDS, {
              keyPath: 'key'
            });

        if (!records.indexNames.contains('byEntity')) {
          records.createIndex('byEntity', 'entity');
        }

        if (!db.objectStoreNames.contains(OUTBOX)) {
          db.createObjectStore(OUTBOX, {
            keyPath: 'id'
          });
        }

        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, {
            keyPath: 'key'
          });
        }

        if (!db.objectStoreNames.contains(RECEIPTS)) {
          db.createObjectStore(RECEIPTS, {
            keyPath: 'id'
          });
        }
      };

      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          if (!this.disposed) this.dbPromise = this.openDatabase();
        };
        resolve(r.result);
      };

      r.onerror = () => reject(r.error);
      r.onblocked = () =>
        console.warn('IndexedDB upgrade is blocked');
    });
  }

  // Probe only an empty readonly transaction. If this cached connection
  // closed because of browser lifecycle or a database upgrade, reopen it.
  // Never automatically replay any partially executed financial write.
  private async getDb(): Promise<IDBDatabase> {
    if (this.disposed) throw new Error('LOCAL_STORAGE_SESSION_CLOSED');
    const db = await this.dbPromise;
    try {
      const probe = db.transaction(META, 'readonly');
      probe.abort();
      return db;
    } catch (error) {
      if (!(error instanceof DOMException) ||
          !['InvalidStateError', 'TransactionInactiveError'].includes(error.name)) throw error;
      db.close();
      this.dbPromise = this.openDatabase();
      return this.dbPromise;
    }
  }

  private changed(recordsChanged = true) {
    for (const fn of this.listeners) fn(recordsChanged);
    this.channel?.postMessage({ recordsChanged });
  }

  subscribe(fn: (recordsChanged: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async close(): Promise<void> {
    this.channel?.close();
    this.disposed = true;
    (await this.dbPromise).close();
  }

  async enqueue(
    changes: ProposedChange[],
    commandId: string = crypto.randomUUID(),
    atomicInvoiceId?: string
  ): Promise<SyncCommand> {
    validateChanges(changes);

    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(commandId)) {
      throw new Error('Invalid command ID');
    }

    const safeChanges = changes.map(c => ({
      ...c,
      value: c.value === null
        ? null
        : toJsonObject(c.value)
    }));

    const db = await this.getDb();
    const tx = db.transaction(
      [RECORDS, OUTBOX, RECEIPTS],
      'readwrite'
    );
    const done = completed(tx);

    try {
      const receipt = await request(
        tx.objectStore(RECEIPTS).get(commandId)
      ) as any;

      if (receipt) {
        if (
          JSON.stringify(receipt.requestChanges) !==
          JSON.stringify(safeChanges)
        ) {
          throw new Error('Command ID reused');
        }

        await done;

        return {
          id: commandId,
          workspaceId: this.workspaceId,
          changes: [],
          createdAt: 0,
          attempts: 0,
          retryAt: 0,
          status: 'pending'
        };
      }

      // IndexedDB point lookups: do not read the entire accounting database for every save.
      const outbox = await request(
        tx.objectStore(OUTBOX).getAll()
      ) as SyncCommand[];

      const queued = [...outbox].sort(
        (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
      );
      const earlier = queued.find(c => c.id === commandId);
      if (earlier) {
        const prior = earlier.changes.map(({ expectedVersion, ...rest }) => rest);
        if (JSON.stringify(prior) !== JSON.stringify(safeChanges)) {
          throw new Error('Command payload mismatch');
        }
        await done;
        return earlier;
      }

      const versions = new Map<string, number>();
      const bases = new Map<string, StoredRecord | null>();
      for (const c of safeChanges) {
        const key = recordKey(c.entity, c.id);
        const row = await request(tx.objectStore(RECORDS).get(key)) as StoredRecord | undefined;
        const matching = queued.filter(
          op => op.changes.some(change => recordKey(change.entity, change.id) === key)
        );
        // A newer edit must NEVER bury an unresolved edit of this record.
        // Independent records can continue syncing normally.
        if (matching.some(op => op.status !== 'pending')) {
          throw new Error(`RECORD_HAS_UNRESOLVED_CONFLICT: ${key}`);
        }
        const pendingForRecord = matching.filter(op => op.status === 'pending');
        // Repeated identical updates while still pending should not generate extra cloud writes.
        const mostRecent = pendingForRecord[pendingForRecord.length - 1];
        if (mostRecent && safeChanges.length === 1 && mostRecent.changes.length === 1 &&
            JSON.stringify(mostRecent.changes[0].value) === JSON.stringify(c.value)) {
          await done;
          return mostRecent;
        }
        versions.set(key, (row?.version ?? 0) + pendingForRecord.length);
        // Never invent a server baseline when another local write is queued.
        bases.set(key,pendingForRecord.length===0 ? (row??null) : null);
      }
      const versioned = safeChanges.map(c => ({
        ...c,
        expectedVersion: versions.get(recordKey(c.entity, c.id)) ?? 0
      }));

      const cmd: SyncCommand = {
        id: commandId,
        workspaceId: this.workspaceId,
        ...(secureLoginEnabled()&&getCurrentSessionActorId()
          ? {actorId:getCurrentSessionActorId()} : {}),
        ...(atomicInvoiceId ? { atomicInvoiceId } : {}),
        changes: versioned,
        baseRecords: safeChanges.map(change=>bases.get(recordKey(change.entity,change.id))??null),
        createdAt: Date.now(),
        attempts: 0,
        retryAt: 0,
        status: 'pending'
      };

      tx.objectStore(OUTBOX).add(cmd);

      await done;
      this.changed();
      return cmd;
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
  }

  async pending(): Promise<SyncCommand[]> {
    const db = await this.getDb();
    const tx = db.transaction(OUTBOX, 'readonly');

    const data = await request(
      tx.objectStore(OUTBOX).getAll()
    ) as SyncCommand[];

    return data.sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id)
    );
  }

  async cursor(): Promise<ServerCursor | null> {
    const db = await this.getDb();
    const tx = db.transaction(META, 'readonly');

    const row = await request(
      tx.objectStore(META).get(CURSOR_KEY)
    ) as { value: ServerCursor } | undefined;

    return row?.value ?? null;
  }

  async applyEvent(event: ServerEvent): Promise<void> {
    const db = await this.getDb();

    const tx = db.transaction(
      [RECORDS, OUTBOX, META, RECEIPTS],
      'readwrite'
    );
    const done = completed(tx);

    try {
      const records = tx.objectStore(RECORDS);

      for (const c of event.changes) {
        const key = recordKey(c.entity, c.id);

        const previous = await request(
          records.get(key)
        ) as StoredRecord | undefined;

        if (!previous || previous.version < c.version) {
          records.put({
            key,
            entity: c.entity,
            id: c.id,
            version: c.version,
            value: c.value
          });
        }
      }

      const owned = await request(
        tx.objectStore(OUTBOX).get(event.commandId)
      ) as SyncCommand | undefined;

      tx.objectStore(OUTBOX).delete(event.commandId);

      if (owned) {
        const requestChanges = owned.changes.map(
          ({ expectedVersion, ...rest }) => rest
        );

        tx.objectStore(RECEIPTS).put({
          id: event.commandId,
          requestChanges,
          changes: event.changes
        });
      }

      const meta = tx.objectStore(META);

      const last = await request(
        meta.get(CURSOR_KEY)
      ) as { value: ServerCursor } | undefined;

      if (
        !last ||
        compareCursor(last.value, event.cursor) < 0
      ) {
        meta.put({
          key: CURSOR_KEY,
          value: event.cursor
        });
      }

      await done;
      this.changed();
    } catch (e) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw e;
    }
  }

  async ack(
    commandId: string,
    changes: AppliedChange[]
  ): Promise<void> {
    const db = await this.getDb();

    const tx = db.transaction(
      [RECORDS, OUTBOX, RECEIPTS],
      'readwrite'
    );
    const done = completed(tx);

    try {
      const records = tx.objectStore(RECORDS);

      for (const c of changes) {
        const key = recordKey(c.entity, c.id);

        const previous = await request(
          records.get(key)
        ) as StoredRecord | undefined;

        if (!previous || previous.version < c.version) {
          records.put({
            key,
            entity: c.entity,
            id: c.id,
            version: c.version,
            value: c.value
          });
        }
      }

      const cmd = await request(
        tx.objectStore(OUTBOX).get(commandId)
      ) as SyncCommand | undefined;

      tx.objectStore(OUTBOX).delete(commandId);

      if (cmd) {
        tx.objectStore(RECEIPTS).put({
          id: commandId,
          requestChanges: cmd.changes.map(
            ({ expectedVersion, ...rest }) => rest
          ),
          changes
        });
      }

      await done;
      this.changed();
    } catch (e) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw e;
    }
  }

  /** Install the authenticated PostgreSQL workspace settings snapshot without
   * touching any pending operations. Needed when the event cursor already
   * advanced although the browser did not store the push acknowledgement.
   */
  async installAuthoritativeSettingsRows(rows:StoredRecord[]):Promise<void>{
    const valid=rows.filter(r=>r.entity==='settings'&&
      ['global','workspace-settings'].includes(r.id)&&
      r.value!==null&&Number.isSafeInteger(r.version)&&r.version>0);
    if(!valid.length)return;
    const db=await this.dbPromise;
    const tx=db.transaction(RECORDS,'readwrite');
    const done=completed(tx);
    try{
      const records=tx.objectStore(RECORDS);
      let updated=false;
      for(const row of valid){
        const previous=await request(records.get(recordKey(row.entity,row.id))) as StoredRecord|undefined;
        if(!previous||previous.version<row.version){
          records.put(row);
          updated=true;
        }
      }
      await done;
      if(updated)this.changed();
    }catch(error){try{tx.abort()}catch{}await done.catch(()=>{});throw error;}
  }

  /** Local ACK of a previously committed settings command, only after the
   * authenticated server has matched owner + exact fingerprint and returned
   * a receipt. The authoritative row must already be present at that version.
   * All original requests remain in the durable local receipts audit.
   */
  async acknowledgeVerifiedSettingsReceipts(proofs:VerifiedSettingsReceipt[]):Promise<number>{
    if(!proofs.length)return 0;
    const db=await this.dbPromise;
    const tx=db.transaction([OUTBOX,RECEIPTS,RECORDS],'readwrite');
    const done=completed(tx);
    try{
      const outbox=tx.objectStore(OUTBOX);
      const receipts=tx.objectStore(RECEIPTS);
      const records=tx.objectStore(RECORDS);
      let count=0;
      for(const proof of proofs){
        if(proof.changes?.length!==1||proof.changes[0].entity!=='settings'||
          !['global','workspace-settings'].includes(proof.changes[0].id)||
          !Number.isSafeInteger(proof.changes[0].version)||proof.changes[0].version<1)
          continue;
        const command=await request(outbox.get(proof.id)) as SyncCommand|undefined;
        if(!command||command.changes.length!==1||
          command.changes[0].entity!=='settings'||
          command.changes[0].id!==proof.changes[0].id)continue;
        const record=await request(records.get(
          recordKey('settings',proof.changes[0].id))) as StoredRecord|undefined;
        if(!record||record.version<proof.changes[0].version)continue;
        receipts.put({
          id:proof.id,
          resolution:'POSTGRES_RECEIPT_AND_FINGERPRINT_VERIFIED',
          originalCommand:command,
          authoritativeVersions:proof.changes.map(c=>({entity:c.entity,id:c.id,version:c.version})),
          resolvedAt:new Date().toISOString(),
        });
        outbox.delete(proof.id);
        count++;
      }
      await done;
      if(count)this.changed();
      return count;
    }catch(error){
      try{tx.abort()}catch{}
      await done.catch(()=>{});
      throw error;
    }
  }

  /** A cryptographically identified server snapshot proves the requested state
   * was already stored. Preserve a permanent local reconciliation receipt.
   */
  async reconcileAlreadyConfirmed(commandId:string,authoritative:StoredRecord[],reason:string):Promise<boolean> {
    const db=await this.dbPromise;
    const tx=db.transaction([RECORDS,OUTBOX,RECEIPTS],'readwrite');
    const done=completed(tx);
    try {
      const outbox=tx.objectStore(OUTBOX);
      const cmd=await request(outbox.get(commandId)) as SyncCommand|undefined;
      if(!cmd || !['conflict','rejected'].includes(cmd.status)){
        await done;return false;
      }
      const other=await request(outbox.getAll()) as SyncCommand[];
      const affected=new Set(cmd.changes.map(c=>recordKey(c.entity,c.id)));
      if(other.some(op=>op.id!==commandId&&op.changes.some(c=>affected.has(recordKey(c.entity,c.id))))){
        await done;return false;
      }
      if(authoritative.length!==cmd.changes.length || authoritative.some((r,i)=>
        r.key!==recordKey(cmd.changes[i].entity,cmd.changes[i].id) || r.version<1)){
        await done;return false;
      }
      const store=tx.objectStore(RECORDS);
      for(const row of authoritative){
        const previous=await request(store.get(row.key)) as StoredRecord|undefined;
        if(!previous||previous.version<row.version)store.put(row);
      }
      tx.objectStore(RECEIPTS).put({id:commandId,
        resolution:'SERVER_STATE_VERIFIED',reason,originalCommand:cmd,
        authoritativeVersions:authoritative.map(r=>({entity:r.entity,id:r.id,version:r.version})),
        resolvedAt:new Date().toISOString()});
      outbox.delete(commandId);
      await done;
      this.changed();
      return true;
    }catch(error){try{tx.abort()}catch{}await done.catch(()=>{});throw error;}
  }

  /** Replace a conflicting *contact-only* change by a new idempotency key,
   * retaining the original payload in the local audit receipts store.
   * The server will recheck version and authorization before committing.
   */
  async rebaseContactChange(commandId:string,authoritative:StoredRecord,
    value:JsonObject):Promise<boolean>{
    const db=await this.dbPromise;
    const tx=db.transaction([RECORDS,OUTBOX,RECEIPTS],'readwrite');
    const done=completed(tx);
    try{
      const outbox=tx.objectStore(OUTBOX);
      const cmd=await request(outbox.get(commandId)) as SyncCommand|undefined;
      if(!cmd||cmd.status!=='conflict'||cmd.changes.length!==1||
        recordKey(cmd.changes[0].entity,cmd.changes[0].id)!==authoritative.key||
        cmd.changes[0].expectedVersion>=authoritative.version){
        await done;return false;
      }
      const cmds=await request(outbox.getAll()) as SyncCommand[];
      if(cmds.some(op=>op.id!==commandId&&
          op.changes.some(c=>recordKey(c.entity,c.id)===authoritative.key))){
        await done;return false;
      }
      const nextId=crypto.randomUUID();
      const next:SyncCommand={...cmd,id:nextId,
        changes:[{entity:authoritative.entity,id:authoritative.id,
          expectedVersion:authoritative.version,value}],
        baseRecords:[authoritative],attempts:0,retryAt:0,status:'pending',error:undefined};
      const records=tx.objectStore(RECORDS);
      const previous=await request(records.get(authoritative.key)) as StoredRecord|undefined;
      if(!previous||previous.version<authoritative.version)records.put(authoritative);
      tx.objectStore(RECEIPTS).put({id:commandId,
        resolution:'SAFE_CONTACT_REBASE',reason:'DISJOINT_FIELDS',
        originalCommand:cmd,newCommandId:nextId,resolvedAt:new Date().toISOString()});
      outbox.delete(commandId);
      outbox.add(next);
      await done;
      this.changed();
      return true;
    }catch(error){try{tx.abort()}catch{}await done.catch(()=>{});throw error;}
  }

  async markError(
    commandId: string,
    status: SyncCommand['status'],
    error: string,
    retryAt = 0
  ): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(OUTBOX, 'readwrite');
    const done = completed(tx);
    const store = tx.objectStore(OUTBOX);

    const cmd = await request(
      store.get(commandId)
    ) as SyncCommand | undefined;

    const previousStatus = cmd?.status;
    if (cmd) {
      store.put({
        ...cmd,
        status,
        attempts: cmd.attempts + 1,
        error,
        retryAt
      });
    }

    await done;
    // Repeated retry attempts must not re-render every invoice and button.
    // A status transition (pending -> conflict/rejected) still refreshes
    // the visible records and the conflict review UI.
    if (cmd) this.changed(status !== previousStatus);
  }

  async listVisible(
    entity: EntityName
  ): Promise<LocalView[]> {
    const db = await this.getDb();

    const tx = db.transaction(
      [RECORDS, OUTBOX],
      'readonly'
    );

    const records = await request(
      tx.objectStore(RECORDS)
        .index('byEntity')
        .getAll(entity)
    ) as StoredRecord[];

    const pending = await request(
      tx.objectStore(OUTBOX).getAll()
    ) as SyncCommand[];

    const result = new Map<string, LocalView>();

    for (const r of records) {
      result.set(r.id, {
        id: r.id,
        value: r.value,
        version: r.version,
        pending: false
      });
    }

    pending.sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id)
    );

    // The shared PostgreSQL record is authoritative. A rejected/conflicting
    // browser write stays in the auditable outbox, but must not replace the
    // committed record shown on screen. The same applies to a pending write
    // based on an older server version (e.g. INV-0071 on a second device).
    const authoritativeVersions = new Map(records.map(r => [r.id, r.version]));
    for (const cmd of pending) {
      if (cmd.status !== 'pending') continue;
      for (const c of cmd.changes) {
        if (c.entity !== entity) continue;
        const serverVersion = authoritativeVersions.get(c.id);
        const fieldPatch=entity==='settings' && c.value?._settingsPatchV1===true;
        if (!fieldPatch && serverVersion !== undefined && c.expectedVersion < serverVersion) {
          continue;
        }
        if (!fieldPatch && serverVersion === undefined && c.expectedVersion !== 0) {
          continue;
        }
        result.set(c.id, {
          id: c.id,
          value: fieldPatch
            ? composeLocalSettingsDraft(result.get(c.id)?.value,c.value as unknown as SettingsFieldPatch)
            : c.value,
          version: fieldPatch ? (serverVersion ?? c.expectedVersion) : c.expectedVersion,
          pending: true
        });
      }
    }

    return [...result.values()].filter(
      row => row.value !== null
    );
  }

  /** One stable IndexedDB read transaction for every accounting screen. */
  async listVisibleGrouped(entities: readonly EntityName[]): Promise<Record<string, LocalView[]>> {
    const db = await this.getDb();
    const tx = db.transaction([RECORDS, OUTBOX], 'readonly');
    const done = completed(tx);
    const [records, outbox] = await Promise.all([
      request(tx.objectStore(RECORDS).getAll()) as Promise<StoredRecord[]>,
      request(tx.objectStore(OUTBOX).getAll()) as Promise<SyncCommand[]>
    ]);
    await done;
    const requested = new Set(entities);
    const indexed = new Map<EntityName, Map<string, LocalView>>();
    for (const entity of requested) indexed.set(entity, new Map<string, LocalView>());
    for (const rec of records) {
      const collection = indexed.get(rec.entity);
      if (!collection) continue;
      collection.set(rec.id, {id: rec.id, value: rec.value, version: rec.version, pending: false});
    }
    const ordered = [...outbox].sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id));
    for (const cmd of ordered) {
      if (cmd.status !== 'pending') continue;
      for (const change of cmd.changes) {
        const collection = indexed.get(change.entity);
        if (!collection) continue;
        const baseline = collection.get(change.id);
        const serverVersion = baseline?.version;
        const settingsPatch = change.entity === 'settings' && change.value?._settingsPatchV1 === true;
        if (!settingsPatch && serverVersion !== undefined && change.expectedVersion < serverVersion) continue;
        if (!settingsPatch && serverVersion === undefined && change.expectedVersion !== 0) continue;
        collection.set(change.id, {
          id: change.id,
          value: settingsPatch
            ? composeLocalSettingsDraft(baseline?.value, change.value as unknown as SettingsFieldPatch)
            : change.value,
          version: settingsPatch ? (serverVersion ?? change.expectedVersion) : change.expectedVersion,
          pending: true
        });
      }
    }
    const result: Record<string, LocalView[]> = {};
    for (const entity of entities) {
      result[entity] = [...(indexed.get(entity)?.values() ?? [])].filter(row => row.value !== null);
    }
    return result;
  }

  /** Whether IndexedDB has already been initialized (including an empty cloud).
   * Never use the invoice list alone as a proxy for database emptiness.
   */
  async bootstrapStatus(): Promise<'empty' | 'initialized' | 'existing-data'> {
    const db = await this.getDb();
    const tx = db.transaction([RECORDS, OUTBOX, META], 'readonly');
    const [flag, recordCount, operationCount] = await Promise.all([
      request(tx.objectStore(META).get('authoritativeBootstrap')),
      request(tx.objectStore(RECORDS).count()),
      request(tx.objectStore(OUTBOX).count())
    ]);
    if (flag) return 'initialized';
    return recordCount > 0 || operationCount > 0 ? 'existing-data' : 'empty';
  }

  /** Import cloud records and the replay cursor atomically.
   * The cursor is sampled BEFORE fetching records, so changes arriving during
   * snapshot download are replayed (and ignored if an older version).
   * Does not create any outbox operations or cloud writes.
   */
  async initializeAuthoritativeSnapshot(
    records: StoredRecord[], cursor: ServerCursor
  ): Promise<boolean> {
    const db = await this.getDb();
    const tx = db.transaction([RECORDS, OUTBOX, META], 'readwrite');
    const done = completed(tx);
    try {
      const meta = tx.objectStore(META);
      const [already, recordCount, pendingCount] = await Promise.all([
        request(meta.get('authoritativeBootstrap')),
        request(tx.objectStore(RECORDS).count()),
        request(tx.objectStore(OUTBOX).count())
      ]);
      if (already || recordCount > 0 || pendingCount > 0) {
        await done;
        return false;
      }
      const store = tx.objectStore(RECORDS);
      const seen = new Set<string>();
      for (const row of records) {
        const key = recordKey(row.entity, row.id);
        if (key !== row.key || seen.has(key) ||
            !Number.isSafeInteger(row.version) || row.version < 1) {
          throw new Error(`Invalid authoritative bootstrap record ${key}`);
        }
        seen.add(key);
        store.put(row);
      }
      meta.put({ key: CURSOR_KEY, value: cursor });
      meta.put({ key: 'authoritativeBootstrap', value: true });
      await done;
      this.changed();
      return true;
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
  }

  /**
   * Refresh an already-initialized device from PostgreSQL on startup.
   * Never discard an outbox command: an unsynced or rejected financial edit
   * remains independently reviewable, but the confirmed server version is
   * the displayed baseline. This also heals a device that missed events while
   * its local cursor appeared current.
   */
  async refreshAuthoritativeSnapshot(
    snapshot: StoredRecord[], serverCursor: ServerCursor
  ): Promise<number> {
    const db = await this.getDb();
    const tx = db.transaction([RECORDS, OUTBOX, META, RECEIPTS], 'readwrite');
    const done = completed(tx);
    try {
      const records = tx.objectStore(RECORDS);
      const receipts = tx.objectStore(RECEIPTS);
      const storedCursor = await request(
        tx.objectStore(META).get(CURSOR_KEY)
      ) as { value: ServerCursor } | undefined;
      const seen = new Set<string>();
      let replaced = 0;
      const divergent: Array<{entity: string; id: string; previous: StoredRecord}> = [];
      for (const row of snapshot) {
        const key = recordKey(row.entity, row.id);
        if (key !== row.key || seen.has(key) ||
            !Number.isSafeInteger(row.version) || row.version < 1) {
          throw new Error('Invalid authoritative snapshot record ' + key);
        }
        seen.add(key);
        const prior = await request(records.get(key)) as StoredRecord | undefined;
        if (!prior || prior.version !== row.version ||
            JSON.stringify(prior.value) !== JSON.stringify(row.value)) {
          if (prior && (prior.version > row.version ||
              (prior.version === row.version &&
               JSON.stringify(prior.value) !== JSON.stringify(row.value)))) {
            divergent.push({entity:row.entity,id:row.id,previous:prior});
          }
          records.put(row);
          replaced++;
        }
      }
      if (divergent.length) {
        receipts.put({
          id: 'server-baseline-reconciliation-' + crypto.randomUUID(),
          resolution: 'AUTHORITATIVE_POSTGRES_SNAPSHOT',
          restoredAt: new Date().toISOString(),
          previousRecords: divergent,
          serverVersions: divergent.map(x => {
            const row = snapshot.find(r => r.entity === x.entity && r.id === x.id);
            return {entity:x.entity,id:x.id,version:row?.version};
          })
        });
      }
      // If this device somehow persisted a cursor ahead of the shared server,
      // reset it to the verified bootstrap cursor; otherwise replay all events
      // since the old cursor to avoid missing changes during this download.
      if (storedCursor && compareCursor(storedCursor.value, serverCursor) > 0) {
        tx.objectStore(META).put({key:CURSOR_KEY,value:serverCursor});
      }
      await done;
      if (replaced) this.changed();
      return replaced;
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
  }

  /**
   * Seeds cloud snapshot records directly into local IndexedDB records store
   * with exact cloud versions and zero pending outbox write commands.
   */
  async seedFromCloud(_cloudSnap: Record<string, any[]>): Promise<number> {
    throw new Error('Obsolete unsafe seed API. Use initializeAuthoritativeSnapshot with exact cloud versions and cursor.');
  }

  async getConflicts(): Promise<SyncCommand[]> {
    const db = await this.getDb();
    const tx = db.transaction(OUTBOX, 'readonly');
    const commands = await request(
      tx.objectStore(OUTBOX).getAll()
    ) as SyncCommand[];
    return commands.filter(c => c.status === 'conflict' || c.status === 'rejected');
  }

  async reconcileTestProbeConflicts(): Promise<void> {
    // The ids that resemble test probes may already have legitimate references.
    // Neither this helper nor a startup effect may silently dismiss them.
    throw new Error('Probe conflicts must be inspected against cloud and local snapshots before archival.');
  }

  async retryCommand(commandId: string): Promise<void> {
    const cmd = (await this.pending()).find(item => item.id === commandId);
    if (!cmd) throw new Error('Unknown local command');
    if (cmd.status !== 'pending') {
      throw new Error('Conflict cannot be retried automatically. Compare the official cloud record and the local change before resolving it.');
    }
    await this.markError(commandId, 'pending', '', 0);
  }

  async discardCommand(commandId: string): Promise<void> {
    const command = (await this.pending()).find(c => c.id === commandId);
    if (!command) return;

    const protectedEntities = new Set<EntityName>([
      'invoices', 'vouchers', 'purchases', 'journalEntries', 'expenses',
      'treasuries', 'treasuryTransactions', 'stockMovements', 'inventory',
      'accounts', 'purchaseReturns', 'salesReturns'
    ]);
    if (command.changes.some(change => protectedEntities.has(change.entity))) {
      throw new Error('Financial or stock changes cannot be discarded without a documented reconciliation and reversal.');
    }

    const db = await this.getDb();
    const tx = db.transaction(OUTBOX, 'readwrite');
    const done = completed(tx);
    tx.objectStore(OUTBOX).delete(commandId);
    await done;
    this.changed();
  }

  async autoResolveInvoiceConflict(_commandId: string): Promise<string> {
    throw new Error('Local invoice renumbering is disabled. Review the cloud numbering registry and reconcile the document with its original references.');
  }

  async clearAllConflicts(): Promise<void> {
    throw new Error('Bulk conflict clearing is disabled to protect uncommitted financial data. Resolve each operation with verified cloud evidence.');
  }

}

function compareCursor(
  a: ServerCursor,
  b: ServerCursor
): number {
  if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
  if (b.sequence != null && a.sequence == null) return -1;
  if (a.sequence != null && b.sequence == null) return 1;
  if (a.seconds !== b.seconds) {
    return a.seconds - b.seconds;
  }

  if (a.nanoseconds !== b.nanoseconds) {
    return a.nanoseconds - b.nanoseconds;
  }

  return a.eventId.localeCompare(b.eventId);
}
