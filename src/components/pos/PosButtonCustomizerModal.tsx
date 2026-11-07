import React, { useState } from 'react';
import {
  X,
  Settings,
  Plus,
  RotateCcw,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Save,
  Check,
  Sparkles,
  ArrowRightLeft,
  Sliders,
  Tag
} from 'lucide-react';
import {
  PosCustomButton,
  PosButtonLocation,
  PosButtonActionType,
  PosButtonColorScheme,
  DEFAULT_POS_BUTTONS
} from '../../types/posCustomizer';
import { renderPosIcon } from './PosCustomButtonRenderer';
import { InventoryItem } from '../../types';

interface PosButtonCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  buttons: PosCustomButton[];
  onSaveButtons: (buttons: PosCustomButton[]) => void;
  onToggleLiveEdit: () => void;
  isLiveEditActive: boolean;
  inventory: InventoryItem[];
  onResetToAdminDefaults?: () => void;
}

const COLOR_OPTIONS: { value: PosButtonColorScheme; label: string; bg: string }[] = [
  { value: 'blue', label: 'أزرق قياسي', bg: 'bg-[#1976d2]' },
  { value: 'emerald', label: 'زمردي / أخضر', bg: 'bg-[#059669]' },
  { value: 'amber', label: 'كهرماني / ذهبي', bg: 'bg-[#d97706]' },
  { value: 'rose', label: 'أحمر / وردي', bg: 'bg-[#e11d48]' },
  { value: 'purple', label: 'بنفسجي ملكي', bg: 'bg-[#7c3aed]' },
  { value: 'indigo', label: 'نيلي غامق', bg: 'bg-[#2d5f99]' },
  { value: 'cyan', label: 'سماوي بحري', bg: 'bg-[#0891b2]' },
  { value: 'orange', label: 'برتقالي مشرق', bg: 'bg-[#ea580c]' },
  { value: 'slate', label: 'رمادي داكن', bg: 'bg-[#334155]' }
];

const AVAILABLE_ICONS = [
  'Save',
  'Printer',
  'Banknote',
  'CreditCard',
  'PauseCircle',
  'Clock',
  'Star',
  'Ban',
  'Trash2',
  'RotateCcw',
  'Search',
  'FileText',
  'Percent',
  'PackageSearch',
  'Calculator',
  'Layers',
  'Sparkles',
  'Tag',
  'Volume2',
  'Camera',
  'Scan',
  'Zap'
];

const ACTION_OPTIONS: { type: PosButtonActionType; label: string }[] = [
  { type: 'open_camera_scanner', label: 'تشغيل كاميرا الباركود المباشرة 📷' },
  { type: 'save_invoice', label: 'حفظ الفاتورة (F5)' },
  { type: 'save_and_print', label: 'حفظ وطباعة حراري (Alt+C)' },
  { type: 'save_and_print_a4_custom', label: 'حفظ وطباعة A4 (تصميم 2)' },
  { type: 'quick_pay_cash', label: 'سداد نقدي سريع' },
  { type: 'pay_cash_and_print', label: 'سداد نقدي وطباعة الإيصال' },
  { type: 'pay_cash_and_print_a4_custom', label: 'سداد نقدي وطباعة A4 (تصميم 2)' },
  { type: 'quick_pay_card', label: 'سداد بالبطاقة / فيزا' },
  { type: 'hold_invoice', label: 'تعليق الفاتورة الحالية (F9)' },
  { type: 'held_invoices_list', label: 'عرض قائمة الفواتير المعلقة' },
  { type: 'clear_invoice', label: 'إلغاء الفاتورة والبدء بجديدة' },
  { type: 'open_favorite_drawer', label: 'فتح نافذة الأصناف والمفضلة' },
  { type: 'open_item_search', label: 'بحث متقدم في الأصناف' },
  { type: 'open_customer_ledger', label: 'فتح كشف حساب العميل' },
  { type: 'search_invoices', label: 'بحث في أرشيف الفواتير' },
  { type: 'open_calculator', label: 'فتح الآلة الحاسبة' },
  { type: 'open_cash_drawer', label: 'فتح درج النقدية' },
  { type: 'quick_discount_percent', label: 'خصم نسبة مئوية سريعة (%)' },
  { type: 'quick_discount_amount', label: 'خصم مبلغ نقدي ثابت' },
  { type: 'insert_item', label: 'إدراج صنف مخصص بنقرة واحدة' },
  { type: 'sound_test', label: 'رنة الكاشير التنبيهية' },
  { type: 'refresh_data', label: 'تحديث بيانات النظام' },
  { type: 'delete_invoice', label: 'حذف آخر فاتورة' },
  { type: 'nav_first', label: 'التنقل: أول فاتورة' },
  { type: 'nav_prev', label: 'التنقل: الفاتورة السابقة' },
  { type: 'nav_next', label: 'التنقل: الفاتورة التالية' },
  { type: 'nav_last', label: 'التنقل: آخر فاتورة' },
  { type: 'open_invoice_details', label: 'عرض تفاصيل الفاتورة الشاملة' },
  { type: 'open_daily_invoices', label: 'سجل فواتير اليوم والحالات' },
  { type: 'add_delivery_service', label: 'إضافة خدمة توصيل تلقائياً كصنف' }
];

export const PosButtonCustomizerModal: React.FC<PosButtonCustomizerModalProps> = ({
  isOpen,
  onClose,
  buttons,
  onSaveButtons,
  onToggleLiveEdit,
  isLiveEditActive,
  inventory,
  onResetToAdminDefaults
}) => {
  const [activeTab, setActiveTab] = useState<PosButtonLocation>('bottom_bar');
  const [localButtons, setLocalButtons] = useState<PosCustomButton[]>(buttons);

  // Editing or creating button state
  const [editingButton, setEditingButton] = useState<PosCustomButton | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form state for new / edit button
  const [formLabel, setFormLabel] = useState('');
  const [formSubLabel, setFormSubLabel] = useState('');
  const [formIcon, setFormIcon] = useState('Tag');
  const [formAction, setFormAction] = useState<PosButtonActionType>('insert_item');
  const [formColor, setFormColor] = useState<PosButtonColorScheme>('blue');
  const [formLocation, setFormLocation] = useState<PosButtonLocation>('bottom_bar');
  const [formShortcut, setFormShortcut] = useState('');
  const [formPayload, setFormPayload] = useState<any>(null);

  if (!isOpen) return null;

  // Filter buttons by active tab and sort by order
  const currentSectionButtons = localButtons
    .filter(b => b.location === activeTab)
    .sort((a, b) => a.order - b.order);

  // Move button up in order
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const targetList = [...currentSectionButtons];
    const temp = targetList[index];
    targetList[index] = targetList[index - 1];
    targetList[index - 1] = temp;

    // Re-assign orders
    const updatedWithOrder = targetList.map((btn, i) => ({ ...btn, order: i + 1 }));

    // Merge back into all buttons
    setLocalButtons(prev => {
      const others = prev.filter(b => b.location !== activeTab);
      return [...others, ...updatedWithOrder];
    });
  };

  // Move button down in order
  const handleMoveDown = (index: number) => {
    if (index === currentSectionButtons.length - 1) return;
    const targetList = [...currentSectionButtons];
    const temp = targetList[index];
    targetList[index] = targetList[index + 1];
    targetList[index + 1] = temp;

    // Re-assign orders
    const updatedWithOrder = targetList.map((btn, i) => ({ ...btn, order: i + 1 }));

    setLocalButtons(prev => {
      const others = prev.filter(b => b.location !== activeTab);
      return [...others, ...updatedWithOrder];
    });
  };

  // Toggle button visibility (Show / Hide)
  const handleToggleVisibility = (buttonId: string) => {
    setLocalButtons(prev =>
      prev.map(b => (b.id === buttonId ? { ...b, isVisible: !b.isVisible } : b))
    );
  };

  // Move to another location/section
  const handleMoveToSection = (buttonId: string, newLocation: PosButtonLocation) => {
    setLocalButtons(prev => {
      const maxOrderInNew = Math.max(
        0,
        ...prev.filter(b => b.location === newLocation).map(b => b.order)
      );
      return prev.map(b =>
        b.id === buttonId ? { ...b, location: newLocation, order: maxOrderInNew + 1 } : b
      );
    });
  };

  // Delete button
  const handleDeleteButton = (buttonId: string) => {
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا الزر من الواجهة؟')) {
      setLocalButtons(prev => prev.filter(b => b.id !== buttonId));
    }
  };

  // Open Edit Form
  const handleStartEdit = (button: PosCustomButton) => {
    setEditingButton(button);
    setIsAddingNew(false);
    setFormLabel(button.label);
    setFormSubLabel(button.subLabel || '');
    setFormIcon(button.iconName);
    setFormAction(button.actionType);
    setFormColor(button.colorScheme);
    setFormLocation(button.location);
    setFormShortcut(button.shortcut || '');
    setFormPayload(button.actionPayload || null);
  };

  // Open Add New Form
  const handleStartAddNew = () => {
    setEditingButton(null);
    setIsAddingNew(true);
    setFormLabel('');
    setFormSubLabel('');
    setFormIcon('Sparkles');
    setFormAction('insert_item');
    setFormColor('emerald');
    setFormLocation(activeTab);
    setFormShortcut('');
    setFormPayload(null);
  };

  // Save Edit / New Form
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLabel.trim()) {
      alert('يرجى كتابة نص أو اسم الزر');
      return;
    }

    if (isAddingNew) {
      const newId = `custom_btn_${Date.now()}`;
      const maxOrder = Math.max(
        0,
        ...localButtons.filter(b => b.location === formLocation).map(b => b.order)
      );
      const newBtn: PosCustomButton = {
        id: newId,
        label: formLabel.trim(),
        subLabel: formSubLabel.trim() || undefined,
        iconName: formIcon,
        actionType: formAction,
        actionPayload: formPayload,
        colorScheme: formColor,
        location: formLocation,
        shortcut: formShortcut.trim() || undefined,
        order: maxOrder + 1,
        isVisible: true,
        isCustom: true
      };
      setLocalButtons(prev => [...prev, newBtn]);
    } else if (editingButton) {
      setLocalButtons(prev =>
        prev.map(b =>
          b.id === editingButton.id
            ? {
                ...b,
                label: formLabel.trim(),
                subLabel: formSubLabel.trim() || undefined,
                iconName: formIcon,
                actionType: formAction,
                actionPayload: formPayload,
                colorScheme: formColor,
                location: formLocation,
                shortcut: formShortcut.trim() || undefined
              }
            : b
        )
      );
    }

    setIsAddingNew(false);
    setEditingButton(null);
  };

  // Apply all changes to parent and close
  const handleApplyAndClose = () => {
    onSaveButtons(localButtons);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between border-b border-blue-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Sliders className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>تخصيص واجهة الكاشير وترتيب الأزرار</span>
                <span className="text-[11px] bg-amber-400 text-amber-950 font-bold px-2 py-0.5 rounded-full">
                  يدوياً بالكامل
                </span>
              </h2>
              <p className="text-xs text-blue-200">
                يمكنك إعادة ترتيب الأزرار، إخفاء ما لا تحتاجه، وإضافة أزرار مخصصة فورية للأصناف والخصومات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onToggleLiveEdit();
              }}
              title="تفعيل أو إيقاف وضع التعديل المباشر في شاشة الكاشير"
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                isLiveEditActive
                  ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-300'
                  : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isLiveEditActive ? 'وضع التعديل المباشر مُفعّل' : 'تفعيل التعديل المباشر بالشاشة'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-xl text-blue-100 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-2 px-4 pt-3 bg-slate-100 border-b border-slate-200">
          <button
            onClick={() => {
              setActiveTab('bottom_bar');
              setIsAddingNew(false);
              setEditingButton(null);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl border-t border-x transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'bottom_bar'
                ? 'bg-white text-blue-900 border-slate-200 -mb-[1px] shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
          >
            <span>شريط الإجراءات السفلي (الرئيسي)</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-mono">
              {localButtons.filter(b => b.location === 'bottom_bar').length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('top_toolbar');
              setIsAddingNew(false);
              setEditingButton(null);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl border-t border-x transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'top_toolbar'
                ? 'bg-white text-blue-900 border-slate-200 -mb-[1px] shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
          >
            <span>شريط الأدوات العلوي</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-mono">
              {localButtons.filter(b => b.location === 'top_toolbar').length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('quick_grid');
              setIsAddingNew(false);
              setEditingButton(null);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl border-t border-x transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'quick_grid'
                ? 'bg-white text-blue-900 border-slate-200 -mb-[1px] shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
          >
            <span>شريط الاختصارات السريعة</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-mono">
              {localButtons.filter(b => b.location === 'quick_grid').length}
            </span>
          </button>

          <div className="mr-auto pb-2">
            <button
              onClick={handleStartAddNew}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-transform active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ إضافة زر مخصص جديد</span>
            </button>
          </div>
        </div>

        {/* Modal Body: Buttons List or Edit Form */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
          {isAddingNew || editingButton ? (
            /* Add / Edit Form */
            <form onSubmit={handleSaveForm} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-2xl mx-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-600" />
                  <span>{isAddingNew ? 'إضافة زر جديد إلى الواجهة' : `تعديل الزر: ${editingButton?.label}`}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setEditingButton(null);
                  }}
                  className="text-[10px] text-slate-400 font-light hover:text-slate-800 font-semibold"
                >
                  إلغاء التعديل
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم الزر (النص الظاهر):</label>
                  <input
                    type="text"
                    value={formLabel}
                    onChange={e => setFormLabel(e.target.value)}
                    placeholder="مثال: طباعة A4، خصم 15%..."
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-bold focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الوصف أو التلميح (اختياري):</label>
                  <input
                    type="text"
                    value={formSubLabel}
                    onChange={e => setFormSubLabel(e.target.value)}
                    placeholder="يظهر عند الوقوف على الزر"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الإجراء أو الوظيفة:</label>
                  <select
                    value={formAction}
                    onChange={e => {
                      const val = e.target.value as PosButtonActionType;
                      setFormAction(val);
                      if (val === 'insert_item' && inventory.length > 0) {
                        setFormPayload(inventory[0].id);
                        if (!formLabel) setFormLabel(inventory[0].name);
                      } else if (val === 'quick_discount_percent') {
                        setFormPayload(10);
                        if (!formLabel) setFormLabel('خصم 10%');
                      } else if (val === 'quick_discount_amount') {
                        setFormPayload(20);
                        if (!formLabel) setFormLabel('خصم 20');
                      }
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-bold"
                  >
                    {ACTION_OPTIONS.map(act => (
                      <option key={act.type} value={act.type}>
                        {act.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Conditional Payload Inputs */}
                {formAction === 'insert_item' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">اختر الصنف المراد إدراجه فوراً:</label>
                    <select
                      value={formPayload || ''}
                      onChange={e => {
                        setFormPayload(e.target.value);
                        const it = inventory.find(i => i.id === e.target.value);
                        if (it && !formLabel) {
                          setFormLabel(it.name);
                        }
                      }}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-bold"
                    >
                      {inventory.map(it => (
                        <option key={it.id} value={it.id}>
                          {it.name} ({it.sellingPrice} {it.unit || 'قطعة'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {formAction === 'quick_discount_percent' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">نسبة الخصم (%):</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={formPayload || 10}
                      onChange={e => setFormPayload(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-mono font-bold"
                    />
                  </div>
                )}

                {formAction === 'quick_discount_amount' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">مبلغ الخصم الثابت:</label>
                    <input
                      type="number"
                      min="1"
                      value={formPayload || 10}
                      onChange={e => setFormPayload(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-mono font-bold"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الموضع والقسم:</label>
                  <select
                    value={formLocation}
                    onChange={e => setFormLocation(e.target.value as PosButtonLocation)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-bold"
                  >
                    <option value="bottom_bar">شريط الإجراءات السفلي (الرئيسي)</option>
                    <option value="top_toolbar">شريط الأدوات العلوي</option>
                    <option value="quick_grid">شريط الاختصارات السريعة</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">مفتاح الاختصار (اختياري):</label>
                  <input
                    type="text"
                    value={formShortcut}
                    onChange={e => setFormShortcut(e.target.value)}
                    placeholder="مثال: Alt+C, Ctrl+S, F9..."
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-mono font-bold"
                  />
                </div>
              </div>

              {/* Icon Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 text-xs">الأيقونة المعبرة:</label>
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl max-h-28 overflow-y-auto">
                  {AVAILABLE_ICONS.map(ic => {
                    const isSelected = formIcon === ic;
                    return (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setFormIcon(ic)}
                        className={`p-2 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs scale-105'
                            : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                        }`}
                        title={ic}
                      >
                        {renderPosIcon(ic, 'w-4 h-4')}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color Scheme Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 text-xs">لون ومظهر الزر:</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {COLOR_OPTIONS.map(col => {
                    const isSelected = formColor === col.value;
                    return (
                      <button
                        key={col.value}
                        type="button"
                        onClick={() => setFormColor(col.value)}
                        className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 ring-2 ring-blue-400 bg-blue-50/50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-full ${col.bg} shrink-0`} />
                        <span className="truncate text-[11px]">{col.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setEditingButton(null);
                  }}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>{isAddingNew ? 'إضافة الزر للواجهة' : 'حفظ التعديلات'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* Buttons Table / Reorder List */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>
                  ترتيب أزرار <strong>{activeTab === 'bottom_bar' ? 'الشريط السفلي' : activeTab === 'top_toolbar' ? 'الشريط العلوي' : 'شريط الاختصارات'}</strong> (استخدم الأسهم لتحريك الزر للأعلى أو للأسفل):
                </span>
                <span className="text-[10px] text-slate-400 font-light">
                  إجمالي: {currentSectionButtons.length} زر
                </span>
              </div>

              {currentSectionButtons.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300">
                  <p className="text-slate-500 text-xs mb-3">لا توجد أزرار في هذا القسم حالياً</p>
                  <button
                    onClick={handleStartAddNew}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة زر جديد هنا</span>
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
                  {currentSectionButtons.map((btn, index) => {
                    return (
                      <div
                        key={btn.id}
                        className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                          !btn.isVisible ? 'bg-slate-50 opacity-60' : 'hover:bg-blue-50/40'
                        }`}
                      >
                        {/* Left: Reorder Arrows and Index */}
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-400 w-5 text-center">
                            {index + 1}
                          </span>
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveUp(index)}
                              disabled={index === 0}
                              title="تحريك لأعلى (تقديم)"
                              className="p-1 hover:bg-slate-200 disabled:opacity-30 rounded text-slate-700 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDown(index)}
                              disabled={index === currentSectionButtons.length - 1}
                              title="تحريك لأسفل (تأخير)"
                              className="p-1 hover:bg-slate-200 disabled:opacity-30 rounded text-slate-700 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Center: Button Preview & Metadata */}
                        <div className="flex-1 flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                            {renderPosIcon(btn.iconName, 'w-4 h-4 text-blue-700')}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 truncate">
                                {btn.label}
                              </span>
                              {btn.shortcut && (
                                <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                                  {btn.shortcut}
                                </span>
                              )}
                              {btn.isCustom && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                                  مخصص
                                </span>
                              )}
                              {!btn.isVisible && (
                                <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.2 rounded">
                                  مخفي
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-light truncate mt-0.5">
                              {btn.subLabel || ACTION_OPTIONS.find(a => a.type === btn.actionType)?.label || btn.actionType}
                            </div>
                          </div>
                        </div>

                        {/* Right: Actions (Move to section, Visibility, Edit, Delete) */}
                        <div className="flex items-center gap-1">
                          {/* Move to another section dropdown */}
                          <select
                            value={btn.location}
                            onChange={e => handleMoveToSection(btn.id, e.target.value as PosButtonLocation)}
                            className="text-[11px] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-2 py-1 font-bold text-slate-700 cursor-pointer"
                            title="نقل الزر إلى قسم آخر"
                          >
                            <option value="bottom_bar">الشريط السفلي</option>
                            <option value="top_toolbar">الشريط العلوي</option>
                            <option value="quick_grid">شريط الاختصارات</option>
                          </select>

                          {/* Toggle Visibility */}
                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(btn.id)}
                            title={btn.isVisible ? 'إخفاء الزر من الشاشة' : 'إظهار الزر في الشاشة'}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              btn.isVisible
                                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                                : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600'
                            }`}
                          >
                            {btn.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>

                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(btn)}
                            title="تعديل تفاصيل الزر ولونه"
                            className="p-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-blue-700 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteButton(btn.id)}
                            title="حذف الزر نهائياً"
                            className="p-1.5 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 rounded-lg text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            {onResetToAdminDefaults && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('هل ترغب في استعادة أزرار واختصارات شاشة مدير النظام الافتراضية؟')) {
                    onResetToAdminDefaults();
                    onClose();
                  }
                }}
                className="px-3 py-2 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                title="إلغاء التخصيصات الفردية والرجوع للأزرار الافتراضية لمدير النظام"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>استعادة أزرار مدير النظام 🔄</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleApplyAndClose}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>حفظ التعديلات لشاشتي ✓</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
