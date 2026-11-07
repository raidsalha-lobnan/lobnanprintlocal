import React, { useState, useEffect } from 'react';
import {
  ChevronsRight,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft
} from 'lucide-react';
import { Invoice } from '../../types';

interface DayInvoicesNavigatorProps {
  invoiceDate: string;
  invoicesForDate: Invoice[];
  currentInvoiceIndex: number; // 0-based index or -1 for new invoice
  onNavFirst: () => void;
  onNavPrev: () => void;
  onNavNext: () => void;
  onNavLast: () => void;
  onJumpToIndex?: (index1Based: number) => void;
  onNewInvoice?: () => void;
}

export const DayInvoicesNavigator: React.FC<DayInvoicesNavigatorProps> = ({
  invoiceDate,
  invoicesForDate,
  currentInvoiceIndex,
  onNavFirst,
  onNavPrev,
  onNavNext,
  onNavLast,
  onJumpToIndex,
  onNewInvoice
}) => {
  const totalCount = invoicesForDate.length;
  const isEditingExisting = currentInvoiceIndex >= 0;
  const displayCurrentNum = isEditingExisting ? currentInvoiceIndex + 1 : totalCount + 1;

  const [inputValue, setInputValue] = useState<string>(String(displayCurrentNum));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(String(displayCurrentNum));
    }
  }, [displayCurrentNum, isEditing]);

  const handleCommitJump = () => {
    setIsEditing(false);
    const num = parseInt(inputValue, 10);
    if (!isNaN(num)) {
      if (num >= 1 && num <= totalCount) {
        onJumpToIndex?.(num);
      } else if (num > totalCount) {
        onNewInvoice?.();
      } else {
        setInputValue(String(displayCurrentNum));
      }
    } else {
      setInputValue(String(displayCurrentNum));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitJump();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue(String(displayCurrentNum));
    }
  };

  return (
    <div className="inline-flex items-center" dir="rtl">
      {/* حاوية الرموز المدمجة والواضحة بأيقونات متناسقة وأنيقة */}
      <div className="inline-flex items-center h-8 bg-white hover:bg-slate-50/70 border border-slate-300 hover:border-blue-400 rounded-lg p-0.5 shadow-2xs transition-all gap-0.5">
        {/* 1. رمز أول فاتورة لليوم المحدد « */}
        <button
          type="button"
          onClick={onNavFirst}
          disabled={totalCount === 0 || currentInvoiceIndex === 0}
          title={`أول فاتورة ليوم (${invoiceDate})`}
          className="h-7 w-7 rounded-md flex items-center justify-center text-sky-600 hover:text-sky-700 hover:bg-sky-50 active:scale-95 disabled:opacity-25 disabled:hover:bg-transparent disabled:text-slate-300 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          <ChevronsRight className="w-4.5 h-4.5 stroke-[2.4]" />
        </button>

        {/* 2. رمز الفاتورة السابقة > */}
        <button
          type="button"
          onClick={onNavPrev}
          disabled={totalCount === 0 || currentInvoiceIndex === 0}
          title={`الفاتورة السابقة ليوم (${invoiceDate})`}
          className="h-7 w-7 rounded-md flex items-center justify-center text-sky-600 hover:text-sky-700 hover:bg-sky-50 active:scale-95 disabled:opacity-25 disabled:hover:bg-transparent disabled:text-slate-300 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          <ChevronRight className="w-4.5 h-4.5 stroke-[2.4]" />
        </button>

        {/* 3. الخانة المركزية: رقم وتعداد الفاتورة فقط بشكل واضح وجميل */}
        <div className="relative flex items-center justify-center">
          {isEditing ? (
            <input
              type="text"
              autoFocus
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onBlur={handleCommitJump}
              onKeyDown={handleKeyDown}
              className="h-7 w-9 rounded-md bg-white border-2 border-sky-500 text-sky-900 font-mono font-black text-center text-xs outline-none shadow-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              title={`فاتورة اليوم رقم ${displayCurrentNum} (انقر لكتابة رقم الفاتورة والانتقال المباشر)`}
              className={`h-7 min-w-[34px] px-2 rounded-md flex items-center justify-center select-none font-mono text-xs font-black transition-all cursor-pointer border shadow-2xs ${
                isEditingExisting
                  ? 'bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100 hover:border-sky-400'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400'
              }`}
            >
              {displayCurrentNum}
            </button>
          )}
        </div>

        {/* 4. رمز الفاتورة التالية < */}
        <button
          type="button"
          onClick={onNavNext}
          disabled={totalCount === 0 || (!isEditingExisting && totalCount > 0)}
          title={
            isEditingExisting && currentInvoiceIndex === totalCount - 1
              ? `بدء فاتورة جديدة ليوم (${invoiceDate})`
              : `الفاتورة التالية ليوم (${invoiceDate})`
          }
          className="h-7 w-7 rounded-md flex items-center justify-center text-sky-600 hover:text-sky-700 hover:bg-sky-50 active:scale-95 disabled:opacity-25 disabled:hover:bg-transparent disabled:text-slate-300 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          <ChevronLeft className="w-4.5 h-4.5 stroke-[2.4]" />
        </button>

        {/* 5. رمز آخر فاتورة لليوم المحدد » */}
        <button
          type="button"
          onClick={onNavLast}
          disabled={totalCount === 0 || currentInvoiceIndex === totalCount - 1}
          title={`آخر فاتورة ليوم (${invoiceDate})`}
          className="h-7 w-7 rounded-md flex items-center justify-center text-sky-600 hover:text-sky-700 hover:bg-sky-50 active:scale-95 disabled:opacity-25 disabled:hover:bg-transparent disabled:text-slate-300 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          <ChevronsLeft className="w-4.5 h-4.5 stroke-[2.4]" />
        </button>
      </div>
    </div>
  );
};
