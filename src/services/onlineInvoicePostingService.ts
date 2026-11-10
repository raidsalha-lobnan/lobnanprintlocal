// POS recovery scratchpad only. Financial posting is performed by the
// AccountingContext durable PostgreSQL command pathway, never by a secondary cloud SDK.
// Do not clear staged drafts until the canonical posting method confirms success.
const STAGED_POS_DRAFT_KEY = 'alnoor_pos_staged_in_flight_draft';

export const onlineInvoicePostingService = {
  checkIsOnline: (): boolean =>
    typeof navigator === 'undefined' ? true : navigator.onLine,

  // The retired direct-cloud invoice path is disabled. Active posting
  // concurrency is handled by the canonical POS/accounting workflow.
  isPostingBusy: (): boolean => false,

  stageInvoiceDraft: (draftData: unknown): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STAGED_POS_DRAFT_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: draftData
        }));
      }
    } catch (error) {
      console.error('Unable to stage POS draft for recovery', error);
    }
  },

  getStagedInvoiceDraft: (): unknown | null => {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STAGED_POS_DRAFT_KEY);
        if (raw) return JSON.parse(raw)?.data ?? null;
      }
    } catch (error) {
      console.error('Unable to read staged POS draft', error);
    }
    return null;
  },

  clearStagedInvoiceDraft: (): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STAGED_POS_DRAFT_KEY);
      }
    } catch (error) {
      console.error('Unable to clear staged POS draft', error);
    }
  }
};
