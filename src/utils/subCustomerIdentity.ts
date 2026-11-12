import type { Invoice, Party } from '../types';

// The identity of a walk-in sub-customer is scoped to its permanent parent,
// never to the display text alone. Never merge names across parent accounts.
export function normalizeSubCustomerName(input: string | null | undefined): string {
  return String(input || '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');
}

export function cleanSubCustomerName(input: string | null | undefined): string {
  return String(input || '')
    .replace(/(?:\+?\d[\d\s-]{7,14}\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getInvoiceSubCustomerName(inv: Pick<Invoice, 'subCustomerName' | 'customCustomerText'>): string {
  return cleanSubCustomerName(inv.subCustomerName || inv.customCustomerText || '');
}

export function invoiceParentCustomerId(inv: Invoice): string {
  if (inv.counterpartyType && inv.counterpartyType !== 'customer') return '';
  return String(inv.customerId || inv.counterpartyId || '');
}

export function subCustomerParentId(party: Party): string {
  return party.parentPartyId || (party as Party & {parentCustomerId?: string}).parentCustomerId || '';
}

export function registeredSubCustomer(parties: Party[], parentId: string, name: string): Party | undefined {
  const normalized = normalizeSubCustomerName(name);
  if (!parentId || !normalized) return undefined;
  return parties.find(p =>
    p.isSubCustomer === true &&
    subCustomerParentId(p) === parentId &&
    normalizeSubCustomerName(p.name) === normalized
  );
}

export function isInvoiceOnlySubCustomer(party: Pick<Party, 'id'>): boolean {
  return party.id.startsWith('invoice-sub:');
}

function placeholderId(parentId: string, name: string): string {
  return 'invoice-sub:' + encodeURIComponent(parentId) + ':' +
    encodeURIComponent(normalizeSubCustomerName(name));
}

// Legacy invoices were often saved with text but without subCustomerId or
// a Party record. This read-only index makes them searchable immediately.
// No historical posting, journal, balance, or invoice record is modified.
export function indexedSubCustomers(parties: Party[], invoices: Invoice[]): Party[] {
  const validParents = new Set(parties.filter(p =>
    !p.isSubCustomer && (p.type === 'customer' || p.type === 'both')
  ).map(p => p.id));
  // Preserve pre-existing registered sub-records even when their parent link
  // predates the current schema; only newly inferred records require a valid parent.
  const result: Party[] = [];
  const keys = new Set<string>();
  for (const existing of parties) {
    if (!existing.isSubCustomer || (existing.type !== 'customer' && existing.type !== 'both')) continue;
    const linkedParent = subCustomerParentId(existing);
    const key = linkedParent
      ? linkedParent + '\0' + normalizeSubCustomerName(existing.name)
      : 'unlinked:' + existing.id;
    if (keys.has(key)) continue;
    keys.add(key);
    result.push(existing);
  }
  for (const inv of invoices) {
    const parentId = invoiceParentCustomerId(inv);
    const name = getInvoiceSubCustomerName(inv);
    if (!validParents.has(parentId) || !name) continue;
    const key = parentId + '\0' + normalizeSubCustomerName(name);
    if (keys.has(key)) continue;
    keys.add(key);
    result.push({
      id: placeholderId(parentId, name),
      name,
      // Synthetic invoice-only rows do not have an allocated business serial.
      // Never present an invented code as an official customer ID.
      code: '',
      type: 'customer',
      isSubCustomer: true,
      parentPartyId: parentId,
      phone: String(inv.subCustomerPhone || ''),
      balance: 0,
      openingBalance: 0
    } as Party);
  }
  return result;
}
