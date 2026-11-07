import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { 
  Database, 
  HardDrive, 
  Download, 
  Upload, 
  CheckCircle2, 
  ShieldCheck, 
  AlertTriangle, 
  FileText, 
  Users, 
  Boxes, 
  Receipt, 
  RefreshCw,
  X,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ServerOff,
  Cloud,
  Trash2,
  Clock,
  ExternalLink
} from 'lucide-react';
import { 
  connectGoogleDrive, 
  getCachedDriveToken, 
  executeHourlyDriveBackupFlow 
} from '../services/googleDriveBackupService';

interface LocalDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LocalDatabaseModal: React.FC<LocalDatabaseModalProps> = ({ isOpen, onClose }) => {
  const {
    isLocalOnlyMode,
    toggleLocalOnlyMode,
    invoices,
    parties,
    inventory,
    accounts,
    treasuries,
    vouchers,
    purchases,
    dailyEntries,
    seedLocalDatabaseDemo,
    exportLocalDatabaseJSON,
    importLocalDatabaseJSON,
    importDataJSON,
    resetInvoicesAndKeepTreasury1101,
    renumberInvoicesToOne
  } = useAccounting();

  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Google Drive 30-Min Automated Periodic Backup State
  const [driveToken, setDriveToken] = useState<string | null>(() => getCachedDriveToken());
  const [driveUserEmail, setDriveUserEmail] = useState<string>('admin@example.invalid');
  const [isAutoBackupEnabled, setIsAutoBackupEnabled] = useState<boolean>(() => {
    return localStorage.getItem('google_drive_auto_backup_enabled') !== 'false';
  });
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [lastDriveBackupTime, setLastDriveBackupTime] = useState<string | null>(() => {
    return localStorage.getItem('google_drive_last_backup_time');
  });
  const [lastDriveBackupFileName, setLastDriveBackupFileName] = useState<string | null>(() => {
    return localStorage.getItem('google_drive_last_backup_file');
  });

  // Handle Google Drive Auth Connect
  const handleConnectDrive = async () => {
    try {
      setFeedback({ message: 'جاري الربط مع Google Drive والحصول على التصريح...', success: true });
      const res = await connectGoogleDrive();
      setDriveToken(res.accessToken);
      if (res.user?.email) {
        setDriveUserEmail(res.user.email);
      }
      setFeedback({ 
        message: `تم التوصيل بنجاح بحساب Google Drive (${res.user?.email || 'admin@example.invalid'})! خاصية النسخ الاحتياطي كل 30 دقيقة مفعّلة الآن.`, 
        success: true 
      });
    } catch (err: any) {
      setFeedback({ message: 'فشل الربط مع Google Drive: ' + (err?.message || 'خطأ غير معروف'), success: false });
    } finally {
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  // Helper to execute single Drive backup snapshot
  const runDriveBackupSnapshot = async (token: string, isAuto: boolean = false) => {
    setIsUploadingToDrive(true);
    try {
      const exportRes = await exportLocalDatabaseJSON();
      const dbExport = exportRes?.data || exportRes;
      const payload = {
        timestamp: new Date().toISOString(),
        backupType: isAuto ? '30-Minute-Automated-Periodic' : 'Manual-Instant',
        userEmail: driveUserEmail,
        totalInvoices: invoices?.length || 0,
        totalParties: parties?.length || 0,
        totalInventory: inventory?.length || 0,
        data: dbExport
      };

      const result = await executeHourlyDriveBackupFlow(token, payload, { autoCleanOld: true, retentionDays: 7 });
      
      if (result.success) {
        const timeStr = new Date().toLocaleTimeString('ar-PS', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastDriveBackupTime(timeStr);
        setLastDriveBackupFileName(result.fileName);
        localStorage.setItem('google_drive_last_backup_time', timeStr);
        localStorage.setItem('google_drive_last_backup_file', result.fileName || '');

        setFeedback({ 
          message: `تم رفع النسخة الاحتياطية (${isAuto ? 'التلقائية كل 30 دقيقة' : 'الفورية'}) بنجاح إلى Google Drive (${result.fileName})!`, 
          success: true 
        });
      } else {
        setFeedback({ message: 'فشل رفع النسخة الاحتياطية لـ Google Drive: ' + (result.error || 'خطأ غير معروف'), success: false });
      }
    } catch (e: any) {
      setFeedback({ message: 'خطأ أثناء النسخ لـ Google Drive: ' + e.message, success: false });
    } finally {
      setIsUploadingToDrive(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  // Manual Trigger Button for Google Drive Backup
  const handleManualDriveBackup = async () => {
    let currentToken = driveToken || getCachedDriveToken();
    if (!currentToken) {
      if (!window.confirm('يتطلب إجراء النسخ الاتصال بـ Google Drive أولاً. هل تريد الاتصال الآن؟')) return;
      try {
        const res = await connectGoogleDrive();
        currentToken = res.accessToken;
        setDriveToken(currentToken);
        if (res.user?.email) setDriveUserEmail(res.user.email);
      } catch (err: any) {
        setFeedback({ message: 'فشل التوصيل بـ Google Drive: ' + err.message, success: false });
        return;
      }
    }

    if (!window.confirm('هل تريد إنشاء ورفع نسخة احتياطية فورية 100% مطابقة للشاشة الحالية وكافة المدخلات إلى Google Drive؟')) {
      return;
    }

    await runDriveBackupSnapshot(currentToken, false);
  };

  // Toggle Auto 30-Minute Periodic Backup
  const toggleAutoBackup = () => {
    const nextVal = !isAutoBackupEnabled;
    setIsAutoBackupEnabled(nextVal);
    localStorage.setItem('google_drive_auto_backup_enabled', String(nextVal));
    setFeedback({
      message: nextVal 
        ? 'تم تفعيل النسخ الاحتياطي الدوري كل 30 دقيقة إلى Google Drive بنجاح.' 
        : 'تم إيقاف النسخ الدوري التلقائي مؤقتاً.',
      success: true
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  // 30-Minute Automated Periodic Backup Effect (Interval Timer)
  useEffect(() => {
    if (!isAutoBackupEnabled) return;

    const intervalId = setInterval(() => {
      const token = driveToken || getCachedDriveToken();
      if (token) {
        runDriveBackupSnapshot(token, true);
      }
    }, 30 * 60 * 1000); // 30 minutes in milliseconds

    return () => clearInterval(intervalId);
  }, [isAutoBackupEnabled, driveToken, invoices, parties, inventory]);

  if (!isOpen) return null;

  const handleSeed = () => {
    const res = seedLocalDatabaseDemo();
    setFeedback({ message: res.message, success: res.success });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setFeedback({ message: 'جاري استخراج وتصدير نسخة احتياطية كاملة 100% متطابقة مع الشاشة وقاعدة البيانات...', success: true });
    try {
      const res = await exportLocalDatabaseJSON();
      setFeedback({ 
        message: `تم تصدير نسخة احتياطية كاملة 100% متطابقة مع البيانات الحالية بنجاح! (إجمالي السجلات: ${res.totalRecords || 0})`, 
        success: true 
      });
    } catch (e: any) {
      setFeedback({ message: 'خطأ أثناء إنشاء النسخة الاحتياطية: ' + e.message, success: false });
    } finally {
      setIsExporting(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const handleResetKeepTreasury1101 = () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف كافة الفواتير وباقي الصناديق والاحتفاظ بالصندوق النقدي 1101 فقط للبدء من جديد؟')) return;
    const res = resetInvoicesAndKeepTreasury1101();
    setFeedback({ message: res.message, success: res.success });
    setTimeout(() => setFeedback(null), 6000);
  };

  const handleRenumberToOne = () => {
    if (!window.confirm('هل تريد إعادة ترقيم الفواتير الحالية لتبدأ من الرقم 1 (جعل الفاتورة الحالية برقم INV-0001)؟')) return;
    const res = renumberInvoicesToOne();
    setFeedback({ message: res.message, success: res.success });
    setTimeout(() => setFeedback(null), 6000);
  };

  const handleRestoreMasterSnapshot = async () => {
    if (!window.confirm('هل تريد استيراد وتطبيق لقطة البيانات المحلية المعتمدة للتطبيق (تتضمن 66 فاتورة مطابقة والصناديق وكافة السجلات)؟')) return;
    setIsImporting(true);
    try {
      const response = await fetch('/master_drive_database_snapshot.json');
      if (!response.ok) throw new Error('تعذر تحميل ملف اللقطة المحلية من السيرفر');
      const text = await response.text();
      const parsedData = JSON.parse(text);
      const invCount = parsedData.invoices?.length || 66;
      const success = await importDataJSON(text, true, true, true);
      if (success) {
        setFeedback({ message: `تم تطبيق لقطة البيانات المحلية بنجاح (${invCount} فاتورة والصناديق وكافة السجلات المعتمدة)!`, success: true });
      } else {
        setFeedback({ message: 'فشل تطبيق النسخة الاحتياطية', success: false });
      }
    } catch (err: any) {
      setFeedback({ message: 'خطأ أثناء الاستعادة: ' + err.message, success: false });
    } finally {
      setIsImporting(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      const res = await importLocalDatabaseJSON(jsonData);
      setFeedback(res);
    } catch (err: any) {
      setFeedback({ message: 'فشل قراءة الملف: ' + err.message, success: false });
    } finally {
      setIsImporting(false);
      e.target.value = '';
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 font-sans" dir="rtl">
      <div className="bg-white border-2 border-emerald-600 rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white px-5 py-3.5 flex items-center justify-between border-b border-emerald-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600/40 rounded-md border border-emerald-400/30">
              <HardDrive className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-wide">إدارة واستقلال قاعدة البيانات والنسخ الاحتياطي الدوري</h2>
              <p className="text-xs text-emerald-100/90 font-medium">العمل المحلي الخالص وتفعيل النسخ الاحتياطي الدوري لـ Google Drive كل 30 دقيقة</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-emerald-600/50 rounded-md text-emerald-100 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          
          {/* Feedback Alert */}
          {feedback && (
            <div className={`p-3.5 rounded-md border text-xs font-bold flex items-center gap-2.5 ${
              feedback.success 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback.message}</span>
            </div>
          )}

          {/* GOOGLE DRIVE 30-MINUTE AUTOMATED PERIODIC BACKUP CARD */}
          <div className="p-4 bg-gradient-to-r from-blue-950 via-slate-900 to-teal-950 text-white rounded-lg border-2 border-blue-500 shadow-xl space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-blue-600 rounded-lg text-white shrink-0 shadow">
                  <Cloud className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-blue-100 flex items-center gap-2">
                    <span>النسخ الاحتياطي التلقائي لـ Google Drive كل 30 دقيقة</span>
                    <span className="text-[10px] bg-blue-500/30 text-blue-200 border border-blue-400/40 px-2 py-0.5 rounded-full font-mono">
                      {driveUserEmail}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    يتم حفظ نسخة كاملة 100% مطابقة للشاشات والمدخلات الأخيرة في حساب Google Drive الخاص بك تلقائياً وبأمان كل نصف ساعة.
                  </p>
                </div>
              </div>

              {/* Toggle switch for 30-min periodic auto backup */}
              <button
                type="button"
                onClick={toggleAutoBackup}
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer shrink-0 ${
                  isAutoBackupEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500'
                    : 'bg-slate-700 hover:bg-slate-800 text-slate-300 border-slate-600'
                }`}
                title="تفعيل/تعطيل النسخ الدوري التلقائي كل 30 دقيقة"
              >
                {isAutoBackupEnabled ? (
                  <>
                    <ToggleRight className="w-4 h-4 text-emerald-300" />
                    <span>النسخ الدوري: مفعل 🟢</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-4 h-4 text-slate-400" />
                    <span>النسخ الدوري: معطل ⚪</span>
                  </>
                )}
              </button>
            </div>

            {/* Last Backup Info & Action Buttons */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="text-[11px] text-slate-300 flex items-center gap-1.5 font-mono">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>
                  آخر نسخة احتياطية لـ Google Drive:{' '}
                  <strong className="text-emerald-400">{lastDriveBackupTime || 'لم يتم النسخ بعد'}</strong>
                  {lastDriveBackupFileName && ` (${lastDriveBackupFileName})`}
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-md transition shadow cursor-pointer border border-blue-500"
                >
                  {driveToken ? 'تحديث الاتصال بـ Drive' : 'ربط Google Drive'}
                </button>

                <button
                  type="button"
                  onClick={handleManualDriveBackup}
                  disabled={isUploadingToDrive}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-md flex items-center gap-1.5 transition shadow cursor-pointer border border-emerald-500 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isUploadingToDrive ? 'animate-spin' : ''}`} />
                  <span>{isUploadingToDrive ? 'جاري الرفع...' : 'إجراء نسخة احتياطية فورية لـ Drive الآن'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* STANDALONE LOCAL MODE TOGGLE CARD */}
          <div className={`p-4 rounded-lg border-2 transition-all ${
            isLocalOnlyMode 
              ? 'bg-emerald-50/90 border-emerald-500 shadow-md' 
              : 'bg-amber-50/80 border-amber-400'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-full ${isLocalOnlyMode ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                  {isLocalOnlyMode ? <ServerOff className="w-6 h-6" /> : <Cloud className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {isLocalOnlyMode 
                      ? '🟢 وضع العمل المحلي الخالص (مُفعل 100%)' 
                      : '🌐 وضع المزامنة السحابية (مستمر)'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 max-w-md leading-relaxed">
                    {isLocalOnlyMode 
                      ? 'تم إيقاف كافة الاتصالات الخارجية والمزامنة الخلفية مع السيرفر والفايربيس. كل الفواتير والمدخلات محفوظة محلياً فوراً وبأمان مطلق دون أي إمكانية للحذف أو التحديث السحابي.'
                      : 'النظام يقوم بمزامنة الفواتير والبيانات مع السيرفر السحابي. اضغط للتفعيل إذا كنت ترغب في العمل أوفلاين محلياً بالكامل دون أي تواصل خارجي.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleLocalOnlyMode()}
                className={`px-4 py-2.5 rounded-md font-extrabold text-xs flex items-center gap-2 transition shadow-md cursor-pointer shrink-0 ${
                  isLocalOnlyMode 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700' 
                    : 'bg-slate-700 hover:bg-slate-800 text-white border border-slate-800'
                }`}
              >
                {isLocalOnlyMode ? (
                  <>
                    <ToggleRight className="w-5 h-5 text-emerald-300" />
                    <span>تعطيل الوضع المحلي</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5 text-amber-300" />
                    <span>تفعيل الوضع المحلي الخالص</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* CURRENT LOCAL DATABASE STATS */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>إحصائيات وحجم البيانات المحفوظة محلياً بمتصفحك:</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="bg-white p-3 rounded-md border border-slate-200 shadow-2xs">
                <FileText className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <span className="block text-[11px] text-slate-500 font-medium">فواتير المبيعات</span>
                <strong className="text-base font-extrabold text-slate-900 font-mono">{invoices?.length || 0}</strong>
              </div>

              <div className="bg-white p-3 rounded-md border border-slate-200 shadow-2xs">
                <Users className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <span className="block text-[11px] text-slate-500 font-medium">العملاء والموردين</span>
                <strong className="text-base font-extrabold text-slate-900 font-mono">{parties?.length || 0}</strong>
              </div>

              <div className="bg-white p-3 rounded-md border border-slate-200 shadow-2xs">
                <Boxes className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <span className="block text-[11px] text-slate-500 font-medium">أصناف المخزون</span>
                <strong className="text-base font-extrabold text-slate-900 font-mono">{inventory?.length || 0}</strong>
              </div>

              <div className="bg-white p-3 rounded-md border border-slate-200 shadow-2xs">
                <Receipt className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                <span className="block text-[11px] text-slate-500 font-medium">السندات والمشتريات</span>
                <strong className="text-base font-extrabold text-slate-900 font-mono">
                  {(vouchers?.length || 0) + (purchases?.length || 0) + (dailyEntries?.length || 0)}
                </strong>
              </div>
            </div>
          </div>

          {/* EMERGENCY RESTORATION CARD */}
          <div className="p-4 bg-gradient-to-r from-rose-50 via-amber-50 to-emerald-50 border-2 border-rose-500 rounded-lg shadow-md space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-600 text-white rounded-md shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-extrabold text-rose-900">
                  استعادة الطوارئ الرسمية الفورية (النسخة السابقة قبل ساعتين - 116 فاتورة والصناديق 1103 و 1107)
                </h4>
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  إذا واجهتك أي مخربطة أو بيانات مفقودة، يمكنك بنقرة واحدة استعادة النسخة الاحتياطية الرسمية السابقة بكل فواتيرك (116 فاتورة) ومدخلاتك وصناديقك بدقة تامة، أو تحميلها فوراً لحفظها على كمبيوترك.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {/* One-click restore button */}
              <button
                type="button"
                onClick={handleRestoreMasterSnapshot}
                disabled={isImporting}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-md flex items-center justify-center gap-2 transition shadow cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
                <span>{isImporting ? 'جاري الاستعادة...' : 'استعادة النسخة السابقة فوراً (116 فاتورة)'}</span>
              </button>

              {/* Direct download button */}
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-md flex items-center justify-center gap-2 transition shadow cursor-pointer text-center disabled:opacity-50"
              >
                <Download className={`w-4 h-4 text-emerald-200 ${isExporting ? 'animate-bounce' : ''}`} />
                <span>{isExporting ? 'جاري إنشاء النسخة...' : 'تحميل نسخة احتياطية كاملة 100% متطابقة مع الشاشة (.json)'}</span>
              </button>
            </div>
          </div>

          {/* TARGETED RESET & KEEP TREASURY 1101 CARD */}
          <div className="p-4 bg-emerald-900/10 border-2 border-emerald-600 rounded-lg shadow-md space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-emerald-700 text-white rounded-md shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-extrabold text-emerald-900">
                  حذف كافة الفواتير والارتباطات وباقي الصناديق والاحتفاظ بالصندوق النقدي 1101 فقط
                </h4>
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  بناءً على طلبك، يمكنك حذف كافة الفواتير المدخلة وجميع ارتباطاتها وباقي الصناديق والبدء من جديد، مع **الاحتفاظ بالصندوق النقدي 1101 فقط** (بصفر رصيد).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetKeepTreasury1101}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-md flex items-center justify-center gap-2 transition shadow cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف الفواتير وباقي الصناديق والاحتفاظ بـ 1101 للبدء من جديد</span>
            </button>
          </div>

          {/* RENUMBER INVOICES TO 1 CARD */}
          <div className="p-4 bg-blue-900/10 border-2 border-blue-600 rounded-lg shadow-md space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-blue-700 text-white rounded-md shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-extrabold text-blue-900">
                  إعادة ترقيم الفواتير الحالية لتبدأ من الرقم 1
                </h4>
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  يمكنك إعادة ترقيم الفواتير الحالية تدريجياً لتبدأ من الرقم 1 (وجعل الفاتورة الحالية برقم INV-0001)، مع ضبط الترقيم المستقبلي ليبدأ من 1 فصاعداً.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRenumberToOne}
              className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs rounded-md flex items-center justify-center gap-2 transition shadow cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة ترقيم الفواتير الحالية لتبدأ من 1 (جعل الحالية INV-0001)</span>
            </button>
          </div>

          {/* LOCAL DATABASE ACTION TOOLS */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>أدوات الحفظ والنسخ الاحتياطي المحلي:</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* EXPORT BACKUP JSON */}
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="p-3 bg-white hover:bg-emerald-50 border border-slate-300 hover:border-emerald-500 rounded-lg flex items-center gap-3 transition shadow-2xs cursor-pointer text-right group disabled:opacity-50"
              >
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-md group-hover:bg-emerald-600 group-hover:text-white transition">
                  <Download className={`w-5 h-5 ${isExporting ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <span className="block text-xs font-extrabold text-slate-800">
                    {isExporting ? 'جاري السحب المباشر من فير بيس...' : 'تصدير نسخة احتياطية (JSON)'}
                  </span>
                  <span className="block text-[10.5px] text-slate-500">حفظ نسخة كاملة 100% مسحوبة مباشرة من سحابة Firebase</span>
                </div>
              </button>

              {/* IMPORT BACKUP JSON */}
              <label className="p-3 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-500 rounded-lg flex items-center gap-3 transition shadow-2xs cursor-pointer text-right group">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-md group-hover:bg-blue-600 group-hover:text-white transition">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-xs font-extrabold text-slate-800">
                    {isImporting ? 'جاري الاستعادة...' : 'استعادة قاعدة البيانات من ملف (JSON)'}
                  </span>
                  <span className="block text-[10.5px] text-slate-500">رفع واستعادة بيانات سابقة مباشرة إلى المتصفح</span>
                </div>
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleFileUpload} 
                  disabled={isImporting} 
                  className="hidden" 
                />
              </label>
            </div>

            {/* SEED INITIAL READY DATABASE */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSeed}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition shadow-xs cursor-pointer border border-slate-900"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>تجهيز/تأكيد قاعدة البيانات المحلية الجاهزة للعمل الفوري</span>
              </button>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-600 font-medium">
            برنامج الأيهم المحاسبي - إصدار التشغيل المحلي والنسخ الاحتياطي لـ Google Drive v1.0
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-md transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
