import React, { useEffect, useState, useRef } from 'react';
import { WifiOff, Wifi, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { SyncConflictModal } from './SyncConflictModal';

export const OfflineIndicator: React.FC = () => {
  const {
    isOnline,
    pendingSyncCount,
    forceSyncNow,
    syncCoordinatorState,
    isConflictModalOpen,
    openConflictModal,
    closeConflictModal
  } = useAccounting();
  const [isRetrying, setIsRetrying] = useState(false);
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);
  const prevOnlineRef = useRef(isOnline);

  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      setShowRestoredNotice(true);
      const timer = setTimeout(() => setShowRestoredNotice(false), 4500);
      return () => clearTimeout(timer);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  const handleManualRetry = async () => {
    setIsRetrying(true);
    try {
      await forceSyncNow();
    } finally {
      setIsRetrying(false);
    }
  };

  const hasConflicts = syncCoordinatorState.conflict > 0;

  return (
    <>
      <SyncConflictModal isOpen={isConflictModalOpen} onClose={closeConflictModal} />

      {/* Restored connection alert */}
      {showRestoredNotice && (
        <div 
          dir="rtl"
          className="fixed bottom-4 left-4 z-[200] flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xl animate-fade-in border border-emerald-400/40"
        >
          <Wifi className="w-4 h-4 text-emerald-100 shrink-0" />
          <span>{syncCoordinatorState.pending===0 && syncCoordinatorState.conflict===0 && syncCoordinatorState.lastSuccessAt
            ? 'تمت استعادة الاتصال وتأكيد مزامنة العمليات الحالية.'
            : 'استُعيد الاتصال ويجري فحص العمليات المعلقة والمتعارضة؛ لا تُعد المحاولة ناجحة حتى يؤكد الخادم.'}</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
        </div>
      )}

      {/* Conflict floating notification (even if online) */}
      {hasConflicts && !showRestoredNotice && (
        <div
          dir="rtl"
          className="fixed bottom-4 left-4 z-[200] flex items-center gap-2.5 rounded-xl bg-slate-900/95 border border-rose-500/60 px-3.5 py-2.5 text-xs font-medium text-white shadow-2xl backdrop-blur-md animate-fade-in"
        >
          <div className="flex items-center gap-1.5 text-rose-400 font-bold shrink-0">
            <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse shrink-0" />
            <span>تعارض في المزامنة</span>
          </div>

          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full text-[10px] font-bold">
            {syncCoordinatorState.conflict} عملية تتطلب مراجعة
          </span>

          <button
            onClick={openConflictModal}
            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[11px] font-bold transition shadow-xs cursor-pointer ml-auto"
          >
            فتح لوحة التعارضات
          </button>
        </div>
      )}

      {/* Offline banner (only when offline and no conflict floating banner) */}
      {!isOnline && !hasConflicts && !showRestoredNotice && (
        <div 
          dir="rtl"
          className="fixed bottom-4 left-4 z-[200] flex flex-wrap items-center gap-2.5 rounded-xl bg-slate-900/95 border border-amber-500/50 px-3.5 py-2.5 text-xs font-medium text-white shadow-2xl backdrop-blur-md animate-fade-in"
        >
          <div className="flex items-center gap-2 text-amber-400 font-bold shrink-0">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>وضع عدم الاتصال (Offline)</span>
          </div>

          <span className="text-slate-300 text-[11px] hidden sm:inline">
            تُحفظ كافة الفواتير والعمليات تلقائياً على هذا الجهاز.
          </span>

          {pendingSyncCount > 0 && (
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {pendingSyncCount} حركة بانتظار المزامنة
            </span>
          )}

          <button
            onClick={handleManualRetry}
            disabled={isRetrying}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-bold transition shadow-xs cursor-pointer ml-auto disabled:opacity-50"
            title="فحص الاتصال وإرسال الحركات المعلقة الآن"
          >
            <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'جاري الفحص...' : 'فحص الاتصال الآن'}</span>
          </button>
        </div>
      )}
    </>
  );
};
