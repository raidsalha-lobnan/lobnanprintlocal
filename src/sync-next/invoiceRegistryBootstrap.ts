import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  type Firestore
} from 'firebase/firestore';

export interface HistoricalReconciliationReport {
  workspaceId: string;
  reconciledAt: string;
  totalInvoicesRegistered: number;
  highestSequence: number;
  claimsCount: number;
  ready: boolean;
}

/**
 * Historical reconciliation and migration gate for official invoice numbering.
 * Safely registers existing historical invoices without blind overwrite or deletion,
 * creates claim documents under `invoiceNumberClaims/${number}`, sets the counter `invoices_global`,
 * and activates `meta/invoiceNumberingReady` only when finished.
 */
export async function initializeInvoiceNumberingRegistry(
  db: Firestore,
  workspaceId: string,
  initialInvoices: Array<{ id: string; invoiceNumber?: string }> = []
): Promise<HistoricalReconciliationReport> {
  const base = ['lobnan_sync_workspaces', workspaceId] as const;
  const readyRef = doc(db, ...base, 'meta', 'invoiceNumberingReady');
  const counterRef = doc(db, ...base, 'counters', 'invoices_global');

  // Check if already initialized and ready
  const readySnap = await getDoc(readyRef);
  if (readySnap.exists() && readySnap.data()?.ready === true) {
    const counterSnap = await getDoc(counterRef);
    const seq = Number(counterSnap.data()?.seq ?? 0);
    return {
      workspaceId,
      reconciledAt: readySnap.data()?.reconciledAt || new Date().toISOString(),
      totalInvoicesRegistered: initialInvoices.length,
      highestSequence: seq,
      claimsCount: seq,
      ready: true
    };
  }

  // Historical initialization must be explicit, reviewed, and backed up.
  // An empty list could erroneously reset the global counter to zero while
  // INV-0063 and INV-0064 already exist in the old cloud/device sources.
  if (initialInvoices.length === 0) {
    throw new Error('HISTORICAL_INVOICE_AUDIT_REQUIRED');
  }
  const seenNumbers = new Map<string, string>();
  for (const inv of initialInvoices) {
    const number = String(inv.invoiceNumber || '').trim();
    if (!inv.id || !number || number.startsWith('TEMP-')) continue;
    const previous = seenNumbers.get(number);
    if (previous && previous !== inv.id) {
      throw new Error(`DUPLICATE_HISTORICAL_INVOICE: ${number}`);
    }
    seenNumbers.set(number, inv.id);
  }
  // Find max sequence number from historical invoices
  let maxSeq = 0;
  const validClaims: Array<{ invoiceId: string; invoiceNumber: string }> = [];

  for (const inv of initialInvoices) {
    const num = (inv.invoiceNumber || '').trim();
    if (!num || num.startsWith('TEMP-')) continue;

    const match = num.match(/^INV-(?:202\d-)?(\d+)$/);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
      validClaims.push({
        invoiceId: inv.id,
        invoiceNumber: num
      });
    }
  }

  // Register claims for existing historical invoices
  for (const claim of validClaims) {
    const claimRef = doc(db, ...base, 'invoiceNumberClaims', claim.invoiceNumber);
    await setDoc(claimRef, {
      invoiceId: claim.invoiceId,
      invoiceNumber: claim.invoiceNumber,
      reservedAt: serverTimestamp(),
      isHistorical: true
    }, { merge: true });
  }

  // Initialize or advance counter to at least maxSeq
  const counterSnap = await getDoc(counterRef);
  const currentSeq = counterSnap.exists() ? Number(counterSnap.data()?.seq ?? 0) : 0;
  const finalSeq = Math.max(currentSeq, maxSeq);

  await setDoc(counterRef, {
    seq: finalSeq,
    updatedAt: serverTimestamp()
  }, { merge: true });

  // Activate ready flag
  const reconciledAt = new Date().toISOString();
  await setDoc(readyRef, {
    ready: true,
    reconciledAt,
    initialSeq: finalSeq
  });

  return {
    workspaceId,
    reconciledAt,
    totalInvoicesRegistered: initialInvoices.length,
    highestSequence: finalSeq,
    claimsCount: validClaims.length,
    ready: true
  };
}
