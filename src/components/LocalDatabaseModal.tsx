import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  HardDrive, X, Database, FileText, Users, Boxes, Receipt,
  ShieldCheck, Cloud, Server, RefreshCw, AlertTriangle, ArrowUpLeft
} from 'lucide-react';

interface LocalDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Read-only local data overview.
 *
 * The former legacy dialog duplicated an independent browser-side 30-minute
 * Google Drive timer and displayed old destructive reset/restore controls.
 * The authoritative PostgreSQL backup and Drive status UI is Settings/Backup.
 * This dialog never runs a backup, imports a snapshot, deletes/renumbers
 * financial records, or changes the synchronization mode.
 */
export const LocalDatabaseModal: React.FC<LocalDatabaseModalProps> = ({ isOpen, onClose }) => {
  const {
    invoices, parties, inventory, vouchers, employees,
    syncCoordinatorState, forceSyncNow, setActiveTab
  } = useAccounting();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{text: string; success: boolean} | null>(null);

  if (!isOpen) return null;

  const openSection = (section: 'settings_backup' | 'settings_sql') => {
    onClose();
    setActiveTab(section);
  };

  const syncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setMessage(null);
    try {
      const result = await forceSyncNow();
      setMessage({
        text: result.message || (result.success
          ? 'تم تنفيذ طلب المزامنة.'
          : 'لم تكتمل المزامنة، راجع سجل المزامنة.'),
        success: result.success
      });
    } catch (error) {
      setMessage({text: 'تعذر استكمال المزامنة: ' + String(error), success: false});
    } finally {
      setIsSyncing(false);
    }
  };

  const metrics = [
    {label: 'فواتير المبيعات', count: invoices.length, icon: FileText},
    {label: 'العملاء والموردون', count: parties.length, icon: Users},
    {label: 'أصناف المخزون', count: inventory.length, icon: Boxes},
    {label: 'سندات القبض والصرف', count: vouchers.length, icon: Receipt},
    {label: 'الموظفون', count: employees.length, icon: Users}
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 font-sans"
      dir="rtl" role="presentation" onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}>
      <section role="dialog" aria-modal="true" aria-labelledby="local-database-overview-title"
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 bg-slate-800 px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-2.5">
            <HardDrive className="h-5 w-5 shrink-0 text-emerald-300" />
            <div className="min-w-0">
              <h2 id="local-database-overview-title" className="text-sm font-extrabold">
                القاعدة المحلية والنسخ الاحتياطي
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-200">
                PostgreSQL قاعدة البيانات المعتمدة — IndexedDB نسخة الجهاز المحلية
              </p>
            </div>
          </div>
          <button type="button" aria-label="إغلاق" title="إغلاق" onClick={onClose}
            className="rounded-md p-1.5 text-white hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[78vh] space-y-3 overflow-y-auto p-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Database className="h-4 w-4 text-blue-700" />
              عدد السجلات الظاهرة حاليًا على هذا الجهاز
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {metrics.map(metric => (
                <div key={metric.label}
                  className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-2 text-center">
                  <metric.icon className="h-3.5 w-3.5 text-slate-500" />
                  <strong className="text-base font-black tabular-nums text-slate-900">{metric.count}</strong>
                  <span className="text-[10px] font-medium text-slate-600">{metric.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-600">
              هذه أعداد الواجهة المحلية، وليست شهادة بمطابقتها لـ PostgreSQL.
              المزامنة المعتمدة تقارن المعرّفات والإصدارات وتستعيد السجلات الناقصة.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 text-blue-900">
              <RefreshCw className="h-4 w-4" />
              <span className="font-bold">المزامنة:</span>
              <span>
                {syncCoordinatorState.conflict > 0
                  ? `${syncCoordinatorState.conflict} تعارض يحتاج مراجعة`
                  : syncCoordinatorState.pending > 0
                    ? `${syncCoordinatorState.pending} عملية محلية بانتظار اعتماد الخادم`
                    : 'لا توجد عمليات معلّقة معروفة'}
              </span>
            </div>
            <button type="button" onClick={() => { void syncNow(); }} disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'تجري المزامنة…' : 'مزامنة الآن'}
            </button>
          </div>

          {message && (
            <div role="status" className={`rounded-md border px-3 py-2 text-xs font-semibold ${
              message.success
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}>
              {message.text}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => openSection('settings_backup')}
              className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-right text-xs font-bold text-emerald-900 hover:bg-emerald-100">
              <span className="flex items-center gap-2">
                <Cloud className="h-4 w-4 shrink-0" />
                إدارة النسخ الاحتياطي المعتمد وGoogle Drive
              </span>
              <ArrowUpLeft className="h-3.5 w-3.5 shrink-0" />
            </button>
            <button type="button" onClick={() => openSection('settings_sql')}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-right text-xs font-bold text-slate-800 hover:bg-slate-50">
              <span className="flex items-center gap-2">
                <Server className="h-4 w-4 shrink-0" />
                إعدادات الاتصال بالخادم والقاعدة المحلية
              </span>
              <ArrowUpLeft className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              عمليات استعادة اللقطات القديمة وحذف الفواتير والصناديق وإعادة ترقيمها ليست
              إجراءات نسخ احتياطي يومية، لذلك لا تظهر في هذه النافذة.
              لا يُعتبر وجود رمز Google Drive أو تفعيل إعداد محلي دليلًا على نجاح النسخ؛
              تحقق من نتيجة الخادم في إدارة النسخ الاحتياطي.
            </span>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2">
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            أدوات الفحص والتنقل فقط — لا تعديل للبيانات
          </span>
          <button type="button" onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
            إغلاق
          </button>
        </footer>
      </section>
    </div>
  );
};
