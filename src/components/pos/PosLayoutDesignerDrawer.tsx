import React from 'react';
import {
  X,
  Sliders,
  Eye,
  EyeOff,
  Layout,
  Table,
  Check,
  RotateCcw,
  Sparkles,
  CreditCard,
  Layers,
  Maximize2,
  Type,
  Palette,
  Columns
} from 'lucide-react';
import {
  PosLayoutConfig,
  DEFAULT_POS_LAYOUT_CONFIG
} from '../../types/posLayoutCustomizer';

interface PosLayoutDesignerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config?: PosLayoutConfig;
  layoutConfig?: PosLayoutConfig;
  onSaveConfig?: (config: PosLayoutConfig) => void;
  onUpdateLayoutConfig?: (config: PosLayoutConfig) => void;
  onResetDefaults?: () => void;
  onResetLayout?: () => void;
  onOpenButtonCustomizer: () => void;
  onToggleLiveEdit?: () => void;
  onToggleLiveCustomizing?: () => void;
  isLiveEditActive?: boolean;
  isLiveCustomizing?: boolean;
  onResetColumnWidths?: () => void;
  userName?: string;
  isAdmin?: boolean;
  onApplyAsSystemDefault?: (config: PosLayoutConfig) => void;
  onResetToAdminDefaults?: () => void;
}

export const PosLayoutDesignerDrawer: React.FC<PosLayoutDesignerDrawerProps> = ({
  isOpen,
  onClose,
  config,
  layoutConfig,
  onSaveConfig,
  onUpdateLayoutConfig,
  onResetDefaults,
  onResetLayout,
  onOpenButtonCustomizer,
  onToggleLiveEdit,
  onToggleLiveCustomizing,
  isLiveEditActive,
  isLiveCustomizing,
  onResetColumnWidths,
  userName,
  isAdmin = false,
  onApplyAsSystemDefault,
  onResetToAdminDefaults
}) => {
  const activeConfig = config || layoutConfig || DEFAULT_POS_LAYOUT_CONFIG;
  const [localConfig, setLocalConfig] = React.useState<PosLayoutConfig>(activeConfig);

  React.useEffect(() => {
    if (config || layoutConfig) {
      setLocalConfig(config || layoutConfig || DEFAULT_POS_LAYOUT_CONFIG);
    }
  }, [config, layoutConfig, isOpen]);

  if (!isOpen) return null;

  const effectiveLiveEdit = Boolean(isLiveEditActive || isLiveCustomizing);
  const handleToggleLive = onToggleLiveEdit || onToggleLiveCustomizing || (() => {});
  const handleSave = onSaveConfig || onUpdateLayoutConfig || (() => {});

  const handleToggleSection = (key: keyof PosLayoutConfig) => {
    setLocalConfig(prev => {
      const base = prev || activeConfig;
      return {
        ...base,
        [key]: !base[key]
      };
    });
  };

  const handleToggleColumn = (colKey: keyof PosLayoutConfig['tableColumns']) => {
    setLocalConfig(prev => {
      const base = prev || activeConfig;
      const baseCols = base.tableColumns || DEFAULT_POS_LAYOUT_CONFIG.tableColumns;
      return {
        ...base,
        tableColumns: {
          ...baseCols,
          [colKey]: !baseCols[colKey]
        }
      };
    });
  };

  const handleSaveAndApply = () => {
    handleSave(localConfig || activeConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col overflow-hidden text-slate-800 text-xs animate-in slide-in-from-left duration-200" dir="rtl">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between border-b border-blue-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl text-amber-300">
              <Layout className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>مصمم واجهة الكاشير</span>
                <span className="text-[10px] bg-amber-400 text-amber-950 font-black px-2 py-0.5 rounded-full">
                  {userName ? `شاشة: ${userName}` : 'تخصيص كامل'}
                </span>
              </h2>
              <p className="text-xs text-blue-200">
                تخصيص شاشتك الفردية المستقلة مع إمكانية التوريث من إعدادات مدير النظام
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-xl text-blue-100 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Admin System Baseline Banner */}
        {isAdmin && onApplyAsSystemDefault && (
          <div className="p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex items-center justify-between gap-2 text-amber-950">
            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>أنت بصلاحية مدير النظام: يمكنك اعتماد إعداداتك كمرجعية لجميع المستخدمين</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onApplyAsSystemDefault(localConfig || activeConfig);
                onClose();
              }}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-amber-950 font-black rounded-lg text-[10px] shadow-xs cursor-pointer whitespace-nowrap transition"
              title="حفظ هذا التنسيق كشاشة البداية الافتراضية لكافة مستخدمي النظام"
            >
              ⭐ اعتماد كافتراضي للنظام
            </button>
          </div>
        )}

        {/* Quick Action Buttons Toolbar inside Designer */}
        <div className="p-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleToggleLive}
            className={`flex-1 py-1.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs ${
              effectiveLiveEdit
                ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-300'
                : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>{effectiveLiveEdit ? 'التعديل المباشر مُفعّل' : 'تفعيل التعديل المباشر'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenButtonCustomizer}
            className="flex-1 py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>مصمم الأزرار ⚙️</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Section 1: إظهار وإخفاء أقسام شاشة الكاشير */}
          <div>
            <h3 className="text-xs font-black text-slate-900 mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>إظهار أو حذف أقسام الشاشة الرئيسية</span>
            </h3>

            <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
              {/* شريط الأدوات العلوي */}
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-bold text-slate-800">شريط الأدوات وأزرار التنقل العلوي</div>
                  <div className="text-[9px] text-slate-400 font-light">أزرار الإلغاء، التنقل بين الفواتير، والبحث</div>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.showTopToolbar}
                  onChange={() => handleToggleSection('showTopToolbar')}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </label>

              {/* قسم بيانات العميل والفرع */}
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-bold text-slate-800">قسم بيانات العميل والفرع العلوي</div>
                  <div className="text-[9px] text-slate-400 font-light">اسم العميل، كود العميل، الرصيد، الجوال</div>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.showCustomerHeader}
                  onChange={() => handleToggleSection('showCustomerHeader')}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </label>

              {/* خيار تثبيت التاريخ لجميع العمليات */}
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-amber-50/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>تثبيت تاريخ الفاتورة في كافة العمليات</span>
                    {localConfig.isDateLocked && (
                      <span className="text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded">مفعل</span>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-400 font-light">عند التفعيل يثبت التاريخ على اليوم الحالي في كل العمليات، وعند الإلغاء يعتمد وقت وتاريخ الجهاز</div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(localConfig.isDateLocked)}
                  onChange={() => {
                    setLocalConfig(prev => {
                      const nextLocked = !prev.isDateLocked;
                      return {
                        ...prev,
                        isDateLocked: nextLocked,
                        lockedDate: nextLocked ? (prev.lockedDate || new Date().toISOString().split('T')[0]) : ''
                      };
                    });
                  }}
                  className="w-4 h-4 text-amber-600 rounded cursor-pointer"
                />
              </label>

              {/* خيارات الرأس الإضافية (شحن، مندوب، فئة سعر) */}
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-bold text-slate-800">شريط الملاحظات وخدمة التوصيل</div>
                  <div className="text-[9px] text-slate-400 font-light">حقل ملاحظات الفاتورة وزر خدمة التوصيل والأسعار الخاصة</div>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.showExtraHeaderOptions}
                  onChange={() => handleToggleSection('showExtraHeaderOptions')}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </label>

              {/* لوحة الأدوات الجانبية */}
              {/* مفضلة الكاشير الأيمن الممتد */}
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <span>شريط مفضلة الكاشير (الأيمن الممتد لأعلى)</span>
                    <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded">افتراضي</span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-light">يمتد رأسياً على يمين الشاشة بجوار رقم الفاتورة والجدول</div>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.showFavoritesSidebar !== false}
                  onChange={() => handleToggleSection('showFavoritesSidebar')}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </label>

              {/* شريط الاختصارات السريعة المخصص */}
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-bold text-slate-800">شريط الاختصارات السريعة أسفل الجدول</div>
                  <div className="text-[9px] text-slate-400 font-light">شريط الأزرار المخصصة للأصناف والخصومات السريعة</div>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.showQuickShortcutsBar}
                  onChange={() => handleToggleSection('showQuickShortcutsBar')}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </label>

              {/* شريط إحصائيات الجدول */}
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-bold text-slate-800">شريط إحصائيات جدول الأصناف</div>
                  <div className="text-[9px] text-slate-400 font-light">إجمالي عدد الأصناف، إجمالي القطع، ومجموع البنود</div>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.showTableStatsFooter}
                  onChange={() => handleToggleSection('showTableStatsFooter')}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </label>

              {/* تفاصيل الإجماليات والخصم */}
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-bold text-slate-800">تفاصيل الإجماليات والخصم والمتبقي</div>
                  <div className="text-[9px] text-slate-400 font-light">صناديق الحسابات السفلية: الإجمالي، الخصم، الضريبة، المتبقي</div>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.showTotalsBreakdown}
                  onChange={() => handleToggleSection('showTotalsBreakdown')}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </label>

              {/* لوحة الدفع والصندوق الموحدة */}
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-bold text-slate-800">لوحة الدفع والصندوق الموحدة في الأسفل</div>
                  <div className="text-[9px] text-slate-400 font-light">الصندوق المستلم، آلية الدفع، عملة الفاتورة وسعر الصرف</div>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.showPaymentConsole}
                  onChange={() => handleToggleSection('showPaymentConsole')}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Section 2: تخصيص أعمدة جدول الفاتورة */}
          <div>
            <h3 className="text-xs font-black text-slate-900 mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
              <Columns className="w-4 h-4 text-emerald-600" />
              <span>تخصيص أعمدة جدول الفاتورة (حذف أو إظهار)</span>
            </h3>

            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showIndex !== false}
                  onChange={() => handleToggleColumn('showIndex')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود الترقيم المسلسل (م)</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(localConfig.tableColumns.showItemCode)}
                  onChange={() => handleToggleColumn('showItemCode')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود رقم الصنف</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showNotes}
                  onChange={() => handleToggleColumn('showNotes')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود الملاحظات</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showDimensions}
                  onChange={() => handleToggleColumn('showDimensions')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">أعمدة الأبعاد (الطول، العرض)</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showCount !== false}
                  onChange={() => handleToggleColumn('showCount')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود العدد</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showQuantity}
                  onChange={() => handleToggleColumn('showQuantity')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود الكمية</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showUnit}
                  onChange={() => handleToggleColumn('showUnit')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود الوحدة</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showUnitPrice}
                  onChange={() => handleToggleColumn('showUnitPrice')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود السعر</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showDiscount}
                  onChange={() => handleToggleColumn('showDiscount')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود الخصم</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showTax}
                  onChange={() => handleToggleColumn('showTax')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود الضريبة</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showAttachments}
                  onChange={() => handleToggleColumn('showAttachments')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود المرفقات</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showImageThumbnail}
                  onChange={() => handleToggleColumn('showImageThumbnail')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">عمود صورة البند</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.tableColumns.showDeleteButton}
                  onChange={() => handleToggleColumn('showDeleteButton')}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <span className="font-bold text-slate-800">زر الحذف السريع (✕)</span>
              </label>
            </div>

            {/* Note & Reset button for Excel-like column widths */}
            <div className="mt-2.5 p-2 bg-blue-50/80 rounded-xl border border-blue-200/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <span className="text-[11px] text-blue-900 font-medium">
                💡 يمكنك سحب فواصل الأعمدة بالماوس لتكبيرها أو تصغيرها مثل إكسل تماماً.
              </span>
              {onResetColumnWidths && (
                <button
                  type="button"
                  onClick={onResetColumnWidths}
                  className="shrink-0 px-2 py-1 bg-white hover:bg-blue-100 text-blue-800 hover:text-blue-950 font-bold rounded-lg border border-blue-300 flex items-center gap-1.5 cursor-pointer text-[11px] shadow-2xs transition-colors"
                >
                  <RotateCcw className="w-3 h-3 text-blue-600" />
                  <span>إعادة ضبط عرض الأعمدة</span>
                </button>
              )}
            </div>
          </div>

          {/* Section 3: ترتيب الشريط السفلي وتوزيع عناصر الدفع */}
          <div>
            <h3 className="text-xs font-black text-slate-900 mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
              <CreditCard className="w-4 h-4 text-amber-600" />
              <span>ترتيب وتوزيع قسم الدفع في أسفل الشاشة</span>
            </h3>

            <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-amber-50/50 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">لوحة الدفع والصندوق الموسعة أولاً (موصى بها)</div>
                  <div className="text-[9px] text-slate-400 font-light">كل ما يتعلق بالصندوق والعملات وسعر الصرف وآلية الدفع</div>
                </div>
                <input
                  type="radio"
                  name="bottomLayoutOrder"
                  value="payment_first"
                  checked={localConfig.bottomLayoutOrder === 'payment_first'}
                  onChange={() => setLocalConfig(prev => ({ ...prev, bottomLayoutOrder: 'payment_first' }))}
                  className="w-4 h-4 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-amber-50/50 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">أزرار الإجراءات (حفظ وطباعة) أولاً بالوسط</div>
                  <div className="text-[9px] text-slate-400 font-light">الترتيب الكلاسيكي مع الأزرار المركزية</div>
                </div>
                <input
                  type="radio"
                  name="bottomLayoutOrder"
                  value="standard"
                  checked={localConfig.bottomLayoutOrder === 'standard'}
                  onChange={() => setLocalConfig(prev => ({ ...prev, bottomLayoutOrder: 'standard' }))}
                  className="w-4 h-4 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:bg-amber-50/50 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">صناديق الإجماليات والمتبقي أولاً</div>
                  <div className="text-[9px] text-slate-400 font-light">التركيز على مبالغ الحسابات والمتبقي</div>
                </div>
                <input
                  type="radio"
                  name="bottomLayoutOrder"
                  value="totals_first"
                  checked={localConfig.bottomLayoutOrder === 'totals_first'}
                  onChange={() => setLocalConfig(prev => ({ ...prev, bottomLayoutOrder: 'totals_first' }))}
                  className="w-4 h-4 text-blue-600"
                />
              </label>
            </div>
          </div>

          {/* Section 4: كثافة وحجم عناصر الشاشة */}
          <div>
            <h3 className="text-xs font-black text-slate-900 mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
              <Maximize2 className="w-4 h-4 text-purple-600" />
              <span>كثافة وحجم خطوط الواجهة</span>
            </h3>

            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setLocalConfig(prev => ({ ...prev, uiDensity: 'compact' }))}
                className={`p-2 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                  localConfig.uiDensity === 'compact'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div>مضغوط</div>
                <div className="text-[9px] opacity-80">أصناف أكثر</div>
              </button>

              <button
                type="button"
                onClick={() => setLocalConfig(prev => ({ ...prev, uiDensity: 'normal' }))}
                className={`p-2 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                  localConfig.uiDensity === 'normal'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div>متوازن</div>
                <div className="text-[9px] opacity-80">الوضع القياسي</div>
              </button>

              <button
                type="button"
                onClick={() => setLocalConfig(prev => ({ ...prev, uiDensity: 'spacious' }))}
                className={`p-2 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                  localConfig.uiDensity === 'spacious'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div>مريح</div>
                <div className="text-[9px] opacity-80">شاشات اللمس</div>
              </button>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {onResetToAdminDefaults && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('هل ترغب في استعادة إعدادات شاشة مدير النظام الافتراضية؟')) {
                    onResetToAdminDefaults();
                    onClose();
                  }
                }}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold rounded-xl flex items-center gap-1 cursor-pointer text-xs transition"
                title="إلغاء التخصيصات الفردية والرجوع لإعدادات شاشة مدير النظام"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>استعادة شاشة مدير النظام 🔄</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl cursor-pointer text-xs"
            >
              إلغاء
            </button>

            {isAdmin && onApplyAsSystemDefault && (
              <button
                type="button"
                onClick={() => {
                  onApplyAsSystemDefault(localConfig || activeConfig);
                  onClose();
                }}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-amber-950 font-black rounded-xl flex items-center gap-1 cursor-pointer shadow-xs text-xs transition"
                title="اعتماد هذا التنسيق كشاشة البداية الافتراضية لكافة المستخدمين الجدد"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>اعتماد كافتراضي للنظام ⭐</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveAndApply}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs text-xs"
            >
              <Check className="w-4 h-4" />
              <span>حفظ لشاشتي الحالية ✓</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
