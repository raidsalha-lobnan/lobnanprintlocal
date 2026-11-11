import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  HardDrive,
  X,
  ShieldAlert,
  Eye,
  Search,
  Server,
  Layers
} from 'lucide-react';
import { SyncCommand } from '../sync-next/types';
import type {QueueComparison} from '../sync-next/queueDiagnostics';
import {classifyQueueSafety} from '../sync-next/queueSafety';
import {explainSyncFailure} from '../sync-next/syncFailureGuide';
import { assessLocalStorageHealth } from '../sync-next/storageHealth';
import { useAccounting } from '../context/AccountingContext';

interface SyncConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({ isOpen, onClose }) => {
  const { unifiedRepository, isOnline, invoices } = useAccounting();
  const [conflicts, setConflicts] = useState<SyncCommand[]>([]);
  const [pendingCommands, setPendingCommands] = useState<SyncCommand[]>([]);
  const [authoritativeComparison,setAuthoritativeComparison]=useState<QueueComparison[]|null>(null);
  const [selectedCommand, setSelectedCommand] = useState<SyncCommand | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'diagnostic'>('queue');
  const [searchQuery, setSearchQuery] = useState('INV-0063');
  const [searchResult, setSearchResult] = useState<any[] | null>(null);
  const [storageHealth, setStorageHealth] = useState<{
    idbAvailable: boolean;
    persistent: boolean | null;
    quotaBytes: number | null;
    usageBytes: number | null;
  } | null>(null);

  const loadData = async () => {
    if (!unifiedRepository) return;
    try {
      const localDb = unifiedRepository.getLocalDb();
      const allPending = await localDb.pending();
      setPendingCommands(allPending);
      setConflicts(allPending.filter(c => c.status === 'conflict' || c.status === 'rejected'));
      const health = await assessLocalStorageHealth();
      setStorageHealth(health);
    } catch (err) {
      console.warn('Error loading sync conflict data:', err);
    }
  };

  useEffect(() => {
    if (!isOpen || !unifiedRepository) return;
    void loadData();
    // Reconcile the diagnostics display with the actual IndexedDB state.
    // A conflict resolved by background sync must not stay on-screen indefinitely.
    const unsubscribe=unifiedRepository.subscribe(()=>{void loadData();});
    const refresh=setInterval(()=>{void loadData();},15000);
    return ()=>{unsubscribe();clearInterval(refresh);};
  }, [isOpen, unifiedRepository]);

  const handleVerifiedSync = async () => {
    if(!unifiedRepository)return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const result=await unifiedRepository.getCoordinator().syncNow();
      setFeedback(result.pending===0 && result.conflict===0
        ? 'اكتملت المزامنة وأكد الخادم حفظ العمليات؛ لا توجد عمليات معلقة أو متعارضة.'
        : 'لا تزال توجد عمليات محلية تحتاج إلى مراجعة قبل تأكيد المزامنة.');
    } catch(err:any) {
      setFeedback('لم تكتمل المزامنة على الخادم: '+(err?.message||'خطأ غير معروف')+
        '. احتفظ بالعمليات المعلقة ولا تقم بحذفها.');
    } finally {await loadData();setIsLoading(false);}
  };

  const inspectAgainstPostgres = async () => {
    if (!unifiedRepository) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const report=await unifiedRepository.inspectPendingAgainstServer();
      setAuthoritativeComparison(report);
      const identical=report.reduce((n,c)=>n+c.changes.filter(v=>v.status==='identical').length,0);
      const different=report.reduce((n,c)=>n+c.changes.filter(v=>v.status==='different').length,0);
      const absent=report.reduce((n,c)=>n+c.changes.filter(v=>v.status==='absent').length,0);
      setFeedback('مقارنة PostgreSQL للقراءة فقط: '+identical+' سجل مطابق، '+different+' سجل مختلف، '+absent+' سجل غير موجود على الخادم. لم تُحذف أو تُرسل أي عملية.');
    } catch(err:any) {
      setFeedback('تعذر فحص النسخة المعتمدة من PostgreSQL: '+(err?.message||'خطأ غير معروف'));
    } finally {setIsLoading(false);}
  };

  const saveEmergencyQueueCopy = async () => {
    if(!unifiedRepository)return;
    setIsLoading(true);
    try {
      const queue=await unifiedRepository.getLocalDb().pending();
      const data=JSON.stringify({
        kind:'LOBNA_PENDING_OUTBOX_EMERGENCY_BACKUP',savedAt:new Date().toISOString(),
        warning:'PRIVATE ACCOUNTING DATA. Keep locally in a restricted encrypted folder. Never upload to a public site.',
        queue
      },null,2);
      const blob=new Blob([data],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download='lobnan-pending-queue-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      setFeedback('تم إعداد تنزيل نسخة إنقاذ خاصة من الطابور. يحتوي الملف بيانات حقيقية؛ لا تشاركه أو ترفعه إلى مستودع عام.');
    } catch(err:any) {
      setFeedback('لم تنجح نسخة الإنقاذ: '+(err?.message||'خطأ غير معروف'));
    } finally {setIsLoading(false);}
  };

  const handleSearchDiagnostic = async () => {
    if (!searchQuery.trim() || !unifiedRepository) return;
    setIsLoading(true);
    try {
      const q = searchQuery.trim().toLowerCase();
      const allInvoices = await unifiedRepository.all('invoices');
      const matches = allInvoices.filter(r => {
        if (!r.value) return false;
        const inv = r.value as any;
        const idMatch = String(inv.id || '').toLowerCase().includes(q);
        const numMatch = String(inv.invoiceNumber || '').toLowerCase().includes(q);
        const tempMatch = String(inv.tempInvoiceNumber || '').toLowerCase().includes(q);
        const custMatch = String(inv.customerName || '').toLowerCase().includes(q);
        return idMatch || numMatch || tempMatch || custMatch;
      });
      setSearchResult(matches);
    } catch (err: any) {
      setFeedback(`فشل البحث التشخيصي: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleRetry = async (commandId: string) => {
    if (!unifiedRepository) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      await unifiedRepository.retryCommand(commandId);
      setFeedback('أُرسلت محاولة مجدولة؛ إذا اختلف إصدار الخادم تبقى العملية معلقة للمراجعة.');
      await loadData();
    } catch (err: any) {
      setFeedback(`فشلت إعادة المحاولة: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoRenumberInvoice = async (commandId: string) => {
    if (!unifiedRepository) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const newNum = await (unifiedRepository as any).autoResolveInvoiceConflict(commandId);
      setFeedback(`تمت إعادة ترقيم الفاتورة تلقائياً إلى الرقم المعتمد الجديد (${newNum}) وتحديث كافة القيود والمخزون والشاشات بنجاح 🟢`);
      setSelectedCommand(null);
      await loadData();
    } catch (err: any) {
      setFeedback(`فشلت إعادة الترقيم والتحديث: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsLoading(false);
    }
  };


  const handleDiscard = async (commandId: string) => {
    if (!unifiedRepository) return;
    if (!window.confirm('هل أنت متأكد من استبعاد هذه الحركة المعلقة نهائياً من الطابور؟ لا يمكن التراجع.')) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      await unifiedRepository.discardCommand(commandId);
      setFeedback('تم استبعاد الحركة من طابور التزامن المحلي 🗑️');
      setSelectedCommand(null);
      await loadData();
    } catch (err: any) {
      setFeedback(`فشل الاستبعاد: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes || bytes <= 0) return 'غير متاح';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  const getEntityLabel = (entity: string) => {
    const map: Record<string, string> = {
      invoices: 'فاتورة مبيعات',
      vouchers: 'سند مالي',
      purchases: 'فاتورة مشتريات',
      parties: 'عميل / مورد',
      inventory: 'صنف مخزني',
      journalEntries: 'قيد محاسبي',
      treasuries: 'صندوق / خزينة',
      treasuryTransactions: 'حركة خزينة',
      expenses: 'مصروف',
      stockMovements: 'حركة مخزون',
      printOrders: 'أمر شغل مطبعة'
    };
    return map[entity] || entity;
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden text-slate-100 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                لوحة فحص طابور المزامنة والتشخيص المركزي
                {conflicts.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    {conflicts.length} بحاجة لمعالجة
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                متابعة المزامنة والبحث عن المعرفات الداخلية وتدقيق تطابق البيانات بين الأجهزة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setActiveTab('queue')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${activeTab === 'queue' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'}`}
              >
                طابور المزامنة
              </button>
              <button
                onClick={() => setActiveTab('diagnostic')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${activeTab === 'diagnostic' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'}`}
              >
                الفحص والتحقيق (INV-0063/0064)
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'queue' && (
            <>
              {/* Status Banners */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">طابور الانتظار المحلي</div>
                    <div className="text-sm font-bold text-white">{pendingCommands.length} عملية</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">حالات التعارض / الرفض</div>
                    <div className="text-sm font-bold text-amber-300">{conflicts.length} عملية</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">تخزين المتصفح المحلي</div>
                    <div className="text-sm font-bold text-emerald-300">
                      {storageHealth?.usageBytes ? formatBytes(storageHealth.usageBytes) : 'نشط ومستقر'}
                    </div>
                  </div>
                </div>
              </div>

              {feedback && (
                <div className="p-3 rounded-xl bg-blue-950/60 border border-blue-500/40 text-xs text-blue-200">
                  {feedback}
                </div>
              )}

              {/* Conflict List */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    قائمة العمليات التي تتطلب مراجعة
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={inspectAgainstPostgres} disabled={isLoading}
                      className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-xs text-white font-bold disabled:opacity-50">
                      مقارنة الطابور مع PostgreSQL (دون تعديل)
                    </button>
                    <button type="button" onClick={saveEmergencyQueueCopy} disabled={isLoading}
                      className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-white font-bold disabled:opacity-50">
                      حفظ نسخة إنقاذ خاصة للطابور
                    </button>
                  </div>
                  {authoritativeComparison && (
                    <div className="w-full text-xs p-3 rounded-lg bg-slate-950 border border-slate-700 space-y-2">
                      {authoritativeComparison.map(cmd=>(
                        <div key={cmd.commandId} className="border-b border-slate-800 pb-2">
                          <div className="font-mono text-slate-300 break-all">العملية {cmd.commandId} — {cmd.changes.length} سجل</div>
                          <div className="text-slate-300">
                            مطابق: {cmd.changes.filter(c=>c.status==='identical').length}؛
                            مختلف: {cmd.changes.filter(c=>c.status==='different').length}؛
                            غير موجود على الخادم: {cmd.changes.filter(c=>c.status==='absent').length}
                          </div>
                          {cmd.changes.filter(c=>c.status==='different').slice(0,10).map(c=>(
                            <div key={c.entity+'-'+c.id} className="text-amber-300 break-all">
                              {c.entity}/{c.id} — محلي {c.expectedVersion}، خادم {c.serverVersion}؛
                              حقول مختلفة: {c.differentFields.join('، ')||'غير محدد'}
                            </div>
                          ))}
                        </div>
                      ))}
                      <div className="text-amber-200">هذا تقرير مقارنة فقط. لن تُزال أي عملية أو تُستبدل بيانات الخادم تلقائيًا.</div>
                    </div>
                  )}
                </div>

                {conflicts.length === 0 ? (
                  <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800/80">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
                    <h4 className="text-sm font-bold text-slate-200">لا توجد أي تعارضات معلقة</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      لا توجد عمليات تعارض مسجلة محليًا. تحقق من حالة المزامنة على PostgreSQL قبل اعتبار كافة البيانات معتمدة.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {conflicts.map(cmd => (
                      <div
                        key={cmd.id}
                        className="p-4 rounded-xl bg-slate-800/80 border border-amber-500/30 hover:border-amber-500/60 transition"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {cmd.status === 'conflict' ? 'تعارض نسخة (Version Conflict)' : 'رفض من السيرفر'}
                              </span>
                              <span className="text-xs font-mono text-slate-400">ID: {cmd.id}</span>
                            </div>
                            <div className="text-xs font-bold text-white mt-1">
                              الكيانات المتأثرة:{' '}
                              {cmd.changes.slice(0, 3).map(c => getEntityLabel(c.entity)).join('، ')}
                              {cmd.changes.length > 3 ? ` (+${cmd.changes.length - 3} سجلات)` : ''}
                            </div>
                            <div className="mt-2 rounded-lg bg-slate-900/60 border border-slate-700 p-2 text-xs">
                              <div className="font-bold text-amber-200">{explainSyncFailure(cmd.error,cmd.changes[0]?.entity).title}</div>
                              <div className="mt-1 text-slate-200">{explainSyncFailure(cmd.error,cmd.changes[0]?.entity).explanation}</div>
                              <div className="mt-1 text-sky-200">{explainSyncFailure(cmd.error,cmd.changes[0]?.entity).nextStep}</div>
                              <details className="mt-2 text-slate-400">
                                <summary className="cursor-pointer">التفاصيل التقنية</summary>
                                <div className="break-all font-mono mt-1">{cmd.error || 'تعارض نسخة بدون تفاصيل إضافية'}</div>
                              </details>
                            </div>
                            {classifyQueueSafety(cmd).advice && (
                              <div role="alert" className="mt-2 max-w-3xl text-[11px] leading-relaxed text-amber-200">
                                {classifyQueueSafety(cmd).advice}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 ml-auto">
                            {classifyQueueSafety(cmd).allowRenumber && (
                              <button
                                onClick={() => handleAutoRenumberInvoice(cmd.id)}
                                disabled={isLoading}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-bold transition flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                                title="إعادة ترقيم الفاتورة المعتمد تلقائياً وتحديث الشاشات المترابطة"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>تعديل رقم الفاتورة تلقائياً وتحديث كافة الشاشات</span>
                              </button>
                            )}

                            <button
                              onClick={() => setSelectedCommand(selectedCommand?.id === cmd.id ? null : cmd)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 font-medium transition flex items-center gap-1.5"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>معاينة</span>
                            </button>

                            {classifyQueueSafety(cmd).allowRetry && (
                              <button
                                onClick={() => handleRetry(cmd.id)}
                                disabled={isLoading}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>إعادة محاولة دون تجاوز التعارض</span>
                              </button>
                            )}
                            {classifyQueueSafety(cmd).allowDiscard && (
                              <button
                                onClick={() => handleDiscard(cmd.id)}
                                disabled={isLoading}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-xs text-rose-200 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
                                title="استبعاد حركة غير مالية"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {selectedCommand?.id === cmd.id && (
                          <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                            <div className="text-[11px] font-bold text-slate-300">تفاصيل التغييرات داخل المعاملة الذرية:</div>
                            <pre className="p-3 rounded-lg bg-slate-950 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-48 border border-slate-800">
                              {JSON.stringify(cmd.changes, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending Outbox Queue List */}
              <div className="space-y-3 mt-6 pt-6 border-t border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    كشف العمليات المعلقة في طابور الانتظار بانتظار الإرسال ({pendingCommands.filter(c => c.status === 'pending').length})
                  </h3>
                  <button
                    onClick={()=>{void handleVerifiedSync();}}
                    disabled={isLoading}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>مزامنة الطابور والتحقق من النتيجة</span>
                  </button>
                </div>

                {pendingCommands.filter(c => c.status === 'pending').length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-slate-950/40 border border-slate-800/80">
                    <CheckCircle2 className="w-8 h-8 text-blue-400 mx-auto mb-2 opacity-80" />
                    <h4 className="text-xs font-bold text-slate-200">لا توجد عمليات جاهزة للإرسال</h4>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {conflicts.length > 0
                        ? `يوجد ${conflicts.length} عملية مرفوضة أو متعارضة لم تُحل بعد. فراغ طابور الإرسال لا يعني اكتمال المزامنة.`
                        : 'لا توجد عمليات معلقة أو مرفوضة على هذا الجهاز حاليًا. تحقق أيضًا من الأجهزة الأخرى.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {pendingCommands.filter(c => c.status === 'pending').map(cmd => (
                      <div
                        key={cmd.id}
                        className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 transition"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                معلق (Pending)
                              </span>
                              <span className="text-xs font-mono text-slate-400">ID: {cmd.id}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                ({new Date(cmd.createdAt).toLocaleTimeString('ar-EG')})
                              </span>
                            </div>
                            <div className="text-xs font-bold text-white mt-1">
                              الكيانات المتأثرة:{' '}
                              {cmd.changes.map(c => `${getEntityLabel(c.entity)} (${c.id})`).join('، ')}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-auto">
                            <button
                              onClick={() => setSelectedCommand(selectedCommand?.id === cmd.id ? null : cmd)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 font-medium transition flex items-center gap-1.5"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>معاينة</span>
                            </button>

                            <span className="text-[10px] text-amber-200">
                              الحركات غير المرسلة محفوظة محليًا؛ لا تستبعدها قبل المطابقة مع الخادم.
                            </span>
                          </div>
                        </div>

                        {selectedCommand?.id === cmd.id && (
                          <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                            <div className="text-[11px] font-bold text-slate-300">تفاصيل التغييرات في طابور الانتظار:</div>
                            <pre className="p-3 rounded-lg bg-slate-950 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-48 border border-slate-800">
                              {JSON.stringify(cmd.changes, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'diagnostic' && (
            <div className="space-y-6">
              {/* Configuration Parity Spec Card */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
                  <Server className="w-4 h-4 text-blue-400" />
                  <span>معلمات مطابقة الإعدادات السحابية والمساحة المعتمدة (Configuration Parity)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Database backend:</span>
                    <span className="text-emerald-300 font-bold">PostgreSQL</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Synchronization API:</span>
                    <span className="text-emerald-300 font-bold">/api/v1</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Workspace Namespace:</span>
                    <span className="text-blue-300 font-bold">lobnan_main</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Sync Endpoint Path:</span>
                    <span className="text-blue-300 font-bold">/api/v1/events?workspace=lobnan_main</span>
                  </div>
                </div>
              </div>

              {/* Diagnostic Search Tool */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Search className="w-4 h-4 text-amber-400" />
                    <span>البحث والتحقيق التشخيصي بالفواتير بالمعرف الداخلي أو الرقم الرسمي (مثل INV-0063 / INV-0064)</span>
                  </div>
                  <span className="text-[11px] text-slate-400">إجمالي الفواتير بالمستودع الموحد: {invoices.length}</span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="أدخل رقم الفاتورة أو المعرف الداخلي (UUID)..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    onClick={handleSearchDiagnostic}
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white rounded-xl transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>فحص وتحقيق</span>
                  </button>
                </div>

                {searchResult && (
                  <div className="space-y-3 mt-3">
                    <div className="text-xs text-slate-300 font-bold flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      <span>نتائج البحث ({searchResult.length} فاتورة):</span>
                    </div>

                    {searchResult.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-amber-300 text-center">
                        لم يتم العثور على أي فاتورة تطابق القيمة الموضحة ({searchQuery}).
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {searchResult.map((res: any, idx) => {
                          const val = res.value || {};
                          return (
                            <div key={res.id || idx} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    الرقم الرسمي: {val.invoiceNumber || 'مؤقت'}
                                  </span>
                                  {val.tempInvoiceNumber && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800 text-slate-400 font-mono">
                                      مؤقت: {val.tempInvoiceNumber}
                                    </span>
                                  )}
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${res.pending ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                    {res.pending ? 'قيد الانتظار أوفلاين' : 'مؤكد سحابياً'}
                                  </span>
                                </div>
                                <span className="text-[11px] font-mono text-slate-400">UUID ID: {res.id}</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                <div><span className="text-slate-400">العميل:</span> <span className="text-white font-bold">{val.customerName || 'نقدي'}</span></div>
                                <div><span className="text-slate-400">المبلغ الإجمالي:</span> <span className="text-emerald-400 font-bold">{val.totalAmount} ₪</span></div>
                                <div><span className="text-slate-400">الإصدار (Version):</span> <span className="text-blue-300 font-mono font-bold">{res.version}</span></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span>حالة الشبكة: {isOnline ? 'متصل بالإنترنت (تزامن تفاضلي نشط)' : 'غير متصل (نسخة محلية بها حركات معلقة)'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث القائمة</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-bold transition"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
