import {
  JsonObject,
  ProposedChange
} from './types';

export interface JournalLine {
  accountId: string;
  debitMinor: number;
  creditMinor: number;
}

export interface PostingInput {
  documentEntity:
    | 'invoices'
    | 'purchases'
    | 'vouchers'
    | 'expenses'
    | 'salesReturns'
    | 'purchaseReturns';

  documentId: string;
  document: JsonObject;
  journalId: string;
  journalDate: string;
  currency: string;
  lines: JournalLine[];
  movements: ProposedChange[];
}

export function buildAtomicPosting(
  input: PostingInput
): ProposedChange[] {
  if (
    !input.documentId ||
    !input.journalId ||
    input.documentId === input.journalId
  ) {
    throw new Error('Invalid posting identifiers');
  }

  if (
    !Array.isArray(input.lines) ||
    input.lines.length < 2
  ) {
    throw new Error('Invalid journal lines');
  }

  let debit = 0;
  let credit = 0;

  for (const line of input.lines) {
    if (
      !line.accountId ||
      !Number.isSafeInteger(line.debitMinor) ||
      !Number.isSafeInteger(line.creditMinor) ||
      line.debitMinor < 0 ||
      line.creditMinor < 0 ||
      (line.debitMinor > 0 && line.creditMinor > 0) ||
      (line.debitMinor === 0 && line.creditMinor === 0)
    ) {
      throw new Error('Invalid journal amount');
    }

    debit += line.debitMinor;
    credit += line.creditMinor;

    if (
      !Number.isSafeInteger(debit) ||
      !Number.isSafeInteger(credit)
    ) {
      throw new Error('Money overflow');
    }
  }

  if (debit <= 0 || debit !== credit) {
    throw new Error(
      `Unbalanced journal: ${debit} != ${credit}`
    );
  }

  const document = {
    ...input.document,
    id: input.documentId
  };

  const journal: JsonObject = {
    id: input.journalId,
    sourceDocumentId: input.documentId,
    sourceDocumentType: input.documentEntity,
    currency: input.currency,
    date: input.journalDate,
    lines: input.lines.map(l => ({ ...l }))
  };

  if (!Array.isArray(input.movements)) {
    throw new Error('Invalid posting movements');
  }
  // Prevent a caller from inserting two versions of the same record into a
  // single atomic command (including overwriting the journal/document).
  const changes: ProposedChange[] = [
    { entity: input.documentEntity, id: input.documentId, value: document },
    { entity: 'journalEntries', id: input.journalId, value: journal },
    ...input.movements
  ];
  const keys = new Set<string>();
  for (const change of changes) {
    if (!change || typeof change.entity !== 'string' ||
        typeof change.id !== 'string' || !change.id) {
      throw new Error('Invalid posting change');
    }
    const key = change.entity + '\\u001f' + change.id;
    if (keys.has(key)) throw new Error('Duplicate record in atomic posting');
    keys.add(key);
  }
  return changes;
}
