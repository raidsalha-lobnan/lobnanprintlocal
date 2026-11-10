import React, { useMemo } from 'react';
import { X, LockKeyhole, Layers } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The catalog's category definitions are display-only in client apps.
 * Reclassification and changes to permanent SKUs require a reviewed
 * server-side migration, preserving internal item IDs and financial history.
 */
export default function ManageCategoriesModal({ isOpen, onClose }: Props) {
  const { settings, inventory } = useAccounting();
  const categories = settings.categories || [];
  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const item of inventory) {
      byCategory.set(item.category, (byCategory.get(item.category) || 0) + 1);
    }
    return byCategory;
  }, [inventory]);
  const legacy = useMemo(
    () => [...counts.keys()].filter(id => id && !categories.some(cat => cat.id === id)).sort(),
    [counts, categories]
  );

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-700" />
            <h2 className="text-base font-bold text-slate-800">تصنيفات الأصناف</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-1.5 rounded hover:bg-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-start gap-2 p-3 mx-4 mt-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-sm">
          <LockKeyhole className="w-4 h-4 mt-0.5 shrink-0" />
          <p>التصنيفات والأكواد التسلسلية ثابتة ولا يمكن تغييرها من واجهات البرنامج. أي إعادة تصنيف أو ترقيم تتم مركزيًا بعد تدقيق العلاقات المحاسبية والمخزون.</p>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {categories.map(cat => (
            <div key={cat.id} className="border border-slate-200 rounded-lg p-3 bg-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-sm text-slate-900">{cat.name}</div>
                <div className="text-xs text-slate-500 mt-1" dir="ltr">{cat.id}</div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="font-mono text-xs bg-slate-100 border border-slate-200 rounded px-2 py-1">{cat.prefix}</span>
                <span className="text-xs text-slate-700 whitespace-nowrap">{counts.get(cat.id) || 0} صنف</span>
              </div>
            </div>
          ))}
          {legacy.map(id => (
            <div key={id} className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex items-center justify-between gap-2">
              <span className="text-sm text-amber-900">تصنيف مستخدم غير موجود في القائمة المعتمدة: <span dir="ltr">{id}</span></span>
              <span className="text-xs font-bold text-amber-900 whitespace-nowrap">{counts.get(id)} صنف</span>
            </div>
          ))}
          {categories.length === 0 && legacy.length === 0 && (
            <p className="text-center text-slate-500 p-6">لا توجد مجموعات لعرضها.</p>
          )}
        </div>
      </div>
    </div>
  );
}
