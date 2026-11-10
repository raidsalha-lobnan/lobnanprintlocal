import React, { useMemo } from 'react';
import { X, LockKeyhole, Layers } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import {approvedCatalogCategories, approvedCatalogCounts} from '../utils/approvedCatalogOptions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Read-only approved groups. The saved item category ID and code remain
 * immutable; reclassification is performed by audited server migration only.
 */
export default function ManageCategoriesModal({isOpen,onClose}:Props) {
  const {settings,inventory} = useAccounting();
  const groups=useMemo(
    ()=>approvedCatalogCategories(settings.categories || []),
    [settings.categories],
  );
  const counts=useMemo(()=>approvedCatalogCounts(inventory,groups),[inventory,groups]);

  if(!isOpen)return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" dir="rtl">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-700"/>
            <h2 className="text-base font-bold text-slate-900">تصنيفات الأصناف المعتمدة</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200">
            <X className="h-5 w-5"/>
          </button>
        </div>
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/>
          <p>
            التصنيفات وأكواد الأصناف المحفوظة ثابتة. لا تظهر هنا التصنيفات القديمة.
            اعتماد أي تصنيف جديد يتم من إعدادات البرنامج بعد التحقق من سلامة الأكواد والارتباطات المحاسبية.
          </p>
        </div>
        <div className="space-y-2 overflow-y-auto p-4">
          {groups.map((group,index)=>(
            <div key={group.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700">
                  {index+1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">{group.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">الرقم التسلسلي للمجموعة {index+1}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-bold text-indigo-800" dir="ltr">
                  {group.prefix}
                </span>
                <span className="min-w-[62px] text-left text-xs font-semibold text-slate-700">
                  {counts[index]?.count || 0} صنف
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
