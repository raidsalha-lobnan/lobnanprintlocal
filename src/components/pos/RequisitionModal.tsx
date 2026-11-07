import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { X, ShoppingBag, Check } from 'lucide-react';

interface RequisitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultItemId?: string;
}

export const RequisitionModal: React.FC<RequisitionModalProps> = ({
  isOpen,
  onClose,
  defaultItemId
}) => {
  const { inventory, parties, createPurchaseInvoice, settings } = useAccounting();
  const suppliers = parties.filter(p => p.type === 'supplier');

  const [selectedItemId, setSelectedItemId] = useState<string>(defaultItemId || (inventory[0]?.id || ''));
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(10);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [notes, setNotes] = useState<string>('طلبية شراء سريعة من شاشة الكاشير');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  React.useEffect(() => {
    if (selectedItemId) {
      const item = inventory.find(i => i.id === selectedItemId);
      if (item) {
        setUnitCost(item.purchasePrice);
      }
    }
  }, [selectedItemId, inventory]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const item = inventory.find(i => i.id === selectedItemId);
    const supplier = suppliers.find(s => s.id === selectedSupplierId) || suppliers[0];

    if (!item) return;

    const total = quantity * unitCost;

    createPurchaseInvoice({
      date: new Date().toISOString().split('T')[0],
      supplierId: supplier?.id || 'sup-pos',
      supplierName: supplier?.name || 'مورد عام',
      items: [
        {
          itemId: item.id,
          itemName: item.name,
          quantity: Number(quantity),
          unitPrice: Number(unitCost),
          total: Number(total.toFixed(2))
        }
      ],
      totalAmount: Number(total.toFixed(2)),
      paidAmount: 0,
      notes
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden text-slate-800">
        <div className="bg-blue-800 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-700 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">طلبية شراء من صنف</h3>
              <p className="text-[11px] text-blue-200">إصدار طلبية توريد أو شراء للمخزون</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {savedSuccess && (
            <div className="p-3 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-center font-bold">
              ✓ تم تسجيل طلبية الشراء بنجاح في النظام!
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">اختر الصنف المطلوب *</label>
            <select
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-slate-50"
            >
              {inventory.map((item, idx) => (
                <option key={`req-item-${item.id || idx}-${idx}`} value={item.id}>
                  {item.name} (المتوفر حالياً: {item.stockQuantity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">المورد *</label>
            <select
              value={selectedSupplierId}
              onChange={e => setSelectedSupplierId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-slate-50"
            >
              {suppliers.map((sup, idx) => (
                <option key={`req-sup-${sup.id || idx}-${idx}`} value={sup.id}>
                  {sup.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">الكمية المطلوبة</label>
              <input
                type="number"
                min="1"
                required
                value={quantity}
                onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">سعر التكلفة التقديري ({settings.currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={e => setUnitCost(parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex justify-between items-center font-bold">
            <span className="text-slate-600">إجمالي الطلبية المتوقع:</span>
            <span className="font-mono text-sm text-blue-800">
              {(quantity * unitCost).toFixed(2)} {settings.currency}
            </span>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">ملاحظات الطلبية</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-slate-50"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200">
            <button
              type="submit"
              disabled={savedSuccess}
              className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-bold py-2.5 rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد طلبية الشراء</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
