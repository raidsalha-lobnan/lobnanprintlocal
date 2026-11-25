/** Cancelable intent used by every internal navigation path. */
export const POS_LEAVE_INTENT_EVENT = 'lobnan:pos-leave-intent-v1';

export interface PosLeaveIntentDetail {
  targetTab: string;
}

export function mayNavigateAwayFromPos(activeTab: string, targetTab: string): boolean {
  if (activeTab !== 'pos' || targetTab === 'pos' || typeof window === 'undefined') return true;
  return window.dispatchEvent(new CustomEvent<PosLeaveIntentDetail>(
    POS_LEAVE_INTENT_EVENT, {cancelable:true,detail:{targetTab}}
  ));
}
