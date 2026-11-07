import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { AuditLogEntry } from '../../types';
import { X, Search, ShieldAlert, User, Clock, FileText, RefreshCw, Trash2 } from 'lucide-react';

interface InvoiceAuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialInvoiceId?: string;
}

export const InvoiceAuditLogModal: React.FC<InvoiceAuditLogModalProps> = ({
  isOpen,
  onClose,
  initialInvoiceId = '29'
}) => {
  const { getInvoiceDeleteAuditLogs } = useAccounting();
  const [invoiceIdInput, setInvoiceIdInput] = useState(initialInvoiceId || '29');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchedId, setSearchedId] = useState(initialInvoiceId || '29');

  const fetchLogs = async (targetId: string) => {
    setIsLoading(true);
    setSearchedId(targetId);
    try {
      const results = await getInvoiceDeleteAuditLogs(targetId);
      setLogs(results);
    } catch (err) {
      console.error('Error fetching delete audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const idToSearch = initialInvoiceId || '29';
      setInvoiceIdInput(idToSearch);
      fetchLogs(idToSearch);
    }
  }, [isOpen, initialInvoiceId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white px-5 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-600/30 border border-rose-500/40 rounded-xl text-rose-300">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                <span>سجل تدقيق الحذف (Audit Log)</span>
                <span className="text-xs bg-rose-500/30 text-rose-200 px-2 py-0.5 rounded-full font-mono font-normal">
                  Firestore
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                استرداد سجلات حذف الفواتير وتتبع (User, Timestamp, Reason)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <form
            onSubmit={e => {
              e.preventDefault();
              fetchLogs(invoiceIdInput.trim() || '29');
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={invoiceIdInput}
                onChange={e => setInvoiceIdInput(e.target.value)}
                placeholder="أدخل رقم أو معرف الفاتورة (مثال: 29 أو INV-0029)..."
                className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-mono font-bold"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>استرداد السجلات</span>
            </button>
          </form>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            <span>الفلترة الحالية:</span>
            <span className="font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
              invoiceId = "{searchedId}"
            </span>
            <span className="text-slate-400">•</span>
            <span>المجموعة السحابية: <code className="text-slate-700 font-mono font-bold">auditLog</code></span>
          </div>
        </div>

        {/* Results List */}
        <div className="p-4 flex-1 overflow-y-auto min-h-[220px]">
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-2 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-rose-600" />
              <span>جاري استرداد سجلات الحذف من Firestore...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                <Trash2 className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-700 mb-1">
                لا توجد سجلات حذف مسجلة للفاتورة: <span className="font-mono text-rose-600">{searchedId}</span>
              </p>
              <p className="text-[11px] text-slate-400 max-w-sm">
                عند حذف أي فاتورة في البرنامج، يتم توثيق اسم المستخدم وتاريخ ووقت الحذف والسبب تلقائياً في مجموعة auditLog.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, index) => (
                <div
                  key={log.id || index}
                  className="bg-white border border-rose-200 rounded-xl p-3.5 shadow-xs hover:border-rose-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2.5 text-xs">
                    <div className="flex items-center gap-1.5 text-rose-700 font-bold">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>عملية حذف فاتورة</span>
                      <span className="font-mono text-[11px] bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                        #{log.invoiceNumber || log.invoiceId}
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: {log.id}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    {/* User */}
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-bold mb-1">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                        <span>المستخدم (User):</span>
                      </div>
                      <div className="font-bold text-slate-900 pr-4">
                        {log.user || 'مستخدم غير محدد'}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-bold mb-1">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>الوقت والتاريخ (Timestamp):</span>
                      </div>
                      <div className="font-mono text-slate-800 pr-4 text-[11px]">
                        {log.timestamp || log.createdAt || 'غير محدد'}
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-bold mb-1">
                        <FileText className="w-3.5 h-3.5 text-rose-600" />
                        <span>سبب الحذف (Reason):</span>
                      </div>
                      <div className="text-slate-900 font-medium pr-4 text-xs">
                        {log.reason || 'حذف الفاتورة من قبل المستخدم'}
                      </div>
                    </div>
                  </div>

                  {log.details && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                      {typeof log.details === 'object' ? (
                        <>
                          {log.details.customerName && <span>العميل: <strong className="text-slate-700">{log.details.customerName}</strong></span>}
                          {log.details.totalAmount !== undefined && <span>المبلغ: <strong className="text-slate-700">{log.details.totalAmount} ₪</strong></span>}
                          {log.details.date && <span>تاريخ الفاتورة: <strong className="text-slate-700">{log.details.date}</strong></span>}
                        </>
                      ) : (
                        <span>تفاصيل: {String(log.details)}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            عدد السجلات المستردة: <strong className="text-slate-800 font-mono">{logs.length}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer transition-colors"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
