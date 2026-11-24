/** Read-only discovery of cashier drafts stranded under an older tab slot.
 * Never auto-replay a financial sale or silently take another open tab's form.
 */
export interface RecoverableCashierDraft {
  key: string;
  raw: string;
  timestamp: number;
  draftId: string;
  itemPreview: string;
}
export function findRecoverableCashierDrafts(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
  ownerId: string,
  activeKey: string,
  activeDraftId?: string
): RecoverableCashierDraft[] {
  if (!ownerId) return [];
  const prefix = 'pos_active_full_draft:' + ownerId + ':';
  const drafts: RecoverableCashierDraft[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(prefix) || key === activeKey) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      let candidate: any;
      try { candidate = JSON.parse(raw); } catch { continue; }
      if (!candidate || candidate.ownerId !== ownerId ||
          (activeDraftId && candidate.draftId === activeDraftId) ||
          !Array.isArray(candidate.tableLines)) continue;
      const names = candidate.tableLines
        .filter((line: any) => line && typeof line.itemName === 'string' &&
          line.itemName.trim())
        .map((line: any) => line.itemName.trim());
      if (!names.length && !String(candidate.invoiceNotes || '').trim()) continue;
      drafts.push({
        key, raw, draftId: String(candidate.draftId || ''),
        timestamp: Number.isFinite(candidate.timestamp) ? candidate.timestamp : 0,
        itemPreview: names.slice(0, 2).join('، ') || 'مسودة مع ملاحظات'
      });
    }
  } catch { return drafts.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8); }
  return drafts.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
}
