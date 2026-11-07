import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { X, Search, Check, Tag } from 'lucide-react';

interface PriceEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPriceUpdated?: (itemId: string, newPrice: number) => void;
}

export const PriceEditModal: React.FC<PriceEditModalProps> = ({
  isOpen,
  onClose,
  onPriceUpdated
}) => {
  const { inventory, updateInventoryItem, settings } = useAccounting();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newSellingPrice, setNewSellingPrice] = useState<number>(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredItems = (inventory || []).filter(it =>
    it && (
      (it.name && it.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (it.barcode && it.barcode.includes(searchTerm))
    )
  );

  const handleSelectItem = (id: string, currentPrice: number) => {
    setSelectedItemId(id);
    setNewSellingPrice(currentPrice);
    setSuccessMessage(null);
  };

  const handleSavePrice = () => {
    if (!selectedItemId || newSellingPrice < 0) return;

    updateInventoryItem(selectedItemId, {
      sellingPrice: Number(newSellingPrice)
    });

    if (onPriceUpdated) {
      onPriceUpdated(selectedItemId, Number(newSellingPrice));
    }

    setSuccessMessage('تم تعديل سعر الصنف بنجاح في النظام');
    setTimeout(() => {
      setSuccessMessage(null);
    }, 2500);
  };

  const selectedItem = inventory.find(i => i.id === selectedItemId);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-lg overflow-hidden text-slate-800">
        <div className="bg-emerald-700 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-600 rounded-lg">
              <Tag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">تعديل أسعار الأصناف</h3>
              <p className="text-[11px] text-emerald-100">تحديث سعر البيع للصنف مباشرة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-200 hover:text-white p-1 rounded-lg hover:bg-emerald-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="ابحث عن الصنف بالاسم أو الباركود..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* List of items */}
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-100">
            {(filteredItems || []).slice(0, 20).map((item, idx) => (
              <div
                key={`prc-edit-${item.id || idx}-${idx}`}
                onClick={() => handleSelectItem(item.id, item.sellingPrice)}
                className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                  selectedItemId === item.id ? 'bg-emerald-50 text-emerald-900 font-bold' : 'hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="text-slate-900">{item.name}</div>
                  {item.barcode && <div className="text-[10px] font-mono text-slate-400">{item.barcode}</div>}
                </div>
                <div className="text-left font-mono">
                  <span className="text-slate-500 text-[10px]">السعر الحالي: </span>
                  <span className="font-bold text-emerald-700">{item.sellingPrice.toFixed(2)} {settings.currency}</span>
                </div>
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div className="p-4 text-center text-slate-400">لا توجد نتائج مطابقة</div>
            )}
          </div>

          {/* Edit Form */}
          {selectedItem && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-800">{selectedItem.name}</span>
                <span className="text-[10px] text-slate-400 font-light">التكلفة: {selectedItem.purchasePrice.toFixed(2)} {settings.currency}</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">السعر الجديد ({settings.currency})</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newSellingPrice}
                    onChange={e => setNewSellingPrice(parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold font-mono text-emerald-700 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleSavePrice}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>تحديث السعر</span>
                  </button>
                </div>
              </div>

              {successMessage && (
                <div className="text-emerald-700 bg-emerald-100 border border-emerald-200 p-2 rounded-lg text-center font-bold text-[11px]">
                  {successMessage}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
