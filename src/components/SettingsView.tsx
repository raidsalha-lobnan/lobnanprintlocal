import { resizeAndCompressImage } from '../utils/imageCompress';
import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { CurrencySettings } from './settings/CurrencySettings';
import { OfflineSqlSettings } from './settings/OfflineSqlSettings';
import { UnitsOfMeasureSettings } from './settings/UnitsOfMeasureSettings';
import { DatabaseZeroingSettings } from './settings/DatabaseZeroingSettings';
import { TelegramSettings } from './settings/TelegramSettings';
import { GoogleDriveBackupSettings } from './settings/GoogleDriveBackupSettings';
import { FirebaseQuotaModal } from './FirebaseQuotaModal';
import { PrintHeader, ThermalReceiptHeader } from './common/PrintHeader';
import { OfficialStamp } from './common/OfficialStamp';
import {
  Settings,
  Building,
  Save,
  Download,
  Upload,
  RefreshCw,
  CheckCircle,
  Printer,
  ShieldAlert,
  Coins,
  Server,
  Scale,
  SlidersHorizontal,
  Sparkles,
  ShoppingCart,
  Users,
  Truck,
  Boxes,
  LayoutDashboard,
  Wallet,
  FileText,
  Image as ImageIcon,
  Trash2,
  Plus,
  Phone as PhoneIcon,
  MapPin,
  Eye,
  AlertCircle,
  FileSpreadsheet,
  Database,
  Cloud
} from 'lucide-react';

interface SettingsViewProps {
  initialTab?: 'general' | 'units' | 'shortcuts' | 'currency' | 'sql' | 'backup' | 'reset_db';
}

export const SettingsView: React.FC<SettingsViewProps> = ({ initialTab = 'general' }) => {
  const {
    settings,
    updateSettings,
    resetAllData,
    exportDataJSON,
    importDataJSON,
    forceSyncNow,
    invoices,
    parties,
    inventory,
    vouchers,
    purchases,
    accounts,
    treasuries,
    employees,
    printOrders,
    expenses,
    journalEntries,
    currentUser,
    roles,
    syncCoordinatorState,
  } = useAccounting();
  const [isSyncingToCloud, setIsSyncingToCloud] = useState(false);

  const totalDatabaseRecords = React.useMemo(() => {
    return (invoices?.length || 0) +
      (parties?.length || 0) +
      (inventory?.length || 0) +
      (vouchers?.length || 0) +
      (purchases?.length || 0) +
      (accounts?.length || 0) +
      (treasuries?.length || 0) +
      (employees?.length || 0) +
      (printOrders?.length || 0) +
      (expenses?.length || 0) +
      (journalEntries?.length || 0);
  }, [invoices, parties, inventory, vouchers, purchases, accounts, treasuries, employees, printOrders, expenses, journalEntries]);

  const isSystemAdmin = React.useMemo(() => {
    if (!currentUser) return true;
    const role = roles.find(r => r.id === currentUser.roleId);
    return !role || role.code === 'SYS_ADMIN' || role.code === 'GEN_MGR';
  }, [currentUser, roles]);

  const [activeTab, setActiveTabState] = useState<'general' | 'units' | 'shortcuts' | 'currency' | 'sql' | 'backup' | 'reset_db' | 'telegram'>(() => {
    try {
      const saved = localStorage.getItem('settings_subtab');
      if (saved && ['general', 'units', 'shortcuts', 'currency', 'sql', 'backup', 'reset_db', 'telegram'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return (initialTab as any) || 'general';
  });

  const setActiveTab = React.useCallback((tab: 'general' | 'units' | 'shortcuts' | 'currency' | 'sql' | 'backup' | 'reset_db' | 'telegram') => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('settings_subtab', tab);
    } catch {}
  }, []);

  React.useEffect(() => {
    if (initialTab && !localStorage.getItem('settings_subtab')) {
      setActiveTab(initialTab as any);
    }
  }, [initialTab, setActiveTab]);

  const [appTitle, setAppTitle] = useState(settings.appTitle || 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان - م.رائد صالحة');
  const [businessName, setBusinessName] = useState(settings.businessName || 'مطبعة ومكتبة لبنان');
  const [businessNameEn, setBusinessNameEn] = useState(settings.businessNameEn || '');
  const [activityType, setActivityType] = useState(settings.activityType || '');
  const [taxNumber, setTaxNumber] = useState(settings.taxNumber || '');
  const [crNumber, setCrNumber] = useState(settings.crNumber || '');
  const [showTaxNumberInPrints, setShowTaxNumberInPrints] = useState<boolean>(settings.showTaxNumberInPrints !== false); // default true
  const [showCrNumberInPrints, setShowCrNumberInPrints] = useState<boolean>(settings.showCrNumberInPrints !== false); // default true
  
    // اللوقو والهيدر الكامل والختم والتوقيع
  const [logoUrl, setLogoUrl] = useState<string>(settings.logoUrl || '');
  const [headerImageUrl, setHeaderImageUrl] = useState<string>(settings.headerImageUrl || '');
  const [stampUrl, setStampUrl] = useState<string>(settings.stampUrl || '');
  const [signatureUrl, setSignatureUrl] = useState<string>(settings.signatureUrl || '');

  // العناوين المتعددة
  const [addresses, setAddresses] = useState<string[]>(() => {
    if (settings.addresses && settings.addresses.length > 0) return settings.addresses;
    if (settings.address) return [settings.address];
    return ['الفرع الرئيسي: رام الله - شارع الإرسال'];
  });
  const [newAddressInput, setNewAddressInput] = useState('');

  // أرقام الهواتف المتعددة
  const [phones, setPhones] = useState<string[]>(() => {
    if (settings.phones && settings.phones.length > 0) return settings.phones;
    if (settings.phone) return [settings.phone];
    return ['02-2987654'];
  });
  const [newPhoneInput, setNewPhoneInput] = useState('');

  const [currency, setCurrency] = useState(settings.currency || '₪');
  const [vatRate, setVatRate] = useState(settings.vatRate || 0);
  const [invoiceFooter, setInvoiceFooter] = useState(settings.invoiceFooter || settings.invoiceFooterNote || '');
  const [isSaved, setIsSaved] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);

  // Logo file upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WebP)');
      return;
    }
    resizeAndCompressImage(file, 400, 400).then(setLogoUrl).catch(console.error);
  };

  // Full Header banner file upload handler
  const handleHeaderImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WebP)');
      return;
    }
    resizeAndCompressImage(file, 1200, 300).then(setHeaderImageUrl).catch(console.error);
  };

  
  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resizeAndCompressImage(file, 300, 300).then(setStampUrl).catch(console.error);
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resizeAndCompressImage(file, 300, 300).then(setSignatureUrl).catch(console.error);
  };

  // Multiple Addresses handlers
  const handleAddAddress = () => {
    const clean = newAddressInput.trim();
    if (!clean) return;
    if (addresses.includes(clean)) return;
    setAddresses([...addresses, clean]);
    setNewAddressInput('');
  };

  const handleRemoveAddress = (index: number) => {
    setAddresses(addresses.filter((_, i) => i !== index));
  };

  // Multiple Phones handlers
  const handleAddPhone = () => {
    const clean = newPhoneInput.trim();
    if (!clean) return;
    if (phones.includes(clean)) return;
    setPhones([...phones, clean]);
    setNewPhoneInput('');
  };

  const handleRemovePhone = (index: number) => {
    setPhones(phones.filter((_, i) => i !== index));
  };

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const [generalDirty, setGeneralDirty] = useState(false);
  const [legacyImageBackup, setLegacyImageBackup] = useState<Record<string, string> | null>(() => {
    try {
      const raw = localStorage.getItem('alnoor_press_accounting_v1_settings_legacy_device_backup');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('alnoor_press_accounting_v1_settings_legacy_device_backup');
      const backup: Record<string, string> | null = raw ? JSON.parse(raw) : null;
      const keys = ['headerImageUrl', 'logoUrl', 'stampUrl', 'signatureUrl'] as const;
      if (backup && keys.some(key => backup[key] && backup[key] !== (settings[key] || ''))) {
        setLegacyImageBackup(backup);
      } else {
        setLegacyImageBackup(null);
      }
    } catch { setLegacyImageBackup(null); }
  }, [settings]);
  const recoverDeviceImages = async () => {
    if (!legacyImageBackup || !isSystemAdmin) return;
    const keys = ['headerImageUrl', 'logoUrl', 'stampUrl', 'signatureUrl'] as const;
    const restored = Object.fromEntries(
      keys.filter(key => legacyImageBackup[key] && legacyImageBackup[key] !== settings[key])
        .map(key => [key, legacyImageBackup[key]])
    ) as Partial<typeof settings>;
    if (!Object.keys(restored).length) return;
    if (!window.confirm('سيتم اعتماد الصور والترويسة المحفوظة سابقًا على هذا الجهاز لكل أجهزة المنشأة. هل أنت متأكد من أنها الأحدث؟')) return;
    setIsSavingSettings(true);
    setSettingsSaveError('');
    const accepted = await updateSettings(restored);
    setIsSavingSettings(false);
    if (accepted) {
      try { localStorage.removeItem('alnoor_press_accounting_v1_settings_legacy_device_backup'); } catch {}
      setLegacyImageBackup(null);
      setGeneralDirty(false);
      setIsSaved(true);
    } else {
      setSettingsSaveError('تعذّر حفظ صور المنشأة في طابور المزامنة. النسخة المحلية الاحتياطية ما زالت محفوظة.');
    }
  };
  React.useEffect(() => {
    if (generalDirty) return;
    setAppTitle(settings.appTitle || '');
    setBusinessName(settings.businessName || '');
    setBusinessNameEn(settings.businessNameEn || '');
    setActivityType(settings.activityType || '');
    setTaxNumber(settings.taxNumber || '');
    setCrNumber(settings.crNumber || '');
    setShowTaxNumberInPrints(settings.showTaxNumberInPrints !== false);
    setShowCrNumberInPrints(settings.showCrNumberInPrints !== false);
    setLogoUrl(settings.logoUrl || '');
    setHeaderImageUrl(settings.headerImageUrl || '');
    setStampUrl(settings.stampUrl || '');
    setSignatureUrl(settings.signatureUrl || '');
    setAddresses(settings.addresses?.length ? settings.addresses : settings.address ? [settings.address] : []);
    setPhones(settings.phones?.length ? settings.phones : settings.phone ? [settings.phone] : []);
    setCurrency(settings.currency || '');
    setVatRate(settings.vatRate || 0);
    setInvoiceFooter(settings.invoiceFooter || settings.invoiceFooterNote || '');
  }, [settings, generalDirty]);
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const primaryAddress = addresses.length > 0 ? addresses.join(' / ') : '';
    const primaryPhone = phones.length > 0 ? phones.join(' / ') : '';
    setSettingsSaveError('');
    setIsSavingSettings(true);
    const accepted = await updateSettings({
      appTitle: appTitle.trim(),
      businessName,
      businessNameEn,
      activityType,
      taxNumber,
      crNumber,
      showTaxNumberInPrints,
      showCrNumberInPrints,
      logoUrl: logoUrl.trim() || '',
      headerImageUrl: headerImageUrl.trim() || '',
      stampUrl: stampUrl.trim() || '',
      signatureUrl: signatureUrl.trim() || '',
      addresses: addresses.length > 0 ? addresses : [primaryAddress],
      phones: phones.length > 0 ? phones : [primaryPhone],
      phone: primaryPhone,
      address: primaryAddress,
      currency,
      vatRate: Number(vatRate),
      invoiceFooter,
      invoiceFooterNote: invoiceFooter
    });
    setIsSavingSettings(false);
    if (accepted) {
      setGeneralDirty(false);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3500);
    } else {
      setSettingsSaveError('تعذّر حفظ إعدادات المنشأة في طابور المزامنة. لم يتم اعتماد التغييرات؛ راجع الاتصال والصلاحيات وحالة المزامنة.');
    }
  };

  const [isImporting, setIsImporting] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupStatusMessage, setBackupStatusMessage] = useState<{ text: string; success: boolean } | null>(null);

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        
        // Always ask about facility settings separately to give granular control
        const replaceFacilitySettings = window.confirm("هل ترغب في استبدال إعدادات المنشأة الحالية (كالاسم، الشعار، الفروع، الترويسة، الضريبة) بتلك الموجودة في النسخة الاحتياطية؟\n\nاختر 'موافق' للاستبدال.\nاختر 'إلغاء' للاحتفاظ بإعدادات المنشأة الحالية.");
        const keepFacilitySettings = !replaceFacilitySettings;

        // Ask about other settings (roles, users, etc.)
        const includeSettings = window.confirm("هل ترغب في استيراد إعدادات النظام الأخرى والمستخدمين والصلاحيات من النسخة الاحتياطية؟\n\nاختر 'موافق' لاستيرادها.\nاختر 'إلغاء' لاستيراد البيانات المالية فقط والإبقاء على إعداداتك الحالية.");
        
        let keepTelegramSettings = true;
        if (includeSettings || !keepFacilitySettings) {
           const replaceTelegram = window.confirm("هل ترغب في استبدال إعدادات التلجرام الحالية بتلك الموجودة في النسخة الاحتياطية؟\n\nاختر 'موافق' للاستبدال.\nاختر 'إلغاء' للاحتفاظ بإعدادات التلجرام الحالية.");
           keepTelegramSettings = !replaceTelegram;
        }
        
        setIsImporting(true);
        const ok = await importDataJSON(json, includeSettings, keepTelegramSettings, keepFacilitySettings);
        setIsImporting(false);
        if (ok) {
          alert('تم استيراد كافة البيانات ومزامنتها بنجاح مع قاعدة البيانات السحابية لكافة الشاشات.');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          alert('ملف النسخ الاحتياطي غير صالح أو تالف.');
        }
      } catch (err) {
        setIsImporting(false);
        alert('ملف النسخ الاحتياطي غير صالح.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-3 w-full pb-8">
      {/* Header */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">إعدادات النظام والمنشأة</h2>
            <p className="text-[10px] text-slate-400 font-light">
              إدارة بيانات المنشأة، تعدد العملات وأسعار الصرف، الربط بقواعد بيانات SQL، والنسخ الاحتياطي
            </p>
          </div>
        </div>

        {isSaved && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>تم حفظ الإعدادات محليًا، وتنتظر تأكيد المزامنة مع الخادم</span>
          </span>
        )}
      </div>

      {settingsSaveError && (
        <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
          {settingsSaveError}
        </div>
      )}
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        إعدادات المنشأة والوحدات والعملات والتصنيفات مشتركة بين الأجهزة من قاعدة البيانات الموحدة.
        {syncCoordinatorState.conflict > 0
          ? ' توجد تعارضات مزامنة تحتاج مراجعة قبل اعتبار الإعدادات معتمدة.'
          : syncCoordinatorState.pending > 0
            ? ' توجد تغييرات محلية بانتظار تأكيد الخادم.'
            : ' لا توجد تغييرات معلقة مسجلة حاليًا.'}
        <span className="block mt-0.5 text-[10px]">إعداد اتصال الجهاز وقائمة التبويب المفتوح يبقيان محليين؛ ولا تُنقل جلسات الدخول أو المفاتيح الخاصة.</span>
      </div>
      {legacyImageBackup && isSystemAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span>توجد صورة ترويسة أو شعار أقدم محفوظ على هذا الجهاز تختلف عن الإعدادات المعتمدة. لن تُنشر تلقائيًا حتى لا تحل نسخة قديمة محل الأحدث.</span>
          <button type="button" onClick={() => { void recoverDeviceImages(); }} disabled={isSavingSettings}
            className="shrink-0 rounded-md bg-amber-800 px-3 py-1.5 font-bold text-white disabled:opacity-50">
            اعتماد صور هذا الجهاز على جميع الأجهزة
          </button>
        </div>
      )}
      {/* Navigation Sub-tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setIsQuotaModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-600 text-slate-950 transition-all cursor-pointer shadow-xs shrink-0"
          title="متابعة استهلاك العمليات في سحابة فايربيس والعداد التنازلي لموعد التجديد 12:00 ظهراً"
        >
          <Database className="w-3.5 h-3.5 text-slate-900" />
          <span>مؤشر حصة فايربيس</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'general'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>البيانات الرسمية والضريبة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('units')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'units'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>وحدات القياس وآليات الاحتساب</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('shortcuts')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'shortcuts'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>اختصارات الشاشة الرئيسية</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('currency')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'currency'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          <span>تعدد العملات وأسعار الصرف (₪)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sql')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'sql'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>التشغيل المحلي وربط خادم SQL</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('telegram')}
          className={`w-full text-right px-3 py-2.5 rounded-lg flex items-center gap-2 transition-colors ${
            activeTab === 'telegram'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" x2="11" y1="2" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          <span>تكامل تليجرام (البوت)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'backup'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>النسخ الاحتياطي والصيانة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reset_db')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'reset_db'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-rose-50/70 text-rose-700 hover:bg-rose-100 border border-rose-200'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
          <span>تصفير قاعدة البيانات (التشغيل الفعلي)</span>
        </button>
      </div>

      {/* Tab 1: General Business Info */}
      {activeTab === 'general' && (
        <form onSubmit={handleSave} onChangeCapture={() => setGeneralDirty(true)} className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-5 text-xs">
          
          {/* Section 1: Business Identity & Official Data */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-blue-600" />
                <span>البيانات الرسمية والضريبية للمنشأة (المطبعة والمكتبة)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowLivePreview(!showLivePreview)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition cursor-pointer"
                title="معاينة شكل الترويسة على الأوراق المطبوعة وعلى إيصال الكاشير الحراري"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showLivePreview ? 'إخفاء المعاينة الحية' : 'معاينة ترويسة المطبوعات والكاشير'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="sm:col-span-2 lg:col-span-3 bg-blue-50/70 p-3 rounded-lg border border-blue-200">
                <label className="block text-blue-950 font-bold mb-1 text-[11px] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    مسمى وترويسة البرنامج في أعلى الشاشة (شريط العنوان العلوي وتبويب المتصفح):
                  </span>
                  <span className="text-[10px] text-blue-700 font-medium">يظهر في الشريط الأزرق العلوي وعنوان النافذة</span>
                </label>
                <input
                  type="text"
                  required
                  value={appTitle}
                  onChange={e => setAppTitle(e.target.value)}
                  placeholder="برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان - م.رائد صالحة"
                  className="w-full bg-white border border-blue-300 rounded-lg p-2.5 text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 font-bold text-blue-950 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">اسم المطبعة والمكتبة التجاري (عربي):</label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="مطبعة ومكتبة لبنان"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">الاسم التجاري بالإنجليزية (اختياري):</label>
                <input
                  type="text"
                  value={businessNameEn}
                  onChange={e => setBusinessNameEn(e.target.value)}
                  placeholder="Al-Noor Modern Press & Bookstore"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">نوع النشاط والوصف الرسمي:</label>
                <input
                  type="text"
                  value={activityType}
                  onChange={e => setActivityType(e.target.value)}
                  placeholder="طباعة أوفست وديجيتال - خامات ومطبوعات وقرطاسية"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">الرقم الضريبي الرسمي (VAT):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={e => setTaxNumber(e.target.value)}
                    placeholder="اختياري"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-600 font-semibold bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg shrink-0">
                    <input type="checkbox" checked={showTaxNumberInPrints} onChange={e => setShowTaxNumberInPrints(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    عرض في الطباعة
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">رقم السجل التجاري / الترخيص:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={crNumber}
                    onChange={e => setCrNumber(e.target.value)}
                    placeholder="اختياري"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-600 font-semibold bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg shrink-0">
                    <input type="checkbox" checked={showCrNumberInPrints} onChange={e => setShowCrNumberInPrints(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    عرض في الطباعة
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Logo and Full Header Uploads (لوقو المنشأة أو الهيدر الكامل) */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-indigo-600" />
              <span>الهوية البصرية وترويسة المطبوعات (لوقو المنشأة أو هيدر كامل)</span>
            </h3>

            {/* Note & Rules Banner */}
            <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 text-[11px] text-blue-900 mb-3.5 space-y-1 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-blue-950">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <span>قواعد اعتماد الترويسة في الطباعة:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-blue-800 pr-1">
                <li>
                  <strong>عند رفع هيدر كامل:</strong> يتم اعتماده كترويسة رسمية لكافة الكشوفات والأوراق المطبوعة (الفواتير A4، كشوفات الحساب، سندات القبض والصرف، بطاقات التشغيل، مسيرات الرواتب).
                </li>
                <li>
                  <strong>الكاشير الحراري (80mm):</strong> يُستثنى من الهيدر الكامل لضيق الورق الحراري، وتُطبع فواتيره باللوقو مع اسم المنشأة والعناوين وأرقام الهواتف المكتوبة.
                </li>
                <li>
                  <strong>في حال عدم رفع هيدر كامل:</strong> يعتمد النظام تلقائياً اللوقو مع اسم المنشأة وكافة البيانات المكتوبة (العناوين والهواتف والأرقام الضريبية).
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Box A: Upload Company Logo (رفع لوقو المنشأة) */}
              <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>1. لوقو المنشأة (شعار المطبعة / المكتبة)</span>
                    </span>
                    {logoUrl && (
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded">
                        مرفوع ✓
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-light mb-3">
                    يظهر اللوقو في ترويسة الكشوفات القياسية، ويظهر دائماً أعلى فواتير الكاشير الحراري.
                  </p>

                  {/* Logo Preview & Input */}
                  <div className="flex items-center gap-3">
                    {logoUrl ? (
                      <div className="relative w-24 h-24 bg-white border border-slate-300 rounded-lg p-1.5 flex items-center justify-center shadow-xs shrink-0 group">
                        <img
                          src={logoUrl}
                          alt="Logo Preview"
                          className="max-w-full max-h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="absolute -top-2 -right-2 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1 shadow-md transition cursor-pointer"
                          title="حذف اللوقو"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 bg-white border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 text-[10px] shrink-0">
                        <ImageIcon className="w-6 h-6 mb-1 text-slate-300" />
                        <span>لا يوجد لوقو</span>
                      </div>
                    )}

                    <div className="flex-1 space-y-2">
                      <label className="inline-flex items-center justify-center gap-1.5 w-full bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-lg px-3 py-2 text-xs shadow-2xs transition cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>{logoUrl ? 'تغيير صورة اللوقو' : 'رفع ملف اللوقو (PNG/JPG)'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[10px] text-slate-400">
                        الصيغ المدعومة: PNG أو JPG بخلفية شفافة أو بيضاء (مستحسن 300×300).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Box B: Upload Full Header Banner (رفع هيدر كامل للمطبوعات) */}
              <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                      <span>2. هيدر مطبوعات كامل (Full Letterhead Banner)</span>
                    </span>
                    {headerImageUrl ? (
                      <span className="bg-indigo-100 text-indigo-800 border border-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded">
                        معتمد لكافة الكشوفات ✓
                      </span>
                    ) : (
                      <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">
                        غير مرفوع
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-light mb-3">
                    ترويسة مصممة مسبقاً بعرض الصفحة تحتوي الشعار والاسم والبيانات. عند رفعه يُعتمد لكل المطبوعات الرسمية.
                  </p>

                  {/* Header Banner Preview & Input */}
                  <div className="space-y-2">
                    {headerImageUrl ? (
                      <div className="relative w-full h-20 bg-white border border-slate-300 rounded-lg p-1 flex items-center justify-center shadow-xs overflow-hidden group">
                        <img
                          src={headerImageUrl}
                          alt="Header Banner Preview"
                          className="w-full h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setHeaderImageUrl('')}
                          className="absolute top-1.5 left-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md px-2 py-0.5 text-[10px] font-bold shadow-md transition cursor-pointer flex items-center gap-1"
                          title="إلغاء الهيدر والعودة للترويسة القياسية"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>إزالة الهيدر</span>
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-16 bg-white border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 text-[10px] gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-slate-300" />
                        <span>لم يتم رفع هيدر كامل بعد (سيتم استخدام اللوقو والبيانات كترويسة افتراضية)</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center justify-center gap-1.5 flex-1 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-lg px-3 py-2 text-xs shadow-2xs transition cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{headerImageUrl ? 'استبدال الهيدر الكامل' : 'رفع هيدر كامل للمطبوعات'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleHeaderImageUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>\n
                {/* Stamp & Signature Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {/* Stamp Upload */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>3. ختم المنشأة الرسمي (أبعاد 4 سم دائري)</span>
                      </span>
                      {stampUrl && (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded">
                          مرفوع ✓ (4cm دائري مع افكت الحبر)
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 font-light mb-3 leading-relaxed">
                      يتم ضبط أبعاد الختم بدقة عند الطباعة على 4 سم دائري مع تطبيق تأثير حبر الختم الواقعي والميلان الطبيعي على كافة الفواتير والسندات والكشوفات.
                    </p>
                    <div className="flex items-center gap-3">
                      {stampUrl ? (
                        <div className="relative w-20 h-20 bg-white border border-slate-300 rounded-full p-1.5 flex items-center justify-center shadow-xs shrink-0 group overflow-hidden">
                          <img
                            src={stampUrl}
                            alt="Stamp Preview"
                            className="max-w-full max-h-full object-contain rounded-full -rotate-6 mix-blend-multiply filter contrast-125 saturate-110"
                          />
                          <button
                            type="button"
                            onClick={() => setStampUrl('')}
                            className="absolute -top-1 -right-1 bg-red-100 text-red-600 rounded-full p-1 border border-red-200 opacity-0 group-hover:opacity-100 transition shadow-xs hover:bg-red-200 hover:text-red-700 z-10"
                            title="إزالة الختم"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-20 h-20 bg-white border border-slate-300 border-dashed rounded-full flex flex-col items-center justify-center text-slate-400 shrink-0">
                          <ImageIcon className="w-5 h-5 mb-1 opacity-50" />
                          <span className="text-[9px] font-bold">بدون ختم</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="inline-flex items-center justify-center gap-1.5 w-full bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-lg px-3 py-2 text-xs shadow-2xs transition cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-blue-600" />
                          <span>{stampUrl ? 'تغيير الختم' : 'رفع ختم الشركة (PNG / 4cm دائري)'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleStampUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Signature Upload */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>4. توقيع المدير / المخول</span>
                      </span>
                      {signatureUrl && (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded">
                          مرفوع ✓
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 font-light mb-3 leading-relaxed">
                      يظهر بجوار الختم الرسمي لاعتماد الفواتير والسندات في المعاملات الرسمية.
                    </p>
                    <div className="flex items-center gap-3">
                      {signatureUrl ? (
                        <div className="relative w-20 h-20 bg-white border border-slate-300 rounded-lg p-1.5 flex items-center justify-center shadow-xs shrink-0 group">
                          <img
                            src={signatureUrl}
                            alt="Signature Preview"
                            className="max-w-full max-h-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => setSignatureUrl('')}
                            className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 border border-red-200 opacity-0 group-hover:opacity-100 transition shadow-xs hover:bg-red-200 hover:text-red-700"
                            title="إزالة التوقيع"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-20 h-20 bg-white border border-slate-300 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 shrink-0">
                          <ImageIcon className="w-5 h-5 mb-1 opacity-50" />
                          <span className="text-[9px] font-bold">بدون توقيع</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="inline-flex items-center justify-center gap-1.5 w-full bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-lg px-3 py-2 text-xs shadow-2xs transition cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-blue-600" />
                          <span>{signatureUrl ? 'تغيير التوقيع' : 'رفع التوقيع (PNG)'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleSignatureUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>\n
              </div>
            </div>
          </div>

          {/* Section 3: Multiple Phone Numbers (أرقام الهواتف المتعددة) */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
              <PhoneIcon className="w-4 h-4 text-blue-600" />
              <span>أرقام الهواتف والتواصل المتعددة (إدارة، مبيعات، فاكس، واتساب)</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-light mb-2.5">
              يمكنك إضافة عدة أرقام هواتف لتظهر في ترويسة الفواتير والكشوفات وإيصالات الكاشير الحراري.
            </p>

            <div className="space-y-2">
              {/* Add Phone Input */}
              <div className="flex items-center gap-2 max-w-xl">
                <input
                  type="text"
                  placeholder="مثال: 02-2987654 (الإدارة) أو 0599-123456 (المبيعات والواتساب)..."
                  value={newPhoneInput}
                  onChange={e => setNewPhoneInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddPhone();
                    }
                  }}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddPhone}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-2 rounded-lg text-xs transition cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة رقم</span>
                </button>
              </div>

              {/* Phones List */}
              <div className="flex flex-wrap gap-2 pt-1">
                {phones.map((ph, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-mono"
                  >
                    <PhoneIcon className="w-3 h-3 text-slate-500" />
                    <span>{ph}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePhone(idx)}
                      className="text-slate-400 hover:text-rose-600 transition cursor-pointer p-0.5"
                      title="حذف هذا الرقم"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {phones.length === 0 && (
                  <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                    لم تتم إضافة أرقام هواتف بعد.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Multiple Addresses (العناوين والفروع المتعددة) */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>عناوين وفروع المنشأة المتعددة</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-light mb-2.5">
              سجّل كافة عناوين وفروع المنشأة لتظهر بتنسيق رسمي في الترويسة والكاشير الحراري.
            </p>

            <div className="space-y-2">
              {/* Add Address Input */}
              <div className="flex items-center gap-2 max-w-2xl">
                <input
                  type="text"
                  placeholder="مثال: الفرع الرئيسي: رام الله - شارع الإرسال | فرع القدس: شارع صلاح الدين..."
                  value={newAddressInput}
                  onChange={e => setNewAddressInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAddress();
                    }
                  }}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddAddress}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-2 rounded-lg text-xs transition cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة عنوان</span>
                </button>
              </div>

              {/* Addresses List */}
              <div className="space-y-1.5 pt-1">
                {addresses.map((addr, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{addr}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAddress(idx)}
                      className="text-slate-400 hover:text-rose-600 text-xs font-bold transition cursor-pointer p-0.5"
                      title="حذف هذا العنوان"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {addresses.length === 0 && (
                  <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 inline-block">
                    لم تتم إضافة عناوين بعد.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: Billing & Tax Rates */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-900 mb-2.5 flex items-center gap-1.5">
              <Printer className="w-4 h-4 text-blue-600" />
              <span>إعدادات الفوترة والضريبة وتذييل السندات</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">نسبة ضريبة القيمة المضافة (%):</label>
                <input
                  type="number"
                  value={vatRate}
                  onChange={e => setVatRate(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-900 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">رمز العملة المعروض:</label>
                <input
                  type="text"
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">نص تذييل الفاتورة وسندات التسليم:</label>
                <textarea
                  rows={2}
                  value={invoiceFooter}
                  onChange={e => setInvoiceFooter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 6: Live Visual Preview Accordion */}
          {showLivePreview && (
            <div className="pt-4 border-t-2 border-dashed border-blue-200 bg-slate-50/80 -mx-4 sm:-mx-5 px-4 sm:px-5 pb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span>معاينة حية لشكل الترويسة المعتمدة في الطباعة والكاشير:</span>
                </div>
                <span className="text-[11px] font-bold text-blue-700">
                  {headerImageUrl ? 'ترويسة بالهيدر الكامل المعتمد' : 'ترويسة قياسية (باللوقو والبيانات)'}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* A4 Document Header Preview */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 mb-2 border-b pb-1 flex justify-between">
                    <span>1. شكل الترويسة في الأوراق والكشوفات المطبوعة (A4):</span>
                    <span className="text-slate-400 font-mono">210mm × 297mm</span>
                  </div>
                  <PrintHeader
                    title="فاتورة ضريبية / كشف حساب"
                    subtitle="معاينة حية للمطبوعات الرسمية"
                    docNumber="INV-2024-PREVIEW"
                    docDate={new Date().toISOString().split('T')[0]}
                    overrideSettings={{
                      businessName,
                      businessNameEn,
                      activityType,
                      taxNumber,
                      crNumber,
                      showTaxNumberInPrints,
                      showCrNumberInPrints,
                      logoUrl,
                      headerImageUrl,
                      addresses,
                      phones
                    }}
                  />
                  
                  {/* Live Stamp & Signature Footer Preview in A4 */}
                  <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-2 gap-4 text-center text-xs">
                    <div className="space-y-1 flex flex-col items-center">
                      <span className="font-bold text-slate-700 block text-[11px]">توقيع واعتماد الإدارة</span>
                      <div className="h-16 flex items-center justify-center">
                        {signatureUrl ? (
                          <img src={signatureUrl} alt="Signature Preview" className="max-h-14 max-w-[120px] object-contain mix-blend-multiply opacity-90" />
                        ) : (
                          <div className="border-b border-dashed border-slate-400 w-28 mt-8"></div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-1 flex flex-col items-center">
                      <span className="font-bold text-slate-700 block text-[11px]">الختم الرسمي (4 سم دائري)</span>
                      <div className="flex items-center justify-center">
                        <OfficialStamp stampUrl={stampUrl} showDefaultIfEmpty={!stampUrl} />
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 text-center mt-3 italic">
                    {headerImageUrl
                      ? 'تم اعتماد الهيدر الكامل والختم 4 سم الدائري بنجاح لكافة الكشوفات والمطبوعات.'
                      : 'في حال عدم رفع هيدر، تظهر الترويسة باللوقو مع اسم المنشأة والعناوين والهواتف.'}
                  </p>
                </div>

                {/* Thermal Receipt Header Preview */}
                <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 mb-2 border-b pb-1 flex justify-between">
                    <span>2. إيصال الكاشير الحراري:</span>
                    <span className="text-slate-400 font-mono">80mm Thermal</span>
                  </div>
                  <ThermalReceiptHeader
                    receiptTitle="فاتورة مبيعات نقدية"
                    overrideSettings={{
                      businessName,
                      businessNameEn,
                      activityType,
                      taxNumber,
                      crNumber,
                      showTaxNumberInPrints,
                      showCrNumberInPrints,
                      logoUrl,
                      addresses,
                      phones
                    }}
                  />
                  <p className="text-[10px] text-slate-400 text-center mt-2 italic">
                    الكاشير الحراري يستخدم دائماً اللوقو والعناوين والهواتف المكتوبة.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Save Bar */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowLivePreview(!showLivePreview)}
              className="text-xs text-slate-600 hover:text-blue-600 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{showLivePreview ? 'إغلاق المعاينة' : 'عرض المعاينة الحية للترويسة'}</span>
            </button>

            <button
              type="submit"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>حفظ البيانات الرسمية والترويسة</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab: Units of Measure & Calculation */}
      {activeTab === 'units' && <UnitsOfMeasureSettings />}

      {/* Tab: Home Screen Shortcuts Customization */}
      {activeTab === 'shortcuts' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <span>تخصيص اختصارات الشاشة الرئيسية للمستخدم</span>
              </h3>
              <p className="text-[10px] text-slate-400 font-light mt-0.5">
                اختر العمليات الدائمة التي ترغب في عرضها كأزرار وصول سريع على شاشتك الرئيسية
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const all = [
                    'pos', 'customer_statement', 'supplier_statement', 'new_print_order',
                    'new_invoice', 'purchases', 'receipt_voucher', 'payment_voucher',
                    'treasury_transfer', 'inventory', 'dashboard_info', 'accounting',
                    'employees', 'reports'
                  ];
                  updateSettings({
        homeShortcuts: all });
                }}
                className="px-2.5 py-1 text-blue-600 hover:bg-blue-50 rounded-md font-bold transition"
              >
                تحديد الكل
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => {
                  updateSettings({
        homeShortcuts: [
                      'pos', 'customer_statement', 'supplier_statement', 'new_invoice',
                      'new_print_order', 'payment_voucher', 'receipt_voucher', 'purchases',
                      'inventory', 'treasury_transfer', 'dashboard_info', 'reports'
                    ]
                  });
                }}
                className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded-md font-bold transition"
              >
                استعادة الافتراضي
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { id: 'pos', label: 'كاشير المبيعات (POS)', desc: 'إنشاء فواتير المبيعات السريعة', icon: ShoppingCart },
              { id: 'customer_statement', label: 'كشف حساب عميل', desc: 'كشف حساب تفصيلي ومديونيات العملاء', icon: Users },
              { id: 'supplier_statement', label: 'كشف حساب مورد', desc: 'متابعة حسابات وفواتير الموردين', icon: Truck },
              { id: 'new_print_order', label: 'أمر تشغيل ورشة طباعة', desc: 'إصدار أمر تشغيل ومواصفات الورق', icon: Printer },
              { id: 'new_invoice', label: 'فواتير المبيعات', desc: 'استعراض وإدارة فواتير المبيعات', icon: FileText },
              { id: 'purchases', label: 'فاتورة مشتريات خامات', desc: 'توريد الورق والخامات للمخزن', icon: Truck },
              { id: 'receipt_voucher', label: 'سند قبض نقدية / بنك', desc: 'تحصيل الإيرادات وأموال العملاء', icon: Wallet },
              { id: 'payment_voucher', label: 'سند صرف لمورد أو مصروف', desc: 'سداد الموردين والمصروفات النقدية', icon: Wallet },
              { id: 'treasury_transfer', label: 'تحويل بين الخزنات', desc: 'مناقلة مالية بين الصناديق والبنوك', icon: Wallet },
              { id: 'inventory', label: 'المخزون والورق', desc: 'فحص كميات الأصناف وحدود الأمان', icon: Boxes },
              { id: 'dashboard_info', label: 'لوحة المعلومات والأرصدة', desc: 'متابعة الأرصدة والمبيعات والسيولة', icon: LayoutDashboard },
              { id: 'accounting', label: 'دفتر اليومية والقيود', desc: 'مراجعة القيود المحاسبية المزدوجة', icon: FileText },
              { id: 'employees', label: 'رواتب وسلف الموظفين', desc: 'مسير الرواتب وسلف العاملين', icon: Users },
              { id: 'reports', label: 'الأرباح والتقارير والضريبة', desc: 'ميزان المراجعة وقائمة الدخل والضريبة', icon: LayoutDashboard }
            ].map(item => {
              const currentShortcuts = settings.homeShortcuts || [
                'pos', 'customer_statement', 'supplier_statement', 'new_invoice',
                'new_print_order', 'payment_voucher', 'receipt_voucher', 'purchases',
                'inventory', 'treasury_transfer', 'dashboard_info', 'reports'
              ];
              const isChecked = currentShortcuts.includes(item.id);
              const ItemIcon = item.icon;

              return (
                <label
                  key={item.id}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-blue-50/60 border-blue-200 text-slate-900'
                      : 'bg-white border-slate-200 text-slate-400 opacity-60 hover:opacity-80'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      let updated: string[];
                      if (isChecked) {
                        updated = currentShortcuts.filter(x => x !== item.id);
                      } else {
                        updated = [...currentShortcuts, item.id];
                      }
                      updateSettings({
        homeShortcuts: updated });
                    }}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 mt-0.5 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <ItemIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>{item.label}</span>
                    </div>
                    <p className="text-[9px] text-slate-400 font-light mt-0.5">{item.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Multi-Currency & Live Rates */}
      {activeTab === 'currency' && <CurrencySettings />}

      {/* Tab 3: Offline-First & SQL Server Integration */}
      {activeTab === 'sql' && <OfflineSqlSettings />}

      {activeTab === 'telegram' && <TelegramSettings />}

      {/* Tab 4: Backup and Data Maintenance */}
      {activeTab === 'backup' && (
        <div className="space-y-4">
          {/* Main Google Drive Automated Hourly Backup & 7-Day Retention */}
          <GoogleDriveBackupSettings />

          {/* Local JSON Backup & Manual Reset */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3 text-xs">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>النسخ الاحتياطي المحلي واستعادة البيانات</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-light">
              يمكنك تصدير قاعدة البيانات المحاسبية كاملة كملف JSON محلي على جهازك للرجوع إليها في أي وقت أو نقلها لجهاز آخر، كما يمكنك استعادة البيانات الأولية للتجربة.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  setIsExportingBackup(true);
                  setBackupStatusMessage({ text: 'جاري إنشاء وتصدير نسخة احتياطية مطابقة للشاشة وفيربيس 100%...', success: true });
                  try {
                    const res = await exportDataJSON();
                    setBackupStatusMessage({
                      text: `تم تصدير نسخة احتياطية مطابقة 100% للشاشة وفيربيس بنجاح (${res.totalRecords} سجل)!`,
                      success: true
                    });
                  } catch (e: any) {
                    setBackupStatusMessage({ text: 'فشل تصدير النسخة: ' + e.message, success: false });
                  } finally {
                    setIsExportingBackup(false);
                    setTimeout(() => setBackupStatusMessage(null), 6000);
                  }
                }}
                disabled={isExportingBackup}
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer text-xs disabled:opacity-50"
                title="تصدير نسخة احتياطية مطابقة 100% لكافة الإدخالات المعروضة على الشاشة وفيربيس"
              >
                <Download className={`w-3.5 h-3.5 ${isExportingBackup ? 'animate-spin' : ''}`} />
                <span>{isExportingBackup ? 'جاري إنشاء النسخة المطابقة...' : 'تصدير نسخة احتياطية محلية (مطابقة للشاشة 100%)'}</span>
              </button>

              <label className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer text-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>استيراد نسخة احتياطية من ملف</span>
                <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
              </label>

              <button
                type="button"
                onClick={async () => {
                  setIsSyncingToCloud(true);
                  const res = await forceSyncNow();
                  setIsSyncingToCloud(false);
                  if (res.success) {
                    alert(res.message);
                  } else {
                    alert('فشلت المزامنة: ' + res.message);
                  }
                }}
                disabled={isSyncingToCloud}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer text-xs disabled:opacity-50 shadow-xs"
                title="مزامنة العمليات المعلقة والتحقق من اعتمادها في قاعدة PostgreSQL الحالية دون استبدال بيانات الأجهزة الأخرى"
              >
                <Cloud className={`w-3.5 h-3.5 ${isSyncingToCloud ? 'animate-spin' : ''}`} />
                <span>{isSyncingToCloud ? 'جاري مزامنة العمليات المعلقة...' : 'مزامنة العمليات المعلقة مع الخادم الآن'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm('هل أنت متأكد من إعادة ضبط البيانات إلى القيم الافتراضية؟')) {
                    resetAllData();
                  }
                }}
                className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3 py-2 rounded-lg border border-rose-200 transition-colors cursor-pointer mr-auto text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة ضبط البيانات الافتراضية</span>
              </button>
            </div>

            {backupStatusMessage && (
              <div className={`p-2 rounded-lg text-xs font-bold flex items-center gap-2 ${
                backupStatusMessage.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {backupStatusMessage.success ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{backupStatusMessage.text}</span>
              </div>
            )}
          </div>

          {/* Quick link to Database Zeroing */}
          <div className="mt-4 p-3.5 bg-rose-50/80 border border-rose-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-bold text-rose-950 text-xs">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>تصفير قاعدة البيانات وبدء التشغيل الفعلي (خاص بالمدير)</span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                تصفير كافة الحركات التجريبية والعملاء والموردين والأصناف ضمن نطاق تاريخ معين، وتصفير أرصدة المخزون والديون للبدء الفعلي.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('reset_db')}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer shrink-0 transition-colors"
            >
              الانتقال لشاشة التصفير والاعتماد
            </button>
          </div>
        </div>
      )}

      {/* Tab 5: Database Zeroing for Go-Live */}
      {activeTab === 'reset_db' && <DatabaseZeroingSettings />}

      {/* Firebase Quota & Operations Monitor Modal */}
      <FirebaseQuotaModal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
      />
    </div>
  );
};

