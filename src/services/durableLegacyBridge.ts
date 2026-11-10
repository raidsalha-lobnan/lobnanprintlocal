/**
 * Local durable-write compatibility bridge.
 * Production data is accepted only by the unified local repository and
 * acknowledged by the PostgreSQL synchronization coordinator.
 * This module initializes no cloud SDK, authentication client or remote DB.
 */
type DurableWriteOperation = 'set' | 'delete';
type Reference = { path: string; id: string };
type Writer = (
  operation: DurableWriteOperation,
  reference: Reference,
  payload?: unknown,
  options?: { merge?: boolean }
) => Promise<boolean>;

let registeredWriter: Writer | null = null;
export function registerDurableWriter(writer: Writer): () => void {
  registeredWriter = writer;
  return () => {
    if (registeredWriter === writer) registeredWriter = null;
  };
}

const noLegacyRead = () => new Error('READ_REQUIRES_CANONICAL_POSTGRES_REPOSITORY');
const noLegacyBatch = () => new Error('BATCH_REQUIRES_ATOMIC_POSTGRES_COMMAND');
export const db = Object.freeze({ backend: 'local-postgres' });
export const auth = Object.freeze({ currentUser: null as null | {email?: string} });

function referenceParts(args: unknown[]): string[] {
  // Accept (db, collection, id) or (collectionRef, id).
  const [first, ...rest] = args;
  const prefix = first && typeof first === 'object' && 'path' in first
    ? [String((first as Reference).path)]
    : [];
  const parts = first === db ? rest : prefix.length ? rest : args;
  const strings = parts.map(String).filter(Boolean);
  return [...prefix, ...strings];
}
export function doc(...args: unknown[]): any {
  const path = referenceParts(args).join('/');
  return { path, id: path.split('/').at(-1) || '' };
}
export function collection(...args: unknown[]): any {
  return { path: referenceParts(args).join('/') };
}
export function query(source: any, ..._constraints: unknown[]): any { return source; }
export function where(...args: unknown[]): any { return args; }
export function orderBy(...args: unknown[]): any { return args; }
export function limit(...args: unknown[]): any { return args; }

export function getDoc(_reference: unknown): Promise<any> {
  return Promise.reject(noLegacyRead());
}
export const getDocFromServer = getDoc;
export function getDocs(_reference: unknown): Promise<any> {
  return Promise.reject(noLegacyRead());
}
export function onSnapshot(...args: any[]): () => void {
  const onError = args.find((x, index) => index > 1 && typeof x === 'function');
  if (onError) queueMicrotask(() => onError(noLegacyRead()));
  return () => {};
}
export async function setDoc(reference: Reference, payload: unknown, options?: { merge?: boolean }): Promise<void> {
  if (!registeredWriter) throw new Error('DURABLE_REPOSITORY_NOT_INITIALIZED');
  const persisted = await registeredWriter('set', reference, payload, options);
  if (!persisted) throw new Error('ENTITY_NOT_SUPPORTED_BY_DURABLE_REPOSITORY');
}
export async function deleteDoc(reference: Reference): Promise<void> {
  if (!registeredWriter) throw new Error('DURABLE_REPOSITORY_NOT_INITIALIZED');
  const persisted = await registeredWriter('delete', reference);
  if (!persisted) throw new Error('ENTITY_NOT_SUPPORTED_BY_DURABLE_REPOSITORY');
}
export function writeBatch(_database: unknown): any {
  // Legacy direct batch operations bypass financial atomicity guarantees.
  // Never report success; callers must use the canonical accounting command.
  return {
    set: () => { throw noLegacyBatch(); },
    update: () => { throw noLegacyBatch(); },
    delete: () => { throw noLegacyBatch(); },
    commit: async () => { throw noLegacyBatch(); }
  };
}
