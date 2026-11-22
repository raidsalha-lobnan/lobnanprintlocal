import { resizeAndCompressImage } from '../utils/imageCompress';
import {preparePrintLetterhead} from '../utils/printQualityAssets';
import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { CurrencySettings } from './settings/CurrencySettings';
import { OfflineSqlSettings } from './settings/OfflineSqlSettings';
import { UnitsOfMeasureSettings } from './settings/UnitsOfMeasureSettings';
import { DatabaseZeroingSettings } from './settings/DatabaseZeroingSettings';
import { TelegramSettings } from './settings/TelegramSettings';
import { GoogleDriveBackupSettings } from './settings/GoogleDriveBackupSettings';
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
  Cloud,
  ChevronDown
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

  type SettingsSection = 'general' | 'units' | 'shortcuts' | 'currency' | 'sql' | 'backup' | 'reset_db' | 'telegram';
  // An explicit section selected from the main menu always wins over an
  // earlier locally remembered section (for example backup vs currency).
  const [activeTab, setActiveTabState] = useState<SettingsSection>(initialTab);
  const [showSettingsOptions, setShowSettingsOptions] = useState(false);
  const settingsOptionsRef = React.useRef<HTMLDivElement | null>(null);

  const setActiveTab = React.useCallback((tab: SettingsSection) => {
    setActiveTabState(tab);
    setShowSettingsOptions(false);
  }, []);

  React.useEffect(() => {
    setActiveTabState(initialTab);
    setShowSettingsOptions(false);
  }, [initialTab]);

  React.useEffect(() => {
    if (!showSettingsOptions) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!settingsOptionsRef.current?.contains(event.target as Node)) {
        setShowSettingsOptions(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSettingsOptions(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showSettingsOptions]);

  const settingsSections: Array<{id: SettingsSection;label: string; icon: React.ComponentType<{className?:string}>;danger?:boolean}> = [
    {id:'general',label:'البيانات الرسمية والضريبة',icon:Building},
    {id:'units',label:'وحدات القياس وآليات الاحتساب',icon:Scale},
    {id:'currency',label:'العملات وأسعار الصرف',icon:Coins},
    {id:'shortcuts',label:'اختصارات الشاشة الرئيسية',icon:SlidersHorizontal},
    {id:'sql',label:'التشغيل المحلي وربط خادم SQL',icon:Server},
    {id:'telegram',label:'تكامل تليجرام (البوت)',icon:Cloud},
    {id:'backup',label:'النسخ الاحتياطي والصيانة',icon:ShieldAlert},
    {id:'reset_db',label:'تصفير قاعدة البيانات (التشغيل الفعلي)',icon:Trash2,danger:true}
  ];

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
  const [previewKind, setPreviewKind] = useState<'a4' | 'thermal'>('a4');

  // Logo file upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WebP)');
      return;
    }
    // Preserve logo detail on the official A4 header; 400px was insufficient.
    resizeAndCompressImage(file, 1200, 1200, .96)
      .then(url=>{setLogoUrl(url);setGeneralDirty(true);}).catch(console.error);
  };

  // Full Header banner file upload handler
  const handleHeaderImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WebP)');
      return;
    }
    // Preserve print-ready pixels: the old 1200x300 / 80% JPEG upload
    // irreversibly blurred official letterheads in both PDF and paper prints.
    preparePrintLetterhead(file)
      .then(url=>{setHeaderImageUrl(url);setGeneralDirty(true);})
      .catch(error=>{
        console.error('Print letterhead upload failed',error);
        alert('تعذّر تجهيز الترويسة عالية الدقة. استخدم صورة PNG أو JPG سليمة، ويفضّل عرض 2400 إلى 3200 بكسل.');
      });
  };

  
  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resizeAndCompressImage(file, 300, 300).then(url=>{setStampUrl(url);setGeneralDirty(true);}).catch(console.error);
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resizeAndCompressImage(file, 300, 300).then(url=>{setSignatureUrl(url);setGeneralDirty(true);}).catch(console.error);
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
            <h2 className="text-sm font-bold text-slate-900">
              {settingsSections.find(section => section.id === activeTab)?.label || 'إعدادات النظام والمنشأة'}
            </h2>
            <p className="text-[10px] text-slate-400 font-light">
              {activeTab === 'general' ? 'بيانات المنشأة والترويسة والأرقام الضريبية الرسمية'
                : activeTab === 'backup' ? 'النسخ الاحتياطية والاستعادة ومتابعة صيانة البيانات'
                : 'خيارات هذا القسم فقط، وبقية الإعدادات من زر خيارات الإعدادات'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isSaved && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>تم حفظ الإعدادات محليًا، وتنتظر تأكيد المزامنة مع الخادم</span>
            </span>
          )}
          <div className="relative" ref={settingsOptionsRef}>
            <button
              type="button"
              onClick={() => setShowSettingsOptions(open => !open)}
              aria-expanded={showSettingsOptions}
              aria-controls="settings-options-dropdown"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100"
              data-testid="settings-options-toggle"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>خيارات الإعدادات</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSettingsOptions ? 'rotate-180' : ''}`} />
            </button>
            {showSettingsOptions && (
              <div
                id="settings-options-dropdown"
                role="menu"
                aria-label="أقسام الإعدادات"
                className="absolute left-0 top-full z-50 mt-1 grid max-h-[65vh] w-[min(90vw,420px)] grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:grid-cols-2"
                data-testid="settings-options-dropdown"
              >
                {settingsSections.map(section => (
                  <button
                    key={section.id}
                    type="button"
                    role="menuitem"
                    aria-current={activeTab === section.id ? 'page' : undefined}
                    onClick={() => setActiveTab(section.id)}
                    className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-right text-xs font-bold transition-colors ${
                      activeTab === section.id
                        ? 'bg-blue-600 text-white'
                        : section.danger
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <section.icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{section.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {settingsSaveError && (
        <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
          {settingsSaveError}
        </div>
      )}
      {activeTab !== 'general' && (
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        إعدادات المنشأة والوحدات والعملات والتصنيفات مشتركة بين الأجهزة من قاعدة البيانات الموحدة.
        {syncCoordinatorState.conflict > 0
          ? ' توجد تعارضات مزامنة تحتاج مراجعة قبل اعتبار الإعدادات معتمدة.'
          : syncCoordinatorState.pending > 0
            ? ' توجد تغييرات محلية بانتظار تأكيد الخادم.'
            : ' لا توجد تغييرات معلقة مسجلة حاليًا.'}
        <span className="block mt-0.5 text-[10px]">إعداد اتصال الجهاز يبقى محليًا؛ ولا تُنقل جلسات الدخول أو المفاتيح الخاصة.</span>
      </div>
      )}
      {legacyImageBackup && isSystemAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span>توجد صورة ترويسة أو شعار أقدم محفوظ على هذا الجهاز تختلف عن الإعدادات المعتمدة. لن تُنشر تلقائيًا حتى لا تحل نسخة قديمة محل الأحدث.</span>
          <button type="button" onClick={() => { void recoverDeviceImages(); }} disabled={isSavingSettings}
            className="shrink-0 rounded-md bg-amber-800 px-3 py-1.5 font-bold text-white disabled:opacity-50">
            اعتماد صور هذا الجهاز على جميع الأجهزة
          </button>
        </div>
      )}
      {/* Compact official identity, print assets and taxation: all existing values remain editable. */}
      {activeTab === 'general' && (
        <form
          onSubmit={handleSave}
          onChangeCapture={() => setGeneralDirty(true)}
          className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xs"
          data-testid="official-tax-compact-settings"
        >
          <section className="space-y-2" aria-label="البيانات الرسمية للمنشأة">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <Building className="h-4 w-4 shrink-0 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-900">بيانات المنشأة الرسمية</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-2 py-1.5">
              <label htmlFor="official-app-title" className="shrink-0 font-bold text-slate-700">
                اسم البرنامج في شريط العنوان
              </label>
              <input
                id="official-app-title"
                type="text"
                required
                value={appTitle}
                onChange={e => setAppTitle(e.target.value)}
                className="h-8 min-w-[240px] flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <label className="block min-w-0">
                <span className="mb-1 block font-semibold text-slate-700">الاسم التجاري (عربي)</span>
                <input type="text" required value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 font-bold focus:border-blue-500 focus:outline-none" />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block font-semibold text-slate-700">الاسم التجاري (إنجليزي)</span>
                <input type="text" value={businessNameEn}
                  onChange={e => setBusinessNameEn(e.target.value)} dir="ltr"
                  className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-left focus:border-blue-500 focus:outline-none" />
              </label>
              <label className="block min-w-0 sm:col-span-2 xl:col-span-1">
                <span className="mb-1 block font-semibold text-slate-700">نوع النشاط والوصف الرسمي</span>
                <input type="text" value={activityType}
                  onChange={e => setActivityType(e.target.value)}
                  className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 focus:border-blue-500 focus:outline-none" />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0">
                <label htmlFor="official-vat-number" className="mb-1 block font-semibold text-slate-700">الرقم الضريبي الرسمي</label>
                <div className="flex min-w-0 items-center gap-1">
                  <input id="official-vat-number" type="text" value={taxNumber}
                    onChange={e => setTaxNumber(e.target.value)}
                    className="h-8 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 focus:border-blue-500 focus:outline-none" />
                  <label className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 px-1.5 text-[10px] text-slate-700" title="عرض الرقم الضريبي في المطبوعات">
                    <input type="checkbox" checked={showTaxNumberInPrints}
                      onChange={e => setShowTaxNumberInPrints(e.target.checked)} />
                    طباعة
                  </label>
                </div>
              </div>
              <div className="min-w-0">
                <label htmlFor="official-cr-number" className="mb-1 block font-semibold text-slate-700">رقم السجل التجاري / الترخيص</label>
                <div className="flex min-w-0 items-center gap-1">
                  <input id="official-cr-number" type="text" value={crNumber}
                    onChange={e => setCrNumber(e.target.value)}
                    className="h-8 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 focus:border-blue-500 focus:outline-none" />
                  <label className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 px-1.5 text-[10px] text-slate-700" title="عرض السجل التجاري في المطبوعات">
                    <input type="checkbox" checked={showCrNumberInPrints}
                      onChange={e => setShowCrNumberInPrints(e.target.checked)} />
                    طباعة
                  </label>
                </div>
              </div>
              <label className="block min-w-0">
                <span className="mb-1 block font-semibold text-slate-700">ضريبة القيمة المضافة (%)</span>
                <input type="number" value={vatRate} onChange={e => setVatRate(Number(e.target.value))}
                  className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 font-mono font-bold focus:border-blue-500 focus:outline-none" />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block font-semibold text-slate-700">رمز العملة المعروض</span>
                <input type="text" value={currency} onChange={e => setCurrency(e.target.value)}
                  className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 font-bold focus:border-blue-500 focus:outline-none" />
              </label>
            </div>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-2" aria-label="الهوية البصرية والترويسة">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <h3 className="flex items-center gap-1.5 font-bold text-slate-900">
                <ImageIcon className="h-4 w-4 text-blue-600" />
                صور المطبوعات والختم والتوقيع
              </h3>
              <span className="text-[10px] text-slate-500">
                الترويسة الكاملة لـ A4، والشعار للفاتورة الحرارية
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  key:'logo', title:'شعار المنشأة',value:logoUrl,
                  onUpload:handleLogoUpload,
                  onRemove:() => {setLogoUrl('');setGeneralDirty(true);},
                  hint:'يظهر في إيصال الكاشير الحراري'
                },
                {
                  key:'letterhead',title:'الترويسة الكاملة A4',value:headerImageUrl,
                  onUpload:handleHeaderImageUpload,
                  onRemove:() => {setHeaderImageUrl('');setGeneralDirty(true);},
                  hint:'ترويسة عالية الدقة للمطبوعات'
                },
                {
                  key:'stamp',title:'الختم الرسمي (4 سم)',value:stampUrl,
                  onUpload:handleStampUpload,
                  onRemove:() => {setStampUrl('');setGeneralDirty(true);},
                  hint:'الختم المستخدم في الفواتير والسندات'
                },
                {
                  key:'signature',title:'توقيع المدير / المخوّل',value:signatureUrl,
                  onUpload:handleSignatureUpload,
                  onRemove:() => {setSignatureUrl('');setGeneralDirty(true);},
                  hint:'التوقيع الرسمي للمستندات'
                }
              ].map(asset => (
                <div key={asset.key} className="min-w-0 rounded-md border border-slate-200 bg-slate-50/60 p-2">
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <strong className="truncate text-[11px] text-slate-800" title={asset.hint}>{asset.title}</strong>
                    {asset.value && <span className="shrink-0 text-[10px] font-bold text-emerald-700">مرفوع</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-14 w-[76px] shrink-0 items-center justify-center overflow-hidden rounded border border-dashed border-slate-300 bg-white">
                      {asset.value ? (
                        <img src={asset.value} alt={asset.title} className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 text-[11px] font-bold text-blue-800 hover:bg-blue-100">
                        <Upload className="h-3 w-3 shrink-0" />
                        <span>{asset.value ? 'استبدال' : 'رفع صورة'}</span>
                        <input type="file" accept="image/*" onChange={asset.onUpload} className="sr-only" aria-label={'رفع '+asset.title} />
                      </label>
                      {asset.value && (
                        <button type="button" onClick={asset.onRemove}
                          title={'إزالة '+asset.title}
                          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-rose-200 bg-white px-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">
                          <Trash2 className="h-3 w-3" />
                          إزالة
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-2 border-t border-slate-200 pt-2 md:grid-cols-2" aria-label="التواصل والفروع">
            <div className="min-w-0 rounded-md border border-slate-200 p-2">
              <h3 className="mb-1.5 flex items-center gap-1.5 font-bold text-slate-900">
                <PhoneIcon className="h-3.5 w-3.5 text-blue-600" />
                أرقام الهواتف والتواصل
              </h3>
              <div className="flex items-center gap-1.5">
                <input type="text" value={newPhoneInput} placeholder="رقم هاتف جديد"
                  onChange={e => setNewPhoneInput(e.target.value)}
                  onKeyDown={e => {if(e.key==='Enter'){e.preventDefault();handleAddPhone();}}}
                  className="h-8 w-full min-w-0 flex-1 rounded-md border border-slate-300 px-2 focus:border-blue-500 focus:outline-none" />
                <button type="button" onClick={() => {handleAddPhone();setGeneralDirty(true);}}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2 font-bold text-white hover:bg-blue-700">
                  <Plus className="h-3.5 w-3.5" /> إضافة
                </button>
              </div>
              {phones.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {phones.map((phone,index) => (
                    <span key={index} className="inline-flex min-w-0 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px]">
                      <span className="break-all">{phone}</span>
                      <button type="button" title="حذف الرقم" aria-label={'حذف '+phone}
                        onClick={() => {handleRemovePhone(index);setGeneralDirty(true);}}
                        className="font-bold text-rose-600 hover:text-rose-800">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="min-w-0 rounded-md border border-slate-200 p-2">
              <h3 className="mb-1.5 flex items-center gap-1.5 font-bold text-slate-900">
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
                العناوين وفروع المنشأة
              </h3>
              <div className="flex items-center gap-1.5">
                <input type="text" value={newAddressInput} placeholder="عنوان أو فرع جديد"
                  onChange={e => setNewAddressInput(e.target.value)}
                  onKeyDown={e => {if(e.key==='Enter'){e.preventDefault();handleAddAddress();}}}
                  className="h-8 w-full min-w-0 flex-1 rounded-md border border-slate-300 px-2 focus:border-blue-500 focus:outline-none" />
                <button type="button" onClick={() => {handleAddAddress();setGeneralDirty(true);}}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2 font-bold text-white hover:bg-blue-700">
                  <Plus className="h-3.5 w-3.5" /> إضافة
                </button>
              </div>
              {addresses.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {addresses.map((address,index) => (
                    <span key={index} className="inline-flex min-w-0 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px]">
                      <span className="break-words">{address}</span>
                      <button type="button" title="حذف العنوان" aria-label={'حذف '+address}
                        onClick={() => {handleRemoveAddress(index);setGeneralDirty(true);}}
                        className="font-bold text-rose-600 hover:text-rose-800">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="border-t border-slate-200 pt-2">
            <label htmlFor="official-invoice-footer" className="mb-1 block font-semibold text-slate-800">
              نص تذييل الفاتورة وسندات التسليم
            </label>
            <textarea id="official-invoice-footer" rows={2} value={invoiceFooter}
              onChange={e => setInvoiceFooter(e.target.value)} placeholder="النص الذي يظهر أسفل الفاتورة"
              className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
          </section>

          {showLivePreview && (
            <section className="space-y-2 rounded-md border border-blue-200 bg-slate-50 p-2" aria-label="معاينة المطبوعات">
              <h3 className="flex items-center gap-1.5 font-bold text-slate-900">
                <Eye className="h-3.5 w-3.5 text-blue-600" />
                {previewKind === 'a4' ? 'معاينة الترويسة على ورق A4' : 'معاينة إيصال الكاشير الحراري (80mm)'}
              </h3>
              <div className="max-h-[56vh] overflow-auto rounded border border-slate-200 bg-white p-3">
                {previewKind === 'a4' ? (
                  <>
                    <PrintHeader
                      title="فاتورة ضريبية / كشف حساب"
                      subtitle="معاينة حية"
                      docNumber="INV-PREVIEW"
                      docDate={new Date().toISOString().split('T')[0]}
                      overrideSettings={{
                        businessName,businessNameEn,activityType,taxNumber,crNumber,
                        showTaxNumberInPrints,showCrNumberInPrints,logoUrl,
                        headerImageUrl,addresses,phones
                      }}
                    />
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-2 text-center">
                      <div>
                        <span className="mb-1 block font-semibold text-slate-700">توقيع المدير</span>
                        {signatureUrl ? <img src={signatureUrl} alt="توقيع المدير" className="mx-auto h-16 max-w-[140px] object-contain" /> :
                          <div className="mx-auto mt-6 w-28 border-b border-dashed border-slate-400" />}
                      </div>
                      <div>
                        <span className="mb-1 block font-semibold text-slate-700">الختم الرسمي</span>
                        <OfficialStamp stampUrl={stampUrl} showDefaultIfEmpty={!stampUrl} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mx-auto max-w-md">
                    <ThermalReceiptHeader
                      receiptTitle="فاتورة مبيعات نقدية"
                      overrideSettings={{
                        businessName,businessNameEn,activityType,taxNumber,crNumber,
                        showTaxNumberInPrints,showCrNumberInPrints,logoUrl,addresses,phones
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-1 pt-2 pb-1 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button"
                onClick={() => {setPreviewKind('a4');setShowLivePreview(showLivePreview && previewKind==='a4' ? false : true);}}
                aria-pressed={showLivePreview && previewKind==='a4'}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 font-bold text-slate-700 hover:bg-slate-50">
                <Eye className="h-3.5 w-3.5" /> معاينة A4
              </button>
              <button type="button"
                onClick={() => {setPreviewKind('thermal');setShowLivePreview(showLivePreview && previewKind==='thermal' ? false : true);}}
                aria-pressed={showLivePreview && previewKind==='thermal'}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 font-bold text-slate-700 hover:bg-slate-50">
                <Printer className="h-3.5 w-3.5" /> معاينة الحراري
              </button>
            </div>
            <button type="submit" disabled={isSavingSettings}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="h-3.5 w-3.5" />
              {isSavingSettings ? 'جارٍ حفظ الإعدادات…' : 'حفظ البيانات الرسمية والترويسة'}
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
    </div>
  );
};

