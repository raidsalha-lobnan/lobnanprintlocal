import {
  doc,
  serverTimestamp,
  type Firestore,
  type Transaction
} from 'firebase/firestore';

import type { VersionedChange } from './types';

export interface InvoiceNumberPlan {
  numbers: ReadonlyMap<string, string>;
  write: () => void;
}

export async function planInvoiceNumbers(
  db: Firestore,
  tx: Transaction,
  workspaceId: string,
  changes: VersionedChange[]
): Promise<InvoiceNumberPlan> {

  const creates = changes.filter(c =>
    c.entity === 'invoices' &&
    c.expectedVersion === 0 &&
    c.value !== null
  );

  if (creates.length === 0) {
    return {
      numbers: new Map(),
      write: () => {}
    };
  }

  // New invoices must not supply local official numbers.
  for (const change of creates) {
    const number = change.value?.invoiceNumber;

    if (
      number != null &&
      number !== '' &&
      (
        typeof number !== 'string' ||
        !number.startsWith('TEMP-')
      )
    ) {
      throw new Error(
        'NEW_INVOICE_REQUIRES_TEMP_NUMBER'
      );
    }
  }

  const base = [
    'lobnan_sync_workspaces',
    workspaceId
  ] as const;

  const readyRef = doc(
    db, ...base, 'meta', 'invoiceNumberingReady'
  );

  const counterRef = doc(
    db, ...base, 'counters', 'invoices_global'
  );

  // Every transaction read must precede every write.
  const [readySnap, counterSnap] = await Promise.all([
    tx.get(readyRef),
    tx.get(counterRef)
  ]);

  if (readySnap.data()?.ready !== true) {
    throw new Error(
      'INVOICE_REGISTRY_NOT_READY: ' +
      'Reconcile and register historical invoices first'
    );
  }

  const lastSeq = counterSnap.exists()
    ? Number(counterSnap.data()?.seq)
    : NaN;

  if (
    !Number.isSafeInteger(lastSeq) ||
    lastSeq < 0
  ) {
    throw new Error('INVALID_INVOICE_COUNTER');
  }

  const numbers = new Map<string, string>();

  const claims = creates.map((change, index) => {
    const seq = lastSeq + index + 1;

    if (!Number.isSafeInteger(seq)) {
      throw new Error('INVOICE_COUNTER_OVERFLOW');
    }

    const invoiceNumber =
      `INV-${String(seq).padStart(4, '0')}`;

    numbers.set(change.id, invoiceNumber);

    return {
      invoiceId: change.id,
      invoiceNumber,
      ref: doc(
        db,
        ...base,
        'invoiceNumberClaims',
        invoiceNumber
      )
    };
  });

  const snapshots = await Promise.all(
    claims.map(claim => tx.get(claim.ref))
  );

  for (let i = 0; i < snapshots.length; i++) {
    if (snapshots[i].exists()) {
      throw new Error(
        `INVOICE_NUMBER_ALREADY_RESERVED: ` +
        claims[i].invoiceNumber
      );
    }
  }

  return {
    numbers,

    write: () => {
      tx.set(counterRef, {
        seq: lastSeq + creates.length,
        updatedAt: serverTimestamp()
      });

      for (const claim of claims) {
        tx.set(claim.ref, {
          invoiceId: claim.invoiceId,
          invoiceNumber: claim.invoiceNumber,
          reservedAt: serverTimestamp()
        });
      }
    }
  };
}
