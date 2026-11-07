import React, { useState, useEffect } from 'react';
import { db, doc, getDoc } from '../firebase';
import { AlertOctagon, RefreshCw, CheckCircle, X } from 'lucide-react';
import { isFirestoreQuotaExceeded, resetQuotaExceeded } from '../services/firebaseFirestoreSyncService';

export const FirebaseConnectionDiagnostic: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('dismiss_firebase_diagnostic') === 'true';
    } catch {
      return false;
    }
  });

  const checkConnection = async (force: boolean = false) => {
    if (force) {
      resetQuotaExceeded();
    }
    setStatus('checking');
    try {
      if (isFirestoreQuotaExceeded()) {
        setStatus('error');
        setErrorMessage('تم الوصول للحد اليومي المجاني للكتابة في Firebase Firestore (20,000 عملية). البيانات محفوظة ومتاحة محلياً بالكامل.');
        return;
      }
      // Test real read connection to settings document
      const docRef = doc(db, 'lobnan_sync_workspaces', 'lobnan_main', 'meta', 'invoiceNumberingReady');
      await getDoc(docRef);
      setStatus('success');
      setErrorMessage('');
    } catch (err: any) {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
        setStatus('error');
        setErrorMessage('تم بلوغ الحد اليومي لخطة Firebase Firestore. النظام يعمل محلياً بكفاءة وستستأنف المزامنة عند تجدد الحصة.');
      } else {
        setStatus('error');
        setErrorMessage(err?.message || 'تعذر الاتصال بقاعدة بيانات Firebase');
      }
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('dismiss_firebase_diagnostic', 'true');
    } catch {}
  };

  if (isDismissed) {
    return (
      <div className="flex items-center justify-end">
        <button
          onClick={() => {
            setIsDismissed(false);
            checkConnection(true);
          }}
          className="text-[11px] text-slate-500 hover:text-slate-700 underline flex items-center gap-1 py-1 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>فحص حالة اتصال Firebase</span>
        </button>
      </div>
    );
  }

  if (status === 'checking') {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />
          <span className="text-xs">جاري فحص الاتصال بقاعدة بيانات Firebase...</span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <span className="text-xs font-bold block">تنبيه اتصال Firebase:</span>
            <span className="text-xs">{errorMessage}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => checkConnection(true)}
            className="text-[11px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>إعادة الفحص</span>
          </button>
          <button
            onClick={handleDismiss}
            className="text-amber-700 hover:text-amber-900 p-1 rounded-full cursor-pointer"
            title="إخفاء"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="text-xs font-medium">اتصال Firebase Firestore نشط 🟢 (مزامنة ذكية تفاضلية: رفع وجلب الحركات الجديدة فقط لتوفير الكوتا)</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => checkConnection(true)}
          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-2 py-0.5 bg-emerald-100/80 rounded cursor-pointer transition flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          <span>تحديث</span>
        </button>
        <button
          onClick={handleDismiss}
          className="text-emerald-600 hover:text-emerald-900 p-0.5 rounded-full cursor-pointer"
          title="إخفاء"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
