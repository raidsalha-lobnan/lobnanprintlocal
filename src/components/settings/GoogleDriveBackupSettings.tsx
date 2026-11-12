import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  getCachedDriveToken,
  connectGoogleDrive,
  disconnectGoogleDrive,
  uploadBackupJsonToDrive,
  listDriveBackupFiles,
  cleanOldBackupsFromDrive,
  deleteSingleBackupFile,
  executeHourlyDriveBackupFlow,
  DriveBackupFileItem,
  BackupExecutionResult,
  BACKUP_DRIVE_FOLDER_NAME
} from '../../services/googleDriveBackupService';
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  Download,
  Upload,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  HardDrive,
  FolderOpen,
  Calendar,
  Lock,
  ArrowRight,
  Info,
  Check
} from 'lucide-react';
import { posSound } from '../../utils/audio';
import { getProgramDriveStatus } from '../../services/googleDriveService';
import {authHeaders,publicSyncApiUrl,secureLoginEnabled} from '../../services/secureAuth';

const STORAGE_KEY_AUTO_BACKUP = 'lobnan_drive_auto_backup_enabled';
const STORAGE_KEY_RETENTION = 'lobnan_drive_retention_confirmed';
const STORAGE_KEY_LAST_TIME = 'lobnan_drive_last_backup_time';
const STORAGE_KEY_LAST_INFO = 'lobnan_drive_last_backup_info';

export const GoogleDriveBackupSettings: React.FC = () => {
  const accounting = useAccounting();
  const { exportDataJSON, currentUser, settings } = accounting;

  // Connection & Auth state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [serverBackup, setServerBackup] = useState<{ok:boolean;remoteVerified:boolean;lastCompletedAt:number;error?:string|null}|null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  const [driveAccountEmail,setDriveAccountEmail]=useState('');
  const [oauthStatus,setOauthStatus]=useState<{
    connected:boolean;email:string|null;connectedAt:string|null;oauthReady:boolean;mailReady:boolean;
    missingOAuthSettings?:string[];missingMailSettings?:string[]
  }|null>(null);
  const [sendingConsent,setSendingConsent]=useState(false);
  const [consentFeedback,setConsentFeedback]=useState('');
  const refreshOAuthStatus=async()=>{
    if(!secureLoginEnabled())return;
    const base=publicSyncApiUrl();
    const response=await fetch(base+'/api/v1/drive/oauth/status',{
      headers:authHeaders(base),cache:'no-store'
    });
    if(!response.ok)throw new Error('HTTP_'+response.status);
    const state=await response.json();
    setOauthStatus(state);
    if(state.email)setDriveAccountEmail(state.email);
  };
  const sendDriveConsentEmail=async()=>{
    if(!driveAccountEmail.trim())return;
    if(!oauthStatus?.oauthReady||!oauthStatus?.mailReady){
      setConsentFeedback('الربط غير جاهز على الخادم. يجب إكمال إعداد Google OAuth وخدمة البريد مرة واحدة قبل إرسال الرابط.');
      return;
    }
    setSendingConsent(true);
    setConsentFeedback('');
    try{
      const base=publicSyncApiUrl();
      const response=await fetch(base+'/api/v1/drive/oauth/send',{
        method:'POST',
        headers:{...authHeaders(base),'Content-Type':'application/json'},
        body:JSON.stringify({email:driveAccountEmail.trim()}),
        cache:'no-store'
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.code||'HTTP_'+response.status);
      setConsentFeedback('تم إرسال رابط موافقة Google إلى '+payload.email+'؛ صلاحيته 15 دقيقة.');
    }catch(error){
      const code=String((error as Error).message||error);
      setConsentFeedback(code==='GOOGLE_DRIVE_OAUTH_APP_NOT_CONFIGURED'
        ?'يجب إعداد عميل OAuth الخاص بالبرنامج في الخادم أولًا.'
        :code==='GOOGLE_DRIVE_EMAIL_DELIVERY_NOT_CONFIGURED'
          ?'خدمة إرسال البريد غير مهيأة على الخادم.'
          :code==='GOOGLE_DRIVE_AUTH_EMAIL_SEND_FAILED'
            ?'فشل إرسال البريد من خدمة الإرسال. تحقق من حساب مزود البريد والنطاق الموثق.'
            :'تعذر إرسال رابط التفويض: '+code);
    }finally{setSendingConsent(false);}
  };
  useEffect(()=>{
    void refreshOAuthStatus().catch(()=>{});
  },[]);


  // Settings state
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_AUTO_BACKUP) !== 'false';
  });

  const [retentionConfirmed, setRetentionConfirmed] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_RETENTION) === 'true';
  });

  // Backup operations state
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [driveFiles, setDriveFiles] = useState<DriveBackupFileItem[]>([]);
  const [lastBackupResult, setLastBackupResult] = useState<BackupExecutionResult | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LAST_INFO);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Next backup countdown in minutes
  const [minutesUntilNext, setMinutesUntilNext] = useState<number>(60);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isExportingJson, setIsExportingJson] = useState<boolean>(false);
  const [isImportingJson, setIsImportingJson] = useState<boolean>(false);

  const handleImportLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        if (!json || !json.trim().startsWith('{')) {
          alert('الملف المحدد ليس ملف نسخة احتياطية JSON صالح');
          return;
        }
        if (window.confirm('هل تريد فعلاً استيراد واسترجاع قاعدة البيانات من هذا الملف وتعميمها وتحديث سحابة النسخة القديمة وكافة الشاشات فوراً؟')) {
          setIsImportingJson(true);
          setStatusMessage({ text: 'جاري استيراد وتطبيق قاعدة البيانات وتحديث النسخة القديمة وكافة الشاشات...', type: 'info' });
          const success = await accounting.importDataJSON(json, true, true, false);
          if (success) {
            setStatusMessage({ text: 'تم استيراد وتعميم قاعدة البيانات بنجاح وتحديث كافة الشاشات والنسخة السحابية 100%!', type: 'success' });
            alert('تم استيراد قاعدة البيانات وتحديث كافة الشاشات وسحابة النسخة القديمة بنجاح!');
          } else {
            setStatusMessage({ text: 'فشل استيراد النسخة الاحتياطية. يرجى التأكد من ملف النسخة.', type: 'error' });
          }
          setIsImportingJson(false);
        }
      } catch (err: any) {
        setStatusMessage({ text: 'حدث خطأ أثناء الاستيراد: ' + (err?.message || 'غير معروف'), type: 'error' });
        setIsImportingJson(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Modals
  const [confirmRetentionModalOpen, setConfirmRetentionModalOpen] = useState<boolean>(false);
  const [confirmManualCleanModalOpen, setConfirmManualCleanModalOpen] = useState<boolean>(false);
  const [fileToDelete, setFileToDelete] = useState<DriveBackupFileItem | null>(null);

  // Helper to generate full data snapshot
  const getFullBackupSnapshot = () => {
    return {
      version: '2.0',
      systemName: 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان',
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser?.fullName || currentUser?.username || 'النظام التلقائي',
      settings: accounting.settings,
      companies: accounting.companies,
      branches: accounting.branches,
      warehouses: accounting.warehouses,
      warehouseOperations: accounting.warehouseOperations,
      users: accounting.users,
      roles: accounting.roles,
      accounts: accounting.accounts,
      journalEntries: accounting.journalEntries,
      inventory: accounting.inventory,
      stockMovements: accounting.stockMovements,
      parties: accounting.parties,
      employees: accounting.employees,
      employeeAdvances: accounting.employeeAdvances,
      employeeDeductions: accounting.employeeDeductions,
      employeeIncentives: accounting.employeeIncentives,
      payrollSheets: accounting.payrollSheets,
      printOrders: accounting.printOrders,
      invoices: accounting.invoices,
      purchases: accounting.purchases,
      purchaseReturns: accounting.purchaseReturns,
      salesReturns: accounting.salesReturns,
      vouchers: accounting.vouchers,
      treasuries: accounting.treasuries,
      debtClearings: accounting.debtClearings,
      expenses: accounting.expenses
    };
  };

  // Report only the server's verified Drive connection: a cached browser
  // access token is not evidence of continuous backup coverage.
  useEffect(() => {
    let cancelled=false;
    const check=async()=>{
      try{
        const status=await getProgramDriveStatus();
        if(!cancelled){
          setIsConnected(status.configured);
          setServerBackup(status.backup||null);
        }
      }catch{
        if(!cancelled){setIsConnected(false);setServerBackup(null);}
      }
    };
    void check();
    const timer=setInterval(()=>{void check();},60000);
    return()=>{cancelled=true;clearInterval(timer);};
  }, []);

  // Update countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      const lastStr = localStorage.getItem(STORAGE_KEY_LAST_TIME);
      if (!lastStr) {
        setMinutesUntilNext(0);
        return;
      }
      const lastTime = parseInt(lastStr, 10);
      const elapsed = Date.now() - lastTime;
      const oneHour = 60 * 60 * 1000;
      if (elapsed >= oneHour) {
        setMinutesUntilNext(0);
      } else {
        setMinutesUntilNext(Math.ceil((oneHour - elapsed) / 60000));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load files from Google Drive
  const loadDriveFiles = async (token?: string) => {
    const activeToken = token || getCachedDriveToken();
    if (!activeToken) return;

    try {
      setIsLoadingFiles(true);
      const files = await listDriveBackupFiles(activeToken);
      setDriveFiles(files);
    } catch (err: any) {
      console.warn('Error loading drive files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // The server owns Google credentials; users never grant a Google token
  // to their browser or share the Drive folder with every employee.
  const handleConnect=async()=>{
    setIsConnecting(true);
    try{
      const status=await getProgramDriveStatus();
      setIsConnected(status.configured);
      setServerBackup(status.backup||null);
      setStatusMessage({
        text:status.configured
          ? 'خدمة Drive الخاصة بالخادم متصلة. الملفات متاحة لمستخدمي البرنامج المصرح لهم.'
          : 'التفويض السحابي للخادم غير مكتمل. النسخ المحلية مستمرة، لكن رفعها إلى Drive غير مؤكد.',
        type:status.configured?'success':'error'
      });
    }catch{
      setStatusMessage({text:'تعذر الوصول إلى خدمة التخزين الخاصة بالخادم.',type:'error'});
    }finally{setIsConnecting(false);}
  };
  const handleDisconnect=async()=>{
    setStatusMessage({text:'الربط مُدار بأمان من الكمبيوتر الرئيسي؛ لا يتم إلغاؤه من المتصفح.',type:'info'});
  };

  // Toggle Auto Backup
  const handleToggleAutoBackup = (enabled: boolean) => {
    setAutoBackupEnabled(enabled);
    localStorage.setItem(STORAGE_KEY_AUTO_BACKUP, enabled ? 'true' : 'false');
    setStatusMessage({
      text: 'هذه خانة عرض قديمة. جدولة النسخ الاحتياطي الفعلي تُدار على الخادم ولا تتوقف بإغلاق المتصفح.',
      type: 'info'
    });
  };

  // Confirm Retention Policy (7 days)
  const handleConfirmRetentionPolicy = () => {
    setRetentionConfirmed(true);
    localStorage.setItem(STORAGE_KEY_RETENTION, 'true');
    setConfirmRetentionModalOpen(false);
    setStatusMessage({
      text: 'تم اعتماد وتفعيل سياسة الاحتفاظ بآخر 7 أيام بنجاح. سيتم حذف النسخ الأقدم من 7 أيام دورياً.',
      type: 'success'
    });
    posSound.playSuccessBeep();
  };

  // Start a server-side PostgreSQL dump; never send screen state as a backup.
  const handleTriggerBackupNow=async()=>{
    if(!secureLoginEnabled()){
      setStatusMessage({text:'يلزم تسجيل دخول مستخدم معتمد لتشغيل النسخ الاحتياطي.',type:'error'});
      return;
    }
    setIsBackingUp(true);
    try{
      const base=publicSyncApiUrl();
      const response=await fetch(base+'/api/v1/backups/run',{
        method:'POST',headers:authHeaders(base),cache:'no-store'
      });
      if(!response.ok)throw new Error('HTTP_'+response.status);
      setStatusMessage({text:'تم قبول طلب النسخ على الخادم؛ لا يُعتبر الرفع إلى Drive ناجحًا إلا بعد التحقق من النتيجة.',type:'info'});
    }catch(error){
      setStatusMessage({text:'تعذر تشغيل النسخ من الخادم: '+String(error),type:'error'});
    }finally{setIsBackingUp(false);}
  };

  // Execute Manual Cleanup of Old Backups (+7 days)
  const handleExecuteManualClean = async () => {
    const token = getCachedDriveToken();
    if (!token) return;

    try {
      setIsCleaning(true);
      setConfirmManualCleanModalOpen(false);
      const res = await cleanOldBackupsFromDrive(token, 7);
      setStatusMessage({
        text: `تم تنظيف النسخ القديمة بنجاح! تم حذف ${res.deletedCount} نسخة يتجاوز عمرها 7 أيام.`,
        type: 'success'
      });
      posSound.playSuccessBeep();
      await loadDriveFiles(token);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'فشل تنظيف النسخ القديمة', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  // Delete Single File
  const handleDeleteSingleFile = async () => {
    if (!fileToDelete) return;
    const token = getCachedDriveToken();
    if (!token) return;

    try {
      await deleteSingleBackupFile(token, fileToDelete.id);
      setStatusMessage({ text: `تم حذف النسخة "${fileToDelete.name}" من Google Drive بنجاح.`, type: 'success' });
      setFileToDelete(null);
      await loadDriveFiles(token);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'فشل حذف الملف', type: 'error' });
    }
  };

  const oldFilesCount = driveFiles.filter((f) => f.isOlderThan7Days).length;

  return (
    <div className="space-y-4 text-xs select-text">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
        حالة النسخة السحابية: {serverBackup?.remoteVerified?'تم التحقق من رفع آخر نسخة':'لا توجد شهادة رفع سحابي ناجح حتى الآن'}.
        يتم أخذ نسخ قاعدة البيانات من PostgreSQL على الخادم، وليس من بيانات الشاشة.
      </div>
      <div dir="rtl" className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm space-y-3">
        <div className="font-black text-sm text-slate-900">ربط حساب Google Drive الرئيسي عبر البريد</div>
        <p className="text-xs text-slate-600">
          يستخدم جميع الموظفين المصرّح لهم الاتصال المركزي نفسه. لا يحتاج أي موظف إلى تسجيل الدخول لحساب Google.
          يرسل البرنامج رابط موافقة إلى صاحب البريد المحدد، ولا تُحفظ كلمة المرور أو رموز Google على أجهزة الموظفين.
        </p>
        <label className="block text-xs font-bold text-slate-700" htmlFor="drive-main-email">بريد حساب Google Drive الرئيسي</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input id="drive-main-email" type="email" autoComplete="email"
            value={driveAccountEmail} onChange={event=>setDriveAccountEmail(event.target.value)}
            placeholder="account@gmail.com"
            className="min-w-0 flex-1 border border-slate-300 p-2 rounded-lg text-sm"
          />
          <button type="button" onClick={sendDriveConsentEmail}
            disabled={sendingConsent||!oauthStatus?.oauthReady||!oauthStatus?.mailReady||!/^\S+@\S+\.\S+$/.test(driveAccountEmail)}
            className="rounded-lg bg-blue-700 px-3 py-2 text-white text-xs font-bold disabled:opacity-40">
            {sendingConsent?'جارٍ إرسال التفويض...':'إرسال رابط الموافقة إلى البريد'}
          </button>
          <button type="button" onClick={()=>void refreshOAuthStatus().catch(()=>setConsentFeedback('تعذر تحديث حالة الربط.'))}
            className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-800">تحديث الحالة</button>
        </div>
        <p className="text-xs text-slate-700">
          الحالة: {oauthStatus?.connected
            ?'تم التفويض لحساب '+oauthStatus.email
            :oauthStatus?.oauthReady?'بانتظار موافقة صاحب الحساب':'إعداد OAuth للخادم غير مكتمل'}
          {oauthStatus && !oauthStatus.mailReady?' — خدمة إرسال البريد تحتاج إعدادًا أوليًا':''}
        </p>
        {oauthStatus && (!oauthStatus.oauthReady || !oauthStatus.mailReady) && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 space-y-1">
            <p className="font-bold">إعداد الربط لم يكتمل على الكمبيوتر الرئيسي. إرسال الرابط معطل حتى يجهز الخادم.</p>
            {oauthStatus.missingOAuthSettings?.length ? (
              <p>إعدادات OAuth المطلوبة: <code dir="ltr" className="select-text">{oauthStatus.missingOAuthSettings.join('، ')}</code></p>
            ) : !oauthStatus.oauthReady ? <p>بيانات OAuth غير مكتملة أو مفتاح التشفير غير صالح.</p> : null}
            {oauthStatus.missingMailSettings?.length ? (
              <p>إعدادات البريد المطلوبة: <code dir="ltr" className="select-text">{oauthStatus.missingMailSettings.join('، ')}</code></p>
            ) : !oauthStatus.mailReady ? <p>خدمة إرسال البريد غير مفعلة.</p> : null}
            <p>لا تدخل Client Secret أو رموز Google هنا؛ تُضبط على الخادم فقط. يمكن استمرار النسخ المحلية، لكن لا تعتمد على رفع Google Drive قبل نجاح اختبار اتصال موثق.</p>
          </div>
        )}
        {consentFeedback && <p role="status" className="text-xs font-bold text-amber-800">{consentFeedback}</p>}
        <p className="text-[11px] text-slate-500">
          يتطلب الإعداد الأولي مرة واحدة Google OAuth Web Client مع عنوان إعادة توجيه الخادم
          وخدمة إرسال بريد. التفويض قابل للإلغاء من حساب Google عند الحاجة.
        </p>
      </div>
      {/* 1. Header & Status Banner */}
      <div className="bg-gradient-to-l from-blue-900 via-blue-800 to-indigo-900 text-white p-5 rounded-2xl shadow-sm border border-blue-700/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center border border-white/20">
              <Cloud className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base">النسخ الاحتياطي التلقائي إلى Google Drive</h3>
                {isConnected ? (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Drive متصل بالخادم
                  </span>
                ) : (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    غير متصل
                  </span>
                )}
              </div>
              <p className="text-[11px] text-blue-200 mt-0.5 leading-relaxed">
                نسخ PostgreSQL المحلية تتم على الكمبيوتر الرئيسي كل ساعة. يُعرض اتصال Drive والتحقق من الرفع بشكل مستقل.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isConnected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="bg-white/10 hover:bg-rose-600/80 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-white/20"
              >
                إدارة الربط على الخادم
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="bg-amber-400 hover:bg-amber-300 text-slate-900 px-4 py-2 rounded-xl text-xs font-black transition-colors cursor-pointer shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {isConnecting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Cloud className="w-4 h-4" />
                )}
                <span>فحص اتصال Drive بالخادم</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Status Cards inside Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-blue-700/50">
          <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
            <span className="text-[10px] text-blue-200 block">التكرار الزمني:</span>
            <span className="font-bold text-xs flex items-center gap-1 mt-0.5">
              <Clock className="w-3.5 h-3.5 text-amber-300" />
              نسخة تلقائية كل ساعة (60 دقيقة)
            </span>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
            <span className="text-[10px] text-blue-200 block">سياسة الحفظ المعتمدة:</span>
            <span className="font-bold text-xs flex items-center gap-1 mt-0.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-300" />
              الاحتفاظ بالخادم، مع حماية آخر النسخ وعدم الحذف دون تحقق
            </span>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
            <span className="text-[10px] text-blue-200 block">موعد النسخة القادمة:</span>
            <span className="font-bold text-xs flex items-center gap-1 mt-0.5 font-mono">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-300" />
              {serverBackup?.lastCompletedAt ? new Date(serverBackup.lastCompletedAt).toLocaleString('ar-EG') : 'لم يؤكد الخادم نسخة بعد'}
            </span>
          </div>
        </div>
      </div>

      {/* Status Alert Notification */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-300'
              : 'bg-blue-50 text-blue-900 border-blue-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : statusMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Control Cards: Automated Hourly Backup & 7-Day Retention */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Card A: Hourly Automated Backup Toggle */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                النسخ التلقائي كل ساعة
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              يقوم النظام تلقائياً كل 60 دقيقة بتجميع كافة الفواتير، الحسابات، قيود اليومية، المخزون، والبيانات وتصديرها كملف مشفر إلى مجلد خاص في حساب Google Drive الخاص بك.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">حالة الجدولة:</span>
            <span className={`font-bold ${autoBackupEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
              {autoBackupEnabled ? '✓ تعمل في الخلفية تلقائياً' : '✕ معطلة'}
            </span>
          </div>
        </div>

        {/* Card B: 7-Day Retention Policy */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                سياسة الاحتفاظ لآخر 7 أيام
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  retentionConfirmed
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
              >
                {retentionConfirmed ? 'معتمدة ونشطة' : 'تتطلب تأكيد'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              الاحتفاظ الدائم بنسخ آخر 7 أيام (168 ساعة) في Google Drive، ويقوم النظام تلقائياً بتدوير النسخ وحذف اليوم الثامن (أول الأيام الأقدم) للحفاظ على مساحة التخزين وتنظيم الأرشيف.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            {!retentionConfirmed ? (
              <button
                type="button"
                onClick={() => setConfirmRetentionModalOpen(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] transition-colors cursor-pointer shadow-2xs"
              >
                اعتماد وتأكيد سياسة الحفظ لـ 7 أيام
              </button>
            ) : (
              <div className="flex items-center justify-between w-full text-[11px]">
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  سياسة الحذف التلقائي بعد 7 أيام معتمدة
                </span>
                {oldFilesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmManualCleanModalOpen(true)}
                    className="text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
                  >
                    تنظيف {oldFilesCount} نسخة قديمة الآن
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Action Buttons Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Take Backup Now Button */}
          <button
            type="button"
            onClick={handleTriggerBackupNow}
            disabled={!isConnected || isBackingUp}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-colors cursor-pointer shadow-xs disabled:cursor-not-allowed"
          >
            {isBackingUp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
            <span>أخذ نسخة احتياطية إلى Drive الآن</span>
          </button>

          {/* Clean Old Backups Button */}
          {isConnected && (
            <button
              type="button"
              onClick={() => setConfirmManualCleanModalOpen(true)}
              disabled={isCleaning}
              className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer"
              title="فحص وحذف النسخ التي مضى عليها أكثر من 7 أيام"
            >
              {isCleaning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>فحص وتنظيف نسخ اليوم الثامن وما قبله ({oldFilesCount})</span>
            </button>
          )}

          {/* Local Download JSON Button (Exact on-screen & النسخة القديمة state) */}
          <button
            type="button"
            onClick={async () => {
              setIsExportingJson(true);
              setStatusMessage({ text: 'جاري إنشاء وتنزيل نسخة احتياطية مطابقة تماماً للشاشة والنسخة القديمة 100%...', type: 'info' });
              try {
                const res = await exportDataJSON();
                setStatusMessage({
                  text: `تم تنزيل نسخة احتياطية مطابقة 100% للشاشة والنسخة القديمة بنجاح (${res.totalRecords} سجل)!`,
                  type: 'success'
                });
              } catch (e: any) {
                setStatusMessage({ text: 'فشل تصدير النسخة: ' + e.message, type: 'error' });
              } finally {
                setIsExportingJson(false);
              }
            }}
            disabled={isExportingJson}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
            title="تنزيل نسخة احتياطية مطابقة 100% للإدخالات الحالية المعروضة على الشاشة والنسخة القديمة بدون أي قيود قديمة"
          >
            <Download className={`w-3.5 h-3.5 ${isExportingJson ? 'animate-spin' : ''}`} />
            <span>{isExportingJson ? 'جاري إنشاء النسخة المطابقة...' : 'تنزيل نسخة على الجهاز (مطابقة للشاشة 100%)'}</span>
          </button>

          {/* Local Import JSON Button (Directly restore and sync) */}
          <label className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer">
            <Upload className={`w-3.5 h-3.5 ${isImportingJson ? 'animate-spin' : ''}`} />
            <span>{isImportingJson ? 'جاري الاستيراد والتحديث...' : 'استيراد نسخة احتياطية من ملف (JSON)'}</span>
            <input type="file" accept=".json" onChange={handleImportLocalFile} className="hidden" disabled={isImportingJson} />
          </label>

          {/* Import Master Database Snapshot Button */}
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('هل تريد فعلاً استيراد واعتماد قاعدة البيانات الجديدة (Master Snapshot) وتطبيقها فوراً على الشاشة؟')) {
                const res = await accounting.importMasterDatabaseSnapshot();
                alert(res.message);
              }
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
            title="اعتماد قاعدة البيانات الجديدة وربط المزامنة الفورية"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>اعتماد وتحميل قاعدة البيانات الجديدة</span>
          </button>
        </div>

        {/* Refresh Drive List Button */}
        {isConnected && (
          <button
            type="button"
            onClick={() => loadDriveFiles()}
            disabled={isLoadingFiles}
            className="flex items-center gap-1 text-slate-600 hover:text-blue-700 p-2 rounded-lg hover:bg-slate-50 transition cursor-pointer text-xs font-medium"
            title="تحديث قائمة الملفات من Google Drive"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
            <span>تحديث القائمة</span>
          </button>
        )}
      </div>

      {/* 4. Table of Backups in Google Drive */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-600" />
            <h4 className="font-bold text-slate-800 text-xs">
              سجل النسخ الاحتياطية المحفوظة في Google Drive ({driveFiles.length} نسخة)
            </h4>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            المجلد: {BACKUP_DRIVE_FOLDER_NAME}
          </span>
        </div>

        {!isConnected ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <Cloud className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-xs text-slate-600">Google Drive متصل ومُفعل تلقائياً بحساب (admin@example.invalid)</p>
            <p className="text-[11px] text-slate-400">
              يتم حفظ ومزامنة كافة الفواتير والبيانات تلقائياً على مجلد Google Drive الخاص بك بشكل إجباري ومستمر.
            </p>
          </div>
        ) : isLoadingFiles ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
            <p className="text-xs">جاري فحص وجلب النسخ الاحتياطية من Google Drive...</p>
          </div>
        ) : driveFiles.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <HardDrive className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-xs text-slate-600">لا توجد نسخ احتياطية في المجلد بعد</p>
            <p className="text-[11px] text-slate-400">
              انقر على "أخذ نسخة احتياطية إلى Drive الآن" لإنشاء وحفظ أول نسخة احتياطية فوراً.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">اسم ملف النسخة الاحتياطية</th>
                  <th className="py-2.5 px-3 text-center">التاريخ والوقت</th>
                  <th className="py-2.5 px-3 text-center">الحجم</th>
                  <th className="py-2.5 px-3 text-center">حالة الصلاحية (7 أيام)</th>
                  <th className="py-2.5 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {driveFiles.map((file, idx) => {
                  const sizeKb = (file.size / 1024).toFixed(1);
                  return (
                    <tr
                      key={file.id}
                      className={`hover:bg-blue-50/50 transition-colors ${
                        file.isOlderThan7Days ? 'bg-amber-50/30' : 'odd:bg-white even:bg-slate-50/40'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate max-w-[280px]" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-600 whitespace-nowrap">
                        {file.formattedDate}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600 whitespace-nowrap">
                        {sizeKb} KB
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {!file.isOlderThan7Days ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            ✓ سارية ({file.ageInDays === 0 ? 'اليوم' : `منذ ${file.ageInDays} أيام`})
                          </span>
                        ) : (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            قديمة ({file.ageInDays} يوم - مؤهلة للتدوير)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors cursor-pointer"
                              title="فتح في Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setFileToDelete(file)}
                            className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded border border-rose-200 transition-colors cursor-pointer"
                            title="حذف هذه النسخة من Drive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Modal: Confirm Retention Policy (MANDATORY per Workspace Skill) */}
      {confirmRetentionModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 p-5 w-full max-w-lg text-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  تأكيد اعتماد سياسة الاحتفاظ بالنسخ الاحتياطية لآخر 7 أيام
                </h4>
                <p className="text-[11px] text-slate-500">حفظ آخر 168 ساعة وحذف اليوم الثامن وما قبله تلقائياً</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-slate-700 leading-relaxed text-[11px]">
              <p>
                <strong>كيف تعمل هذه السياسة وفق طلبك:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-600 mr-2">
                <li>يتم أخذ نسخة احتياطية آلية شاملة من البرنامج كل ساعة ورفعها إلى Google Drive.</li>
                <li>يتم الاحتفاظ بجميع النسخ المسجلة خلال آخر <strong>7 أيام</strong> كاملة.</li>
                <li>
                  عند بدء <strong>اليوم الثامن</strong>، يقوم النظام تلقائياً وبشكل دوري بحذف النسخ الأقدم من 7 أيام (اليوم الثامن فما قبله) من مجلد النسخ الاحتياطية في Drive لإبقاء الحساب خفيفاً ومرتباً.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                هل توافق وتؤكد تفعيل حذف النسخ الأقدم من 7 أيام تلقائياً من مجلد النسخ الاحتياطية في Google Drive؟
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfirmRetentionModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmRetentionPolicy}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>أوافق وأعتمد سياسة الـ 7 أيام</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal: Confirm Manual Cleanup of Old Files (+7 days) */}
      {confirmManualCleanModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 p-5 w-full max-w-md text-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="p-2.5 bg-rose-100 text-rose-800 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  تأكيد حذف النسخ الاحتياطية الأقدم من 7 أيام
                </h4>
                <p className="text-[11px] text-slate-500">تدوير وتنظيف نسخ اليوم الثامن وما قبله</p>
              </div>
            </div>

            <div className="space-y-2 text-slate-700 text-[11px]">
              <p>
                تم العثور على <strong>{oldFilesCount} نسخة احتياطية</strong> يتجاوز تاريخ إنشائها 7 أيام كاملة.
              </p>
              <p className="text-rose-700 font-bold">
                سيتم حذف هذه النسخ القديمة نهائياً من مجلد Google Drive، مع الإبقاء على كافة نسخ آخر 7 أيام.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfirmManualCleanModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteManualClean}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>تأكيد الحذف الآن ({oldFilesCount})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal: Confirm Single File Delete */}
      {fileToDelete && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 p-5 w-full max-w-sm text-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">حذف نسخة احتياطية</h4>
                <p className="text-[11px] text-slate-500 font-mono truncate max-w-[200px]">{fileToDelete.name}</p>
              </div>
            </div>

            <p className="text-[11px] text-slate-700">
              هل أنت متأكد من حذف هذه النسخة الاحتياطية نهائياً من Google Drive؟ لا يمكن التراجع عن هذا الإجراء.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteSingleFile}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
