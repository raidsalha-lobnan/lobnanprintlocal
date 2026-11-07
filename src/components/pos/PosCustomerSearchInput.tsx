import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Party } from '../../types';
import {
  Search,
  User,
  X,
  ChevronDown,
  UserPlus,
  Phone,
  MapPin,
  Check,
  CreditCard,
  Building2,
  Sparkles
} from 'lucide-react';

export interface PosCustomerSearchInputProps {
  customers: Party[];
  selectedCustomerId: string;
  customerName: string;
  customerCode?: string;
  onSelectCustomer: (customer: Party) => void;
  onChangeCustomerName: (name: string) => void;
  onQuickAddCustomer?: (name: string) => void;
  placeholder?: string;
  className?: string;
  clearOnFocus?: boolean;
}

// Helper: Normalize Arabic & English text for flexible keyword search
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove Arabic Tashkeel / diacritics
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[يى]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[-_.,()/\\]/g, ' '); // treat punctuation as space separators
}

export const PosCustomerSearchInput: React.FC<PosCustomerSearchInputProps> = ({
  customers,
  selectedCustomerId,
  customerName,
  customerCode,
  onSelectCustomer,
  onChangeCustomerName,
  onQuickAddCustomer,
  placeholder = 'ابحث باسم العميل، رقمه، هاتفه، أو مدينته...',
  className = '',
  clearOnFocus = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState(customerName || '');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; showAbove: boolean } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Synchronize input text with customerName prop whenever selected customer changes
  useEffect(() => {
    setInputText(customerName || '');
  }, [customerName, selectedCustomerId]);

  // Strictly sanitize customer list: sub-customers must NEVER appear with main customers
  const sanitizedCustomers = useMemo(() => {
    return (customers || []).filter(c => !c.isSubCustomer);
  }, [customers]);

  // Find the selected customer object if any
  const currentSelectedParty = useMemo(() => {
    return sanitizedCustomers.find(c => c.id === selectedCustomerId);
  }, [sanitizedCustomers, selectedCustomerId]);

  // Filter customers by ALL typed keywords (كلمات دلالية متعددة)
  const filteredCustomers = useMemo(() => {
    const rawQuery = inputText.trim();
    if (!rawQuery) {
      // If query is empty, return all main customers (up to 30)
      return sanitizedCustomers.slice(0, 30);
    }

    const normQuery = normalizeSearchText(rawQuery);
    const tokens = normQuery.split(/\s+/).filter(Boolean);

    // Compute search match score for each customer
    const scoredList = sanitizedCustomers
      .map(cust => {
        const nameNorm = normalizeSearchText(cust.name || '');
        const codeNorm = normalizeSearchText(cust.code || '');
        const codeDigits = (cust.code || '').replace(/\D/g, '');
        const phoneClean = (cust.phone || '').replace(/[\s-]/g, '');
        const cityNorm = normalizeSearchText(cust.city || '');
        const addressNorm = normalizeSearchText(cust.address || '');
        const contactNorm = normalizeSearchText(cust.contactPerson || '');
        const taxClean = (cust.taxNumber || '').replace(/[\s-]/g, '');
        const notesNorm = normalizeSearchText(cust.notes || '');

        const fullCorpus = `${nameNorm} ${codeNorm} ${codeDigits} ${phoneClean} ${cityNorm} ${addressNorm} ${contactNorm} ${taxClean} ${notesNorm}`;

        // Verify that EVERY token matches somewhere in the customer corpus
        const allTokensMatch = tokens.every(token => {
          // If token is purely numeric, test against code digits or phone
          if (/^\d+$/.test(token)) {
            if (codeDigits && (codeDigits === token || parseInt(codeDigits, 10) === parseInt(token, 10))) {
              return true;
            }
            if (phoneClean.includes(token)) {
              return true;
            }
          }
          return fullCorpus.includes(token);
        });

        if (!allTokensMatch) return null;

        // Scoring for ranking:
        let score = 10;
        if (nameNorm.startsWith(normQuery)) score += 50;
        else if (nameNorm.includes(normQuery)) score += 30;

        if (codeNorm.includes(normQuery) || codeDigits === normQuery) score += 40;
        if (phoneClean.includes(rawQuery.replace(/\D/g, '')) && rawQuery.replace(/\D/g, '').length >= 3) score += 35;

        return { customer: cust, score };
      })
      .filter((item): item is { customer: Party; score: number } => item !== null)
      .sort((a, b) => b.score - a.score)
      .map(item => item.customer);

    return scoredList;
  }, [customers, inputText]);

  // Update floating dropdown coordinates to avoid clipping
  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = 320;
    const showAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    setCoords({
      top: showAbove ? rect.top - 6 : rect.bottom + 4,
      left: Math.max(10, Math.min(rect.left, window.innerWidth - 380)),
      width: Math.max(rect.width, 360),
      showAbove
    });
  }, []);

  // Update position on window scroll or resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Select customer handler
  const handleSelectCustomer = (customer: Party) => {
    onSelectCustomer(customer);
    setInputText(customer.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
        updatePosition();
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev + 1;
        return next >= filteredCustomers.length ? 0 : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev - 1;
        return next < 0 ? filteredCustomers.length - 1 : next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredCustomers.length) {
        handleSelectCustomer(filteredCustomers[highlightedIndex]);
      } else if (filteredCustomers.length === 1) {
        handleSelectCustomer(filteredCustomers[0]);
      } else {
        // Keep entered name as custom customer text
        onChangeCustomerName(inputText);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Clear input
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputText('');
    onChangeCustomerName('');
    setIsOpen(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={e => {
            const val = e.target.value;
            setInputText(val);
            onChangeCustomerName(val);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(-1);
            updatePosition();
          }}
          onFocus={(e) => {
            if (clearOnFocus) {
              setInputText('');
              onChangeCustomerName('');
              try {
                e.currentTarget.value = '';
              } catch {}
            }
            setIsOpen(true);
            updatePosition();
          }}
          onMouseDown={() => {
            if (clearOnFocus && inputRef.current && document.activeElement !== inputRef.current) {
              setInputText('');
              onChangeCustomerName('');
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-white border border-slate-300 rounded px-7 py-0.5 font-bold text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors truncate shadow-2xs"
          title="ابحث واكتب اسم العميل أو رقمه أو هاتفه أو عنوانه"
        />

        {/* Right Search / User Icon */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <Search className="w-3.5 h-3.5 text-blue-600" />
        </div>

        {/* Left Action Buttons: Clear (X) & Dropdown toggle (Chevron) */}
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {inputText && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 cursor-pointer"
              title="مسح حقل البحث"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsOpen(prev => !prev);
              if (!isOpen) {
                updatePosition();
                inputRef.current?.focus();
              }
            }}
            className="p-0.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 cursor-pointer"
            title="إظهار قائمة العملاء"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Floating Dropdown Results Menu (via React Portal to guarantee no clipping) */}
      {isOpen && coords && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: coords.showAbove ? undefined : coords.top,
            bottom: coords.showAbove ? window.innerHeight - coords.top : undefined,
            left: coords.left,
            width: coords.width,
            zIndex: 99999
          }}
          className="bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100 font-sans"
        >
          {/* Header of Search Dropdown */}
          <div className="p-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-slate-600">
            <span className="font-bold flex items-center gap-1 text-[11px]">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>نتائج البحث بالكلمات الدلالية:</span>
              <span className="bg-blue-100 text-blue-800 font-mono px-1.5 py-0.2 rounded-full font-bold">
                {filteredCustomers.length}
              </span>
            </span>

            {onQuickAddCustomer && (
              <button
                type="button"
                onClick={() => {
                  onQuickAddCustomer(inputText.trim());
                  setIsOpen(false);
                }}
                className="text-[11px] text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded cursor-pointer transition-colors"
                title="إضافة عميل جديد بهذا الاسم"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
                <span>+ عميل جديد</span>
              </button>
            )}
          </div>

          {/* Customer Items List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((cust, idx) => {
                const isSelected = cust.id === selectedCustomerId;
                const isHighlighted = idx === highlightedIndex;
                const balance = cust.balance || 0;

                return (
                  <div
                    key={cust.id}
                    onClick={() => handleSelectCustomer(cust)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isHighlighted
                        ? 'bg-blue-50/90'
                        : isSelected
                        ? 'bg-blue-50/50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* Code Badge */}
                      <span className="font-mono text-[10px] bg-slate-100 text-blue-900 font-bold px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                        {cust.code || 'CUST-0000'}
                      </span>

                      {/* Customer Name and Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`font-bold truncate text-xs ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                            {cust.name}
                          </span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          )}
                        </div>

                        {/* Extra metadata: phone, city */}
                        <div className="flex items-center gap-2 text-[9px] text-slate-400 font-light mt-0.5 truncate">
                          {cust.phone && (
                            <span className="flex items-center gap-0.5">
                              <Phone className="w-2.5 h-2.5 text-slate-400" />
                              <span className="font-mono">{cust.phone}</span>
                            </span>
                          )}
                          {cust.city && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5 text-slate-400" />
                              <span>{cust.city}</span>
                            </span>
                          )}
                          {cust.taxNumber && (
                            <span className="text-slate-400 font-mono">
                              ض:{cust.taxNumber}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Balance Pill */}
                    <div className="text-left shrink-0 font-mono">
                      {balance > 0 ? (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                          مدين: {balance.toFixed(2)} ₪
                        </span>
                      ) : balance < 0 ? (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          دائن: {Math.abs(balance).toFixed(2)} ₪
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                          0.00 ₪
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-slate-500 space-y-2">
                <p className="text-xs">
                  لا يوجد عميل يطابق الكلمات: <span className="font-bold text-slate-800">"{inputText}"</span>
                </p>

                {onQuickAddCustomer && inputText.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      onQuickAddCustomer(inputText.trim());
                      setIsOpen(false);
                    }}
                    className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>إضافة "{inputText.trim()}" كعميل جديد الآن</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick Cash Customer & Footer Shortcut */}
          <div className="p-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => {
                const cashCust = customers.find(c => c.id === 'cust-cash' || c.name.includes('نقدي')) || {
                  id: 'cust-cash',
                  code: 'CUST-0000',
                  name: 'عميل نقدي عام',
                  type: 'customer',
                  phone: '',
                  balance: 0
                } as Party;
                handleSelectCustomer(cashCust);
              }}
              className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              <span>عميل نقدي عام</span>
            </button>

            <span className="text-[10px] text-slate-400">
              استخدم الأسهم ⇅ للتنقل و Enter للاختيار
            </span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
