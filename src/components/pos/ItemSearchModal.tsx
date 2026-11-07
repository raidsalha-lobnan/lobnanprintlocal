import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { InventoryItem } from '../../types';
import { X, Search, Plus, Check, Star, Image as ImageIcon } from 'lucide-react';

interface ItemSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem: (item: InventoryItem) => void;
}

export const ItemSearchModal: React.FC<ItemSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectItem
}) => {
  const { inventory, settings, updateInventoryItem } = useAccounting();
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filtered = (inventory || []).filter(it => {
    if (!it) return false;
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const matchBarcode =
      (it.barcode && it.barcode.toLowerCase().includes(term)) ||
      (it.code && it.code.toLowerCase().includes(term)) ||
      (it.additionalBarcodes && it.additionalBarcodes.some(b => b.toLowerCase().includes(term))) ||
      (it.barcodeEntries && it.barcodeEntries.some(b => b.barcode.toLowerCase().includes(term) || (b.label && b.label.toLowerCase().includes(term))));

    return (
      (it.name && it.name.toLowerCase().includes(term)) ||
      matchBarcode ||
      (it.category && it.category.toLowerCase().includes(term))
    );
  });

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-slate-800">
        <div className="bg-blue-800 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-700 rounded-lg">
              <Search className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">بحث متقدم عن صنف</h3>
              <p className="text-[11px] text-blue-200">البحث بالاسم أو الباركود أو التصنيف</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              autoFocus
              placeholder="اكتب اسم الصنف أو الباركود..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              لم يتم العثور على أصناف مطابقة لـ "{searchTerm}"
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-2.5">الباركود</th>
                    <th className="p-2.5">اسم الصنف</th>
                    <th className="p-2.5">الوحدة</th>
                    <th className="p-2.5 text-center">المتوفر بالمخزن</th>
                    <th className="p-2.5 text-left">سعر البيع</th>
                    <th className="p-2.5 text-center">إدراج</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filtered.map((it, idx) => (
                    <tr
                      key={`search-it-${it.id || idx}-${idx}`}
                      onDoubleClick={() => {
                        onSelectItem(it);
                        onClose();
                      }}
                      className="hover:bg-blue-50/60 cursor-pointer transition-colors"
                    >
                      <td className="p-2.5 text-slate-500 text-[11px] font-mono">
                        <div>{it.barcode || '—'}</div>
                        {(it.barcodeEntries?.length || it.additionalBarcodes?.length) ? (
                          <span className="inline-block bg-sky-50 text-sky-700 text-[9px] px-1.5 py-0.5 rounded font-sans font-medium mt-0.5">
                            +{(it.barcodeEntries?.length || it.additionalBarcodes?.length)} باركود بديل
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2.5 font-sans">
                        <div className="flex items-center gap-2">
                          <div className="relative shrink-0">
                            {it.imageUrl ? (
                              <img
                                src={it.imageUrl}
                                alt={it.name}
                                className="w-8 h-8 object-cover rounded-md border border-slate-200 shadow-2xs"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300">
                                <ImageIcon className="w-4 h-4" />
                              </div>
                            )}
                            {/* Interactive Star Toggle */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateInventoryItem(it.id, { isFavorite: !it.isFavorite });
                              }}
                              className={`absolute -top-1 -right-1 rounded-full p-0.5 shadow-xs transition-transform hover:scale-125 cursor-pointer ${
                                it.isFavorite ? 'bg-amber-400 text-amber-950' : 'bg-slate-200/80 text-slate-400 hover:text-amber-500'
                              }`}
                              title={it.isFavorite ? 'صنف مفضل (انقر للإلغاء)' : 'إضافة إلى المفضلة'}
                            >
                              <Star className={`w-2.5 h-2.5 ${it.isFavorite ? 'fill-amber-950' : ''}`} />
                            </button>
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{it.name}</span>
                            {it.code && <span className="text-[10px] text-slate-400 font-mono">{it.code}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5 font-sans text-slate-600 text-[11px]">{it.unit || 'قطعة'}</td>
                      <td className="p-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          it.stockQuantity <= it.minAlertQuantity
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {it.stockQuantity}
                        </span>
                      </td>
                      <td className="p-2.5 text-left font-bold text-blue-700">
                        {it.sellingPrice.toFixed(2)} {settings.currency}
                      </td>
                      <td className="p-2.5 text-center font-sans">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectItem(it);
                            onClose();
                          }}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                        >
                          إدراج
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
          <span className="text-slate-500">نصيحة: انقر نقراً مزدوجاً على أي صنف لإدراجه فوراً</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
