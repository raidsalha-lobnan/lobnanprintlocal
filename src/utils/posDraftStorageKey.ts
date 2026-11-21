// Reloads keep the same tab slot. A new document opened in a separate tab can
// inherit a copy of sessionStorage, so allocate a fresh slot for that navigation.
let documentSlot: string | undefined;
export function posDraftStorageKey(prefix: string, ownerId: string): string {
  if (!documentSlot) {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const previous = sessionStorage.getItem('pos_draft_tab');
    documentSlot = previous && navigation?.type !== 'navigate' ? previous : crypto.randomUUID();
    sessionStorage.setItem('pos_draft_tab', documentSlot);
  }
  return [prefix, ownerId, documentSlot].join(':');
}
