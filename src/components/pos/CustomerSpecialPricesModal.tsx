import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Party, InventoryItem } from '../../types';
import { X, Search, Tag, Check, Save, RotateCcw, DollarSign, Percent } from 'lucide-react';
import { posSound } from '../../utils/audio';
import { isCashCustomerParty } from '../../utils/partyUtils';

interface CustomerSpecialPricesModalProps {
  party: Party | null;
  isOpen: boolean;
  onClose: () => void;
  onSavePrices?: (specialPrices: Record<string, number>) => void;
}

export const CustomerSpecialPricesModal: React.FC<CustomerSpecialPricesModalProps> = ({
  party,
  isOpen,
  onClose,
  onSavePrices
}) => {
  const { inventory, updateParty, settings } = useAccounting();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tempPrices, setTempPrices] = useState<Record<string, number>>({});
  const [isSavedAlert, setIsSavedAlert] = useState(false);

  // Sync state when modal opens, loading special prices from both customer profile and item cards
  React.useEffect(() => {
    if (party && isOpen) {
      const initial: Record<string, number> = { ...(party.specialPrices || {}) };
      inventory.forEach(it => {
        if (it.customerSpecialPrices && it.customerSpecialPrices.length > 0) {
          const entry = it.customerSpecialPrices.find(sp =>
            sp.customerId === party.id ||
            (party.code && sp.customerCode && sp.customerCode.toLowerCase() === party.code.toLowerCase()) ||
            (sp.customerName && sp.customerName.trim().toLowerCase() === party.name.trim().toLowerCase())
          );
          if (entry && typeof entry.price === 'number' && entry.price >= 0 && initial[it.id] === undefined) {
            initial[it.id] = entry.price;
          }
        }
      });
      setTempPrices(initial);
      setIsSavedAlert(false);
    }
  }, [party, isOpen, inventory]);

  const filteredItems = useMemo(() => {
    return inventory.filter(item => {
      const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.legacyCodes?.some(code => code?.toLowerCase().includes(q)) ?? false) ||
        (item.barcode && item.barcode.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [inventory, categoryFilter, searchQuery]);

  if (!isOpen || !party || isCashCustomerParty(party)) return null;

  const handlePriceChange = (itemId: string, val: number) => {
    setTempPrices(prev => {
      const copy = { ...prev };
      if (val > 0) {
        copy[itemId] = val;
      } else {
        delete copy[itemId];
      }
      return copy;
    });
  };

  const handleApplyGlobalDiscount = (percentage: number) => {
    if (percentage <= 0 || percentage > 90) return;
    const updated: Record<string, number> = { ...tempPrices };
    filteredItems.forEach(item => {
      const discounted = Number((item.sellingPrice * (1 - percentage / 100)).toFixed(2));
      updated[item.id] = discounted;
    });
    setTempPrices(updated);
    posSound.playSuccessBeep();
  };

  const handleSave = () => {
    updateParty(party.id, {
      specialPrices: tempPrices
    });
    if (onSavePrices) {
      onSavePrices(tempPrices);
    }
    posSound.playSuccessBeep();
    setIsSavedAlert(true);
    setTimeout(() => {
      setIsSavedAlert(false);
      onClose();
    }, 900);
  };

  const activeSpecialCount = Object.keys(tempPrices).length;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 text-slate-800 text-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-[#1f4a7c] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#143254]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-400 text-slate-900 rounded-xl font-bold shadow-xs">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">تسعير خاص للعميل</h3>
                <span className="bg-amber-400 text-slate-900 font-mono font-bold px-2 py-0.5 rounded-md text-[11px]">
                  {party.code}
                </span>
              </div>
              <p className="text-[11px] text-blue-200">
                العميل: <strong className="text-white">{party.name}</strong> • تم تحديد أسعار خاصة لـ ({activeSpecialCount}) صنف
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث باسم الصنف، الكود، أو الباركود..."
                className="w-full bg-white border border-slate-300 rounded-lg pr-8 pl-3 py-1.5 text-xs focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            >
              <option value="all">كل الأقسام</option>
              {(settings.categories || []).map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Quick apply discount to visible items */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 font-semibold text-[11px]">خصم جماعي للظاهر:</span>
            <button
              type="button"
              onClick={() => handleApplyGlobalDiscount(5)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-[11px] font-bold text-slate-700 cursor-pointer"
            >
              5%
            </button>
            <button
              type="button"
              onClick={() => handleApplyGlobalDiscount(10)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-[11px] font-bold text-slate-700 cursor-pointer"
            >
              10%
            </button>
            <button
              type="button"
              onClick={() => handleApplyGlobalDiscount(15)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-[11px] font-bold text-slate-700 cursor-pointer"
            >
              15%
            </button>
            <button
              type="button"
              onClick={() => setTempPrices({})}
              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-bold cursor-pointer"
              title="تفريغ كل الأسعار الخاصة والرجوع للسعر القياسي"
            >
              مسح الكل
            </button>
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-y-auto p-3">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-2 px-3 w-24">كود الصنف</th>
                <th className="py-2 px-3">اسم الصنف</th>
                <th className="py-2 px-3 w-28 text-center">الباركود</th>
                <th className="py-2 px-3 w-24 text-left">السعر القياسي ({settings.currency})</th>
                <th className="py-2 px-3 w-32 text-left">السعر الخاص ({settings.currency})</th>
                <th className="py-2 px-3 w-20 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.map((item, idx) => {
                const special = tempPrices[item.id];
                const hasSpecial = special !== undefined && special > 0;
                return (
                  <tr
                    key={`cust-sp-${item.id || idx}-${idx}`}
                    className={`hover:bg-slate-50 transition-colors ${
                      hasSpecial ? 'bg-amber-50/50' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-mono font-bold text-slate-600">{item.code}</td>
                    <td className="py-2 px-3 font-semibold text-slate-900">
                      <div>{item.name}</div>
                      {item.unit && <span className="text-[9px] text-slate-400 font-light">الوحدة: {item.unit}</span>}
                    </td>
                    <td className="py-2 px-3 font-mono text-center text-slate-500 text-[11px]">
                      {item.barcode || '-'}
                    </td>
                    <td className="py-2 px-3 text-left font-mono font-bold text-slate-700">
                      {item.sellingPrice.toFixed(2)}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={special !== undefined ? special : ''}
                          onChange={e => handlePriceChange(item.id, parseFloat(e.target.value) || 0)}
                          placeholder={item.sellingPrice.toFixed(2)}
                          className={`w-28 px-2 py-1 text-left font-mono font-bold text-xs rounded border ${
                            hasSpecial
                              ? 'border-amber-400 bg-amber-50 text-amber-900 focus:ring-1 focus:ring-amber-500'
                              : 'border-slate-300 bg-white text-slate-800 focus:border-blue-500'
                          }`}
                        />
                        {hasSpecial && (
                          <button
                            type="button"
                            onClick={() => handlePriceChange(item.id, 0)}
                            className="text-rose-500 hover:text-rose-700 p-1 text-[11px] font-bold cursor-pointer"
                            title="إلغاء السعر الخاص"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {hasSpecial ? (
                        <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-300">
                          ⭐ خاص
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">قياسي</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSavedAlert && (
              <span className="text-emerald-700 font-bold flex items-center gap-1 text-xs bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                <Check className="w-4 h-4" />
                <span>تم حفظ وتثبيت الأسعار الخاصة للعميل بنجاح!</span>
              </span>
            )}
            <span className="text-slate-600 font-medium text-[11px]">
              * عند اختيار هذا العميل في شاشة الكاشير سيتم اعتماد هذه الأسعار الخاصة فورياً وتلقائياً.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>حفظ واعتماد الأسعار</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
