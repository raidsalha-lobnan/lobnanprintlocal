import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { InventoryItem } from '../../types';
import { ItemUnitSelector } from '../ItemUnitSelector';
import { X, Plus, Sparkles, Check, Hash, Tag, Barcode, FolderOpen, DollarSign, Archive } from 'lucide-react';

interface QuickAddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemCreatedAndAdd?: (item: InventoryItem) => void;
  initialName?: string;
}

export const QuickAddItemModal: React.FC<QuickAddItemModalProps> = ({
  isOpen,
  onClose,
  onItemCreatedAndAdd,
  initialName = ''
}) => {
  const { addInventoryItem, settings } = useAccounting();

  const [code, setCode] = useState('');
  const [name, setName] = useState(initialName);
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState<string>('office_supplies');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [stockQuantity, setStockQuantity] = useState<number>(10);
  const [unit, setUnit] = useState<string>('قطعة');
  const [autoAdd, setAutoAdd] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setCode('ITM-' + Math.floor(1000 + Math.random() * 9000));
      setBarcode('');
      setPurchasePrice(0);
      setSellingPrice(0);
      setStockQuantity(10);
      setUnit('قطعة');
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const generateBarcode = () => {
    const randomCode = '628' + Math.floor(10000000 + Math.random() * 90000000);
    setBarcode(randomCode);
  };

  const generateItemCode = () => {
    setCode('ITM-' + Math.floor(1000 + Math.random() * 9000));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newItem: Omit<InventoryItem, 'id'> = {
      code: code.trim() || ('ITM-' + Math.floor(1000 + Math.random() * 9000)),
      name: name.trim(),
      barcode: barcode.trim() || ('628' + Date.now().toString().slice(-8)),
      category: category as any,
      purchasePrice: Number(purchasePrice) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      stockQuantity: Number(stockQuantity) || 0,
      minAlertQuantity: 5,
      unit: unit || 'قطعة'
    };

    const createdItem = addInventoryItem(newItem);

    if (autoAdd && onItemCreatedAndAdd) {
      onItemCreatedAndAdd(createdItem);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-955/80 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl overflow-hidden text-slate-800 flex flex-col font-sans animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 border border-white/20 rounded-xl">
              <Plus className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-white">إضافة صنف جديد سريعاً</h3>
              <p className="text-[11px] text-purple-200 font-light">إدراج الصنف في المخزون والفاتورة مباشرة مع التكويد الآلي والباركود</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-purple-100 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
          {/* Row 1: Code and Name */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
            {/* SKU Code */}
            <div className="sm:col-span-4">
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-purple-600" />
                <span>رقم / كود الصنف *</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="رقم الصنف..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-blue-700 bg-white outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={generateItemCode}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-bold cursor-pointer transition shrink-0"
                  title="توليد كود تلقائي"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                  <span>توليد</span>
                </button>
              </div>
            </div>

            {/* Item Name */}
            <div className="sm:col-span-8">
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-purple-600" />
                <span>اسم الصنف أو الخدمة المطلوبة *</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="مثال: مطبوعات جلدية فاخرة أو ورق تصوير A4"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-xs font-bold text-slate-900 bg-white outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Row 2: Barcode, Category & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
            {/* Barcode */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5 text-purple-600" />
                <span>الباركود الدولي أو المحلي</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  placeholder="امسح بالباركود أو اضغط توليد..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono bg-white outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={generateBarcode}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold cursor-pointer transition shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>توليد باركود</span>
                </button>
              </div>
            </div>

            {/* Category */}
            <div className="sm:col-span-3">
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <FolderOpen className="w-3.5 h-3.5 text-purple-600" />
                <span>التصنيف / المجموعة</span>
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white font-bold text-slate-700 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              >
                {(settings.categories && settings.categories.length > 0) ? (
                  settings.categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="office_supplies">أدوات مكتبية ومدرسية</option>
                    <option value="stationery">قرطاسية ومكتبية</option>
                    <option value="print_raw">خامات ومواد الطباعة</option>
                    <option value="copy_scan">خدمات تصوير وتصميم</option>
                    <option value="books">كتب وروايات وملازم</option>
                    <option value="shields_gifts">دروع وهدايا</option>
                  </>
                )}
              </select>
            </div>

            {/* Unit */}
            <div className="sm:col-span-3">
              <ItemUnitSelector
                value={unit}
                onChange={setUnit}
                label="وحدة القياس:"
                placeholder="الوحدة..."
                showQuickPills={true}
              />
            </div>
          </div>

          {/* Row 3: Pricing & Stock (Cost, Selling Price, and Opening Stock) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
            {/* Cost Price */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                <span>سعر التكلفة / الشراء ({settings.currency})</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchasePrice || ''}
                  onChange={e => setPurchasePrice(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono bg-white outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">₪</span>
              </div>
            </div>

            {/* Selling Price */}
            <div>
              <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>سعر البيع المعتمد ({settings.currency}) *</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={sellingPrice || ''}
                  onChange={e => setSellingPrice(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border-2 border-emerald-400 bg-emerald-50/20 rounded-lg px-3 py-2 text-xs font-mono font-black text-emerald-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 font-bold">₪</span>
              </div>
            </div>

            {/* Opening Stock */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Archive className="w-3.5 h-3.5 text-amber-600" />
                <span>الرصيد الافتتاحي</span>
              </label>
              <input
                type="number"
                min="0"
                value={stockQuantity || ''}
                onChange={e => setStockQuantity(parseInt(e.target.value) || 0)}
                placeholder="10"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono bg-white outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Quick Auto-add toggle */}
          <div className="bg-purple-50/50 p-3.5 rounded-xl border border-purple-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                id="auto-add-invoice-toggle-checkbox"
                checked={autoAdd}
                onChange={e => setAutoAdd(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="auto-add-invoice-toggle-checkbox" className="font-bold text-slate-800 cursor-pointer text-xs">
                إضافة هذا الصنف مباشرة إلى جدول الفاتورة فور الحفظ
              </label>
            </div>
            <span className="text-[10px] text-purple-700 font-bold bg-purple-100 px-2.5 py-1 rounded-lg">خيار كاشير ذكي</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-3 border-t border-slate-200">
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 text-white font-black py-2.5 rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2 transition hover:scale-[1.01] active:scale-95 text-xs sm:text-sm"
            >
              <Check className="w-4 h-4" />
              <span>حفظ وإضافة الصنف</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer transition text-xs sm:text-sm"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
