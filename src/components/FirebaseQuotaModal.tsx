import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  ExternalLink, 
  RefreshCw, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Activity, 
  Zap, 
  ShieldCheck, 
  HardDrive,
  Info,
  Server,
  Sparkles,
  Radio,
  Lock,
  ArrowUpRight
} from 'lucide-react';
import { 
  firebaseQuotaTracker, 
  FirebaseQuotaStats, 
  FIREBASE_CONSOLE_URL, 
  GOOGLE_CLOUD_METRICS_URL,
  FIREBASE_PROJECT_ID, 
  FIREBASE_DATABASE_ID,
  formatCountdown
} from '../services/firebaseQuotaTracker';

interface FirebaseQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirebaseQuotaModal: React.FC<FirebaseQuotaModalProps> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<FirebaseQuotaStats>(firebaseQuotaTracker.getStats());
  const [countdownStr, setCountdownStr] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'architecture' | 'console'>('overview');
  const [isVerifyingLive, setIsVerifyingLive] = useState(false);
  const [liveVerificationResult, setLiveVerificationResult] = useState<{ isBlocked: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const update = () => {
      const current = firebaseQuotaTracker.getStats();
      setStats(current);
      setCountdownStr(formatCountdown(current.nextResetTimestamp));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRefresh = () => {
    setStats(firebaseQuotaTracker.getStats());
  };

  const handleVerifyLiveCloudStatus = async () => {
    setIsVerifyingLive(true);
    setLiveVerificationResult(null);
    try {
      const res = await firebaseQuotaTracker.verifyLiveQuotaStatus();
      setLiveVerificationResult(res);
      setStats(firebaseQuotaTracker.getStats());
    } finally {
      setIsVerifyingLive(false);
    }
  };

  const handleResetLocalTracker = () => {
    firebaseQuotaTracker.resetCurrentTracker();
    setLiveVerificationResult(null);
    setStats(firebaseQuotaTracker.getStats());
  };

  const getStatusBadge = (percent: number, isExceeded: boolean) => {
    if (isExceeded || percent >= 100) {
      return { text: '🚨 نفدت الحصة (Blocked)', color: 'bg-rose-600 text-white border-rose-700 font-extrabold' };
    }
    if (percent >= 80) {
      return { text: 'مرتفع - قرب النفاد', color: 'bg-amber-100 text-amber-900 border-amber-300' };
    }
    return { text: 'ضمن الأمان', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  };

  const readsBadge = getStatusBadge(stats.readsPercent, stats.isQuotaExceeded);
  const writesBadge = getStatusBadge(stats.writesPercent, stats.isQuotaExceeded);
  const deletesBadge = getStatusBadge(stats.deletesPercent, stats.isQuotaExceeded);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 font-sans overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-3xl overflow-hidden flex flex-col max-h-[94vh]">
        
        {/* Header Title Bar */}
        <div className="bg-gradient-to-r from-[#0a246a] via-[#123985] to-[#2563eb] text-white px-4 py-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                مؤشر وحاسبة استهلاك حصة فايربيس السحابية (Firebase Quota Monitor)
              </h3>
              <p className="text-[11px] text-blue-200">
                متابعة دقيقة لاستجابة خوادم Google Cloud ومواعيد التجديد اليومية
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 active:bg-rose-600 text-white flex items-center justify-center transition cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-4 h-4 font-bold" />
          </button>
        </div>

        {/* Official Google Cloud Quota Exceeded Banner matching screenshot if blocked */}
        {stats.isQuotaExceeded && (
          <div className="bg-rose-950 text-white p-4 border-b-2 border-rose-600 space-y-2 shrink-0 animate-in slide-in-from-top duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-600/30 border border-rose-500/50 flex items-center justify-center text-rose-300 shrink-0 mt-0.5">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white tracking-wide flex items-center gap-2">
                    <span>You have gone over your daily usage limits</span>
                    <span className="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                      Google Cloud Status
                    </span>
                  </h4>
                  <p className="text-xs text-rose-200 mt-1 leading-relaxed">
                    تم الوصول للحد اليومي المجاني الكامل (50,000 قراءة / 20,000 كتابة) على سيرفرات Firebase Console في Google Cloud.
                  </p>
                  <p className="text-[11.5px] text-emerald-300 font-bold mt-1">
                    🟢 طمأنة رسمية: جميع فواتيرك ورسائلك وحركاتك مأمنة ومحفوظة 100% في قاعدة البيانات المحلية (Local Storage).
                  </p>
                </div>
              </div>

              <a
                href={FIREBASE_CONSOLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-md shadow-md transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span>View Usage / Upgrade</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Next Reset Countdown Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
            <div>
              <span className="text-xs text-amber-300 font-medium">
                تتجدد الحصة تلقائياً يومياً عند الساعة <strong className="text-white font-bold">12:00 ظهراً بتوقيت القدس / فلسطين</strong> (منتصف الليل Pacific Time)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-black/50 px-3 py-1 rounded-lg border border-amber-500/40">
            <span className="text-slate-400 text-xs font-mono">العداد التنازلي للتجديد:</span>
            <span className="text-lg font-black font-mono text-amber-400 tracking-wider">
              {countdownStr || stats.formattedCountdown}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100 px-4 pt-2 gap-2 text-xs font-bold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2 rounded-t-md border-t border-x transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-white border-slate-300 text-blue-700 font-extrabold shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            <span>الحصص اليومية المباشرة</span>
          </button>

          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-2 rounded-t-md border-t border-x transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'architecture'
                ? 'bg-white border-slate-300 text-blue-700 font-extrabold shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>سبب الفارق وتطبيق Delta Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('console')}
            className={`px-3 py-2 rounded-t-md border-t border-x transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'console'
                ? 'bg-white border-slate-300 text-blue-700 font-extrabold shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
            <span>رابط وحدة تحكم Firebase الرسمية</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'overview' && (
            <>
              {/* Live Cloud Verification & Google Cloud Links */}
              <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-blue-600 animate-pulse" />
                  <div>
                    <h5 className="font-extrabold text-xs text-slate-900">فحص استجابة خوادم Google Cloud المباشرة</h5>
                    <p className="text-[11px] text-slate-500">يقوم بإرسال طلب فحص حي لـ Firebase للتحقق الفعلي الفوري من حالة السيرفر وزمن الاستجابة.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={GOOGLE_CLOUD_METRICS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-amber-300 font-extrabold text-xs rounded-md shadow-xs transition flex items-center gap-1 cursor-pointer"
                    title="فتح لوحة القياسات الرسمية في Google Cloud"
                  >
                    <span>Google Cloud Metrics</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    onClick={handleVerifyLiveCloudStatus}
                    disabled={isVerifyingLive}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-md shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingLive ? 'animate-spin' : ''}`} />
                    <span>{isVerifyingLive ? 'جارِ الفحص...' : 'فحص الاستجابة الآن'}</span>
                  </button>
                </div>
              </div>

              {liveVerificationResult && (
                <div className={`p-3 rounded-lg text-xs font-bold border ${
                  liveVerificationResult.isBlocked
                    ? 'bg-rose-100 text-rose-900 border-rose-300'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                }`}>
                  {liveVerificationResult.isBlocked ? (
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-rose-600" />
                      <span>نتيجة الفحص الحي: السيرفر مغلق حالياً من جوجل بسبب استهلاك الحصة (You have gone over your daily usage limits).</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>{liveVerificationResult.message}</span>
                      </div>
                      <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-md font-mono">
                        100% Real-Time Connected
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Quota Progress Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Reads Meter */}
                <div className={`border rounded-lg p-3.5 flex flex-col justify-between shadow-2xs ${
                  stats.isQuotaExceeded ? 'bg-rose-50/50 border-rose-300' : 'bg-slate-50 border-slate-300'
                }`}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-blue-600" />
                        <span className="font-bold text-xs text-slate-800">قراءات Firestore (Reads)</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${readsBadge.color}`}>
                        {readsBadge.text}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-2 font-mono">
                      <span className="text-2xl font-black text-slate-900">
                        {stats.readsUsed.toLocaleString('ar-SA')}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">
                        من {stats.readsLimit.toLocaleString('ar-SA')} daily
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-2.5 rounded-full mt-2.5 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          stats.isQuotaExceeded || stats.readsPercent >= 90 ? 'bg-rose-600' : 'bg-blue-600'
                        }`}
                        style={{ width: `${stats.readsPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center text-[10.5px] text-slate-500 font-mono">
                    <span>نسبة الاستهلاك:</span>
                    <span className="font-bold text-slate-800">{stats.readsPercent}%</span>
                  </div>
                </div>

                {/* 2. Writes Meter */}
                <div className={`border rounded-lg p-3.5 flex flex-col justify-between shadow-2xs ${
                  stats.isQuotaExceeded ? 'bg-rose-50/50 border-rose-300' : 'bg-slate-50 border-slate-300'
                }`}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-600" />
                        <span className="font-bold text-xs text-slate-800">كتابة وعمليات (Writes)</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${writesBadge.color}`}>
                        {writesBadge.text}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-2 font-mono">
                      <span className="text-2xl font-black text-slate-900">
                        {stats.writesUsed.toLocaleString('ar-SA')}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">
                        من {stats.writesLimit.toLocaleString('ar-SA')} daily
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-2.5 rounded-full mt-2.5 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          stats.isQuotaExceeded || stats.writesPercent >= 90 ? 'bg-rose-600' : 'bg-amber-600'
                        }`}
                        style={{ width: `${stats.writesPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center text-[10.5px] text-slate-500 font-mono">
                    <span>نسبة الاستهلاك:</span>
                    <span className="font-bold text-slate-800">{stats.writesPercent}%</span>
                  </div>
                </div>

                {/* 3. Deletes Meter */}
                <div className="bg-slate-50 border border-slate-300 rounded-lg p-3.5 flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <HardDrive className="w-4 h-4 text-rose-600" />
                        <span className="font-bold text-xs text-slate-800">حذف السجلات (Deletes)</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${deletesBadge.color}`}>
                        {deletesBadge.text}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-2 font-mono">
                      <span className="text-2xl font-black text-slate-900">
                        {stats.deletesUsed.toLocaleString('ar-SA')}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">
                        من {stats.deletesLimit.toLocaleString('ar-SA')} daily
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-2.5 rounded-full mt-2.5 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          stats.deletesPercent >= 90 ? 'bg-rose-600' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${stats.deletesPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center text-[10.5px] text-slate-500 font-mono">
                    <span>نسبة الاستهلاك:</span>
                    <span className="font-bold text-slate-800">{stats.deletesPercent}%</span>
                  </div>
                </div>
              </div>

              {/* Database Project Info Details */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-blue-200/80 pb-2">
                  <span className="font-bold text-blue-900 flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-blue-700" />
                    بيانات مشروع السحابة والمستودع:
                  </span>
                  <a
                    href={FIREBASE_CONSOLE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-extrabold hover:underline text-[11px]"
                  >
                    <span>فتح لوحة التحكم الرسمية في Google Cloud</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] text-slate-700">
                  <div className="bg-white p-2 rounded border border-blue-200/60">
                    <span className="text-slate-500 block text-[10px]">Project ID:</span>
                    <span className="font-bold text-slate-900">{FIREBASE_PROJECT_ID}</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-blue-200/60">
                    <span className="text-slate-500 block text-[10px]">Database ID:</span>
                    <span className="font-bold text-slate-900 truncate block">{FIREBASE_DATABASE_ID}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-900">
                <h4 className="font-extrabold text-sm flex items-center gap-1.5 text-amber-950">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  لماذا قد يظهر فارق بين العداد المحلي واستجابة Firebase الرسمي؟
                </h4>
                <p className="mt-1">
                  العداد المحلي في المتصفح يسجل حركات الجلسة الحالية فقط داخل التبويب المفتوح، بينما خوادم Google Cloud تحسب الاستهلاك الإجمالي التراكمي لجميع الجلسات والتبويبات المفتوحة والمستمعين الخلفيين (Background Listeners) والمزامنات السابقة منذ بداية اليوم.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-300 rounded-lg p-3">
                  <h5 className="font-bold text-rose-800 text-xs mb-1">❌ الطريقة التقليدية (تسبب نفاد الحصة):</h5>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px]">
                    <li>إعادة قراءة وتنزيل كل الفواتير والجداول (23 جدولاً) عند كل تحديث للصفحة (F5).</li>
                    <li>إذا كان لديك 1,000 فاتورة، كل تحديث يستهلك 1,000 قراءة فوراً!</li>
                    <li>تتسبب بنفاد حصة Firebase بالكامل (50,000 قراءة) خلال أقل من ساعة.</li>
                  </ul>
                </div>

                <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3">
                  <h5 className="font-bold text-emerald-800 text-xs mb-1">✅ الطريقة الذكية المطبقة (Smart Delta Sync & Persistent Cache):</h5>
                  <ul className="list-disc list-inside space-y-1 text-emerald-950 text-[11px]">
                    <li><strong>0 قراءة عند التحديث (F5):</strong> البيانات السابقة تُقرأ من التخزين المؤقت الدائم (IndexedDB).</li>
                    <li><strong>1 Read Unit لكل حركة جديدة فقط:</strong> الاستماع فقط لجدول التغييرات (Deltas Stream) عند إجراء عمليات من أجهزة أخرى.</li>
                    <li>توفير أكثر من 99% من الحصة اليومية، بحيث تكفي الحصة لآلاف الفواتير يومياً دون انقطاع.</li>
                  </ul>
                </div>
              </div>

              <div className="bg-slate-100 p-3 rounded-lg border border-slate-300">
                <span className="font-bold text-slate-900 block mb-1">ضمان السلامة والأمان المحاسبي 100%:</span>
                <p className="text-slate-600">
                  حتى عند ظهور رسالة <strong>"You have gone over your daily usage limits"</strong> في منصة جوجل، فإن تطبيقك يعمل بكفاءة وأمان كامل عبر قاعدة البيانات المحلية (Local Offline Database). جميع الفواتير والسندات محفوطة ورسمية وسيتم نقلها تلقائياً فور تجدد الحصة اليومية عند 12:00 ظهراً.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'console' && (
            <div className="space-y-4 text-xs">
              <div className="bg-slate-900 text-white rounded-lg p-4 border border-slate-800 space-y-3">
                <h4 className="font-extrabold text-sm text-amber-400 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  الوصول المباشر لتقرير الاستهلاك في منصة Firebase الرسمية
                </h4>
                <p className="text-slate-300 leading-relaxed text-[11.5px]">
                  يمكنك في أي وقت مراجعة المخططات البيانية المباشرة وتفاصيل الاستهلاك الفعلي في سيرفرات شركة Google عبر زر الانتقال المباشر أدناه.
                </p>
                <div className="pt-2">
                  <a
                    href={FIREBASE_CONSOLE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-md shadow-md transition cursor-pointer text-xs"
                  >
                    <span>الانتقال إلى وحدة تحكم قاعدة البيانات Firebase Console (View Usage / Upgrade)</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-300 space-y-2 text-slate-700">
                <h5 className="font-bold text-slate-900">ملاحظات هامة حول تجديد الحصص:</h5>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                  <li>ساعة الصفر لتصفر الاستهلاك: 12:00 ظهراً بتوقيت القدس (00:00 بتوقيت كاليفورنيا PST).</li>
                  <li>الحد اليومي المجاني الكلي: 50,000 قراءة + 20,000 كتابة + 20,000 حذف.</li>
                  <li>المعاينات التجريبية لا تلغي ولا تحد من فواتيرك الرسمية المخزنة على الذاكرة المحلية.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-100 px-4 py-2.5 border-t border-slate-300 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 bg-white hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 rounded-md transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              <span>تحديث البيانات</span>
            </button>

            <button
              onClick={handleResetLocalTracker}
              className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-800 text-[11px] font-bold border border-slate-300 rounded-md transition cursor-pointer"
              title="تصفير العداد المحلي ومسح شاشة الحظر للتجربة"
            >
              تصفير العداد والافتراضات
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-md shadow-xs transition cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>

      </div>
    </div>
  );
};
