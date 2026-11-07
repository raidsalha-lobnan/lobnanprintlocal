import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { SqlServerConfig } from '../../types';
import {
  Database,
  Cloud,
  CloudOff,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Copy,
  Check,
  Server,
  FileCode,
  ShieldCheck,
  Wifi,
  WifiOff
} from 'lucide-react';

export const OfflineSqlSettings: React.FC = () => {
  const {
    sqlServerConfig,
    updateSqlServerConfig,
    generateSqlBackup,
    downloadSqlBackup,
    syncToServer,
    isOnline,
    lastSyncTime,
    accounts,
    inventory,
    invoices,
    parties,
    journalEntries,
    employees,
    treasuries,
    isFirebaseSyncing,
    lastFirebaseSyncTime,
    hasUnsyncedChanges,
    pendingSyncCount,
    lastLocalSaveTime,
    forceSyncNow
  } = useAccounting();

  // Local form state
  const [config, setConfig] = useState<SqlServerConfig>(sqlServerConfig);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [firebaseFeedback, setFirebaseFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const handleFirebaseSync = async () => {
    const res = await forceSyncNow();
    setFirebaseFeedback(res);
    setTimeout(() => setFirebaseFeedback(null), 5000);
  };
  const [selectedExportDialect, setSelectedExportDialect] = useState<'postgres' | 'mysql' | 'sqlite'>('postgres');
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlPreview, setShowSqlPreview] = useState(false);
  const [previewSqlContent, setPreviewSqlContent] = useState('');
  const [isConfigSaved, setIsConfigSaved] = useState(false);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    updateSqlServerConfig(config);
    setIsConfigSaved(true);
    setTimeout(() => setIsConfigSaved(false), 3000);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await syncToServer();
      setSyncStatus(res);
      setTimeout(() => setSyncStatus(null), 6000);
    } catch (err: any) {
      setSyncStatus({ success: false, message: 'فشلت المزامنة: ' + (err.message || 'خطأ في الاتصال') });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePreviewSql = (dialect: 'postgres' | 'mysql' | 'sqlite') => {
    const sql = generateSqlBackup(dialect);
    setPreviewSqlContent(sql);
    setShowSqlPreview(true);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(previewSqlContent);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* 1. Offline-First Architecture Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-xl p-4 shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-400/30">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">النظام يعمل محلياً (Offline-First)</h3>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>تخزين دائم ومستمر</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                تُحفظ كافة البيانات فورياً في الذاكرة المحلية (LocalStorage). لا يتوقف النظام عند انقطاع الإنترنت، مع إمكانية التصدير أو المزامنة مع قاعدة بيانات SQL خارجية.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              {isOnline ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'متصل بالإنترنت' : 'وضع عدم الاتصال (أوفلاين)'}</span>
            </div>
          </div>
        </div>

        {/* Storage Statistics Counter */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-center text-xs">
          <div className="bg-white/5 rounded-lg p-2 border border-white/5">
            <span className="text-[10px] text-slate-400 block">الأصناف بالمخزون</span>
            <span className="text-sm font-bold text-blue-300 font-mono">{inventory.length}</span>
          </div>
          <div className="bg-white/5 rounded-lg p-2 border border-white/5">
            <span className="text-[10px] text-slate-400 block">فواتير المبيعات</span>
            <span className="text-sm font-bold text-emerald-300 font-mono">{invoices.length}</span>
          </div>
          <div className="bg-white/5 rounded-lg p-2 border border-white/5">
            <span className="text-[10px] text-slate-400 block">العملاء والموردون</span>
            <span className="text-sm font-bold text-amber-300 font-mono">{parties.length}</span>
          </div>
          <div className="bg-white/5 rounded-lg p-2 border border-white/5">
            <span className="text-[10px] text-slate-400 block">شجرة الحسابات</span>
            <span className="text-sm font-bold text-purple-300 font-mono">{accounts.length}</span>
          </div>
          <div className="bg-white/5 rounded-lg p-2 border border-white/5">
            <span className="text-[10px] text-slate-400 block">القيود اليومية</span>
            <span className="text-sm font-bold text-cyan-300 font-mono">{journalEntries.length}</span>
          </div>
          <div className="bg-white/5 rounded-lg p-2 border border-white/5">
            <span className="text-[10px] text-slate-400 block">الخزنات والصناديق</span>
            <span className="text-sm font-bold text-rose-300 font-mono">{treasuries.length}</span>
          </div>
        </div>
      </div>

      {/* 2. Central Master PC Host & Mediator Settings */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">إعدادات الخادم المركزي (Master PC Host & Mediator)</h3>
            <p className="text-[11px] text-slate-500">
              اعتماد جهازك الشخصي كـ "خادم رئيسي متكامل" أو ربط الشاشات والأجهزة الفرعية برابط السيرفر المباشر
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-indigo-600" />
              <span>إذا كان هذا الجهاز هو (السيرفر الرئيسي / Master PC):</span>
            </h4>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              هذا الجهاز يحفظ البيانات مباشرة في القرص الصلب المباشر `.sync_data/`. يمكنك ربط الأجهزة والجوالات ببدائل الشبكة المحلية:
            </p>
            <div className="bg-slate-900 text-emerald-400 p-2 rounded-lg font-mono text-[11px] select-all">
              http://&lt;IP_ADDRESS&gt;:3000
            </div>
            <span className="text-[10px] text-slate-500 block">مثال بداخل المحل عبر الواي فاي: http://192.168.1.100:3000</span>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <Wifi className="w-4 h-4 text-emerald-600" />
              <span>إذا كان هذا جهاز فرعي / جوال (Client Device):</span>
            </h4>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              إذا كنت تستخدم البرنامج عبر رابط الويب المباشر أو نفس الجهاز، اتركه فارغاً. إذا كان لديك جهاز كمبيوتر رئيسي بداخل المحل، ضع عنوان IP الخاص به:
            </p>
            <input
              type="text"
              placeholder="اتركه فارغاً للاتصال المباشر التلقائي أو ضع: http://192.168.1.100:3000"
              defaultValue={(() => {
                const s = localStorage.getItem('master_server_host_url') || '';
                if (s.includes('vercel.app') || s.includes('netlify.app') || s.includes('github.io')) {
                  localStorage.removeItem('master_server_host_url');
                  return '';
                }
                return s;
              })()}
              onChange={(e) => {
                const val = e.target.value.trim();
                if (val.includes('vercel.app') || val.includes('netlify.app')) {
                  alert('لا يمكن استخدام استضافات الواجهات الثابتة (مثل Vercel) كسيرفر مزامنة رئيسي. يترك فارغاً للعمل المحلي أو وضع عنوان IP محلي.');
                  localStorage.removeItem('master_server_host_url');
                  e.target.value = '';
                } else {
                  localStorage.setItem('master_server_host_url', val);
                }
              }}
              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-mono"
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  const url = localStorage.getItem('master_server_host_url');
                  if (!url) {
                    alert('يرجى كتابة رابط السيرفر المضيف أولاً');
                    return;
                  }
                  try {
                    const host = url.trim().replace(/\/+$/, '');
                    const res = await fetch(`${host}/api/sync/status`);
                    if (res.ok) {
                      const json = await res.json();
                      alert(`تم الاتصال بالسيرفر الرئيسي بنجاح! 🟢\nعدد فواتير المبيعات بالسيرفر: ${json?.entities?.invoices?.count || 0}`);
                    } else {
                      alert(`فشل الاتصال بالسيرفر: رمز الخطأ ${res.status}`);
                    }
                  } catch (e: any) {
                    alert(`فشل الوصول للسيرفر الرئيسي: ${e.message}`);
                  }
                }}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors"
              >
                اختبار الاتصال المباشر
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('master_server_host_url');
                  window.location.reload();
                }}
                className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300 transition-colors"
              >
                إلغاء واعتماد الوضع المحلي
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Cloud Database & Instant LocalStorage Engine */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                قاعدة البيانات السحابية (Google Drive & Central Server) والحفظ المحلي الفوري
              </h3>
              <p className="text-[10px] text-slate-400 font-light">
                تُحفظ البيانات فورياً في الذاكرة المحلية وتتزامن تلقائياً مع السيرفر ومجلد Google Drive دون الحاجة لفايربيس
              </p>
            </div>
          </div>

          <button
            onClick={handleFirebaseSync}
            disabled={isFirebaseSyncing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer ${
              isFirebaseSyncing
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : !isOnline
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : hasUnsyncedChanges
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFirebaseSyncing ? 'animate-spin' : ''}`} />
            <span>{isFirebaseSyncing ? 'جاري المزامنة...' : 'مزامنة فورية مع قاعدة البيانات وGoogle Drive'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <span className="text-[10px] text-slate-400 font-light block">حالة الذاكرة المحلية (LocalStorage):</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <strong className="text-slate-800 text-xs">نشط وتلقائي 100%</strong>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">آخر حفظ: {lastLocalSaveTime}</span>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <span className="text-[10px] text-slate-400 font-light block">قاعدة بيانات Google Drive والسيرفر:</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              <strong className="text-slate-800 text-xs">
                {isOnline ? 'متصل ومفعل' : 'وضع عدم الاتصال (أوفلاين)'}
              </strong>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              آخر مزامنة: {lastFirebaseSyncTime || lastSyncTime || 'الآن'}
            </span>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <span className="text-[10px] text-slate-400 font-light block">التعديلات المعلقة للمزامنة:</span>
            <div className="flex items-center gap-1.5 mt-1">
              <strong className={`text-xs ${pendingSyncCount > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}`}>
                {pendingSyncCount > 0 ? `${pendingSyncCount} تعديل بانتظار المزامنة` : 'كافة البيانات متزامنة بالكامل'}
              </strong>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              {isOnline ? 'تتم المزامنة تلقائياً بالخلفية' : 'تتم المزامنة فور توفر الإنترنت'}
            </span>
          </div>
        </div>

        {firebaseFeedback && (
          <div className={`p-2.5 rounded-lg text-xs flex items-center justify-between border ${
            firebaseFeedback.success
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <div className="flex items-center gap-1.5">
              {firebaseFeedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{firebaseFeedback.message}</span>
            </div>
            <button
              onClick={() => setFirebaseFeedback(null)}
              className="text-xs font-bold underline cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}
      </div>

      {/* 2. SQL Server Configuration Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">إعدادات الربط بخادم الويب وقاعدة بيانات SQL</h3>
              <p className="text-[10px] text-slate-400 font-light">
                تهيئة الاتصال التلقائي بخادم API أو سرفر قواعد البيانات (PostgreSQL, MySQL, SQLite)
              </p>
            </div>
          </div>

          {isConfigSaved && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تم حفظ إعدادات السيرفر</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-3 text-xs">
          <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              id="enableSqlServer"
              checked={config.enabled}
              onChange={e => setConfig({ ...config, enabled: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded cursor-pointer"
            />
            <label htmlFor="enableSqlServer" className="text-slate-800 font-bold cursor-pointer">
              تفعيل مزامنة البيانات التلقائية مع خادم الويب الخارجي (Web Server API)
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                نوع قاعدة البيانات (SQL Dialect):
              </label>
              <select
                value={config.dbType}
                onChange={e => setConfig({ ...config, dbType: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
              >
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL / MariaDB</option>
                <option value="sqlite">SQLite 3</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                رابط نقطة المزامنة على خادم الويب (Server API Sync Endpoint):
              </label>
              <input
                type="url"
                value={config.serverUrl}
                onChange={e => setConfig({ ...config, serverUrl: e.target.value })}
                placeholder="https://api.yourdomain.com/accounting/sync أو http://localhost:3000/api/sync"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                اسم قاعدة البيانات (Database Name):
              </label>
              <input
                type="text"
                value={config.dbName}
                onChange={e => setConfig({ ...config, dbName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                مفتاح التوثيق / التوكن (API Key / Bearer Token):
              </label>
              <input
                type="password"
                value={config.apiKey || ''}
                onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                placeholder="••••••••••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                المزامنة الدورية التلقائية:
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="autoSyncCheck"
                  checked={config.autoSync}
                  onChange={e => setConfig({ ...config, autoSync: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
                <label htmlFor="autoSyncCheck" className="text-slate-700 text-xs cursor-pointer">
                  مزامنة كل {config.syncIntervalMinutes || 30} دقيقة
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-400 font-light flex items-center gap-2">
              <span>آخر مزامنة ناجحة:</span>
              <strong className="text-slate-700 font-mono">{lastSyncTime || 'لم تتم مزامنة بعد'}</strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg border border-blue-200 transition-colors cursor-pointer text-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'جارِ المزامنة...' : 'مزامنة فورية الآن مع الخادم'}</span>
              </button>

              <button
                type="submit"
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer text-xs"
              >
                <span>حفظ الإعدادات</span>
              </button>
            </div>
          </div>
        </form>

        {syncStatus && (
          <div
            className={`p-3 rounded-lg border flex items-center gap-2 text-xs ${
              syncStatus.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {syncStatus.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{syncStatus.message}</span>
          </div>
        )}
      </div>

      {/* 3. Direct SQL Backup Dump Generator */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">تصدير واستخراج نسخة SQL فورية (SQL Dump)</h3>
              <p className="text-[10px] text-slate-400 font-light">
                توليد ملف SQL كامل يحتوي على بنية الجداول (DDL) وكافة البيانات المحاسبية (INSERTs) جاهز للاستيراد في خادمك.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {(['postgres', 'mysql', 'sqlite'] as const).map(dialect => (
              <button
                key={dialect}
                type="button"
                onClick={() => setSelectedExportDialect(dialect)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                  selectedExportDialect === dialect
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {dialect === 'postgres' ? 'PostgreSQL' : dialect === 'mysql' ? 'MySQL' : 'SQLite'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => downloadSqlBackup(selectedExportDialect)}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-lg shadow-xs transition-colors cursor-pointer text-xs"
          >
            <Download className="w-4 h-4" />
            <span>تحميل ملف SQL ({selectedExportDialect.toUpperCase()})</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreviewSql(selectedExportDialect)}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer text-xs"
          >
            <FileCode className="w-4 h-4 text-slate-600" />
            <span>معاينة كود SQL</span>
          </button>
        </div>
      </div>

      {/* SQL Preview Modal */}
      {showSqlPreview && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-3xl w-full text-slate-800 space-y-3 animate-in fade-in zoom-in duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-purple-600" />
                <h4 className="font-bold text-sm text-slate-900">
                  معاينة كود SQL المولد ({selectedExportDialect.toUpperCase()})
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'تم النسخ' : 'نسخ الكود'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSqlPreview(false)}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-100 p-3.5 rounded-xl font-mono text-[11px] leading-relaxed select-all" dir="ltr">
              <pre className="whitespace-pre-wrap">{previewSqlContent}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
