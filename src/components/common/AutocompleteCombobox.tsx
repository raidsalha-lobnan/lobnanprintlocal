import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  User,
  Truck,
  Package,
  UserCheck,
  Plus,
  Check,
  ChevronDown,
  X,
  Sparkles,
  Phone,
  Barcode
} from 'lucide-react';
import { useAccounting } from '../../context/AccountingContext';

export interface ComboboxOption {
  id: string;
  name: string;
  code?: string;
  subText?: string;
  badge?: string;
  extraSearchCorpus?: string;
  raw?: any;
}

export type EntityType = 'customer' | 'supplier' | 'item' | 'employee' | 'party' | 'general';

export interface AutocompleteComboboxProps {
  items: ComboboxOption[];
  selectedId?: string;
  value?: string;
  onSelect: (item: ComboboxOption) => void;
  onChangeText?: (text: string) => void;
  onQuickAdd?: (name: string) => void | Promise<any>;
  entityType?: EntityType;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  showCode?: boolean;
  autoFocus?: boolean;
  clearOnFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  id?: string;
}

// Arabic & English text normalization helper
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove Arabic Tashkeel
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[يى]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[-_.,()/\\]/g, ' ');
}

// Helper to highlight matching letters
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <span>{text}</span>;

  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);
  const index = normalizedText.indexOf(normalizedQuery);

  if (index === -1) {
    return <span>{text}</span>;
  }

  const before = text.substring(0, index);
  const match = text.substring(index, index + query.length);
  const after = text.substring(index + query.length);

  return (
    <span>
      {before}
      <span className="bg-amber-200/80 text-amber-900 font-bold px-0.5 rounded-xs underline decoration-amber-500">
        {match}
      </span>
      {after}
    </span>
  );
}

export const AutocompleteCombobox: React.FC<AutocompleteComboboxProps> = ({
  items,
  selectedId,
  value,
  onSelect,
  onChangeText,
  onQuickAdd,
  entityType = 'customer',
  placeholder,
  disabled = false,
  required = false,
  className = '',
  inputClassName = '',
  showCode = true,
  autoFocus = false,
  clearOnFocus = false,
  inputRef: externalInputRef,
  id
}) => {
  const { addParty, addInventoryItem, addEmployee } = useAccounting();

  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState(value || '');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; showAbove: boolean } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const activeInputRef = externalInputRef || internalInputRef;
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Sync internal inputText when value or selectedId changes
  useEffect(() => {
    if (value !== undefined) {
      setInputText(value);
    } else if (selectedId) {
      const match = items.find(i => i.id === selectedId);
      if (match) {
        setInputText(match.name);
      }
    }
  }, [value, selectedId, items]);

  // Labels and icons based on entityType
  const entityMeta = useMemo(() => {
    switch (entityType) {
      case 'customer':
        return {
          label: 'عميل',
          plural: 'العملاء',
          icon: User,
          defaultPlaceholder: 'اكتب اسم العميل أو رقمه للمطابقة...',
          quickAddLabel: 'إضافة كعميل جديد'
        };
      case 'supplier':
        return {
          label: 'مورد',
          plural: 'الموردين',
          icon: Truck,
          defaultPlaceholder: 'اكتب اسم المورد أو كوده للمطابقة...',
          quickAddLabel: 'إضافة كمورد جديد'
        };
      case 'item':
        return {
          label: 'صنف',
          plural: 'الأصناف',
          icon: Package,
          defaultPlaceholder: 'اكتب اسم الصنف، الباركود، أو الكود...',
          quickAddLabel: 'إضافة كصنف مخزني جديد'
        };
      case 'employee':
        return {
          label: 'موظف',
          plural: 'الموظفين',
          icon: UserCheck,
          defaultPlaceholder: 'اكتب اسم الموظف أو وظيفته للمطابقة...',
          quickAddLabel: 'إضافة كموظف جديد'
        };
      default:
        return {
          label: 'عنصر',
          plural: 'العناصر',
          icon: User,
          defaultPlaceholder: 'اكتب للبحث والمطابقة...',
          quickAddLabel: 'إضافة جديد'
        };
    }
  }, [entityType]);

  // Filter items matching typed characters
  const filteredItems = useMemo(() => {
    const rawQuery = inputText.trim();
    if (!rawQuery) {
      return items.slice(0, 40);
    }

    const normQuery = normalizeText(rawQuery);
    const tokens = normQuery.split(/\s+/).filter(Boolean);

    return items
      .map(item => {
        const nameNorm = normalizeText(item.name || '');
        const codeNorm = normalizeText(item.code || '');
        const subNorm = normalizeText(item.subText || '');
        const extraNorm = normalizeText(item.extraSearchCorpus || '');
        const fullCorpus = `${nameNorm} ${codeNorm} ${subNorm} ${extraNorm}`;

        // Verify tokens match
        const matchesAll = tokens.every(token => fullCorpus.includes(token));
        if (!matchesAll) return null;

        let score = 10;
        if (nameNorm.startsWith(normQuery)) score += 60;
        else if (nameNorm.includes(normQuery)) score += 35;
        if (codeNorm.startsWith(normQuery)) score += 50;

        return { item, score };
      })
      .filter((entry): entry is { item: ComboboxOption; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.item);
  }, [items, inputText]);

  // Check if typed text already exists exactly
  const exactMatchExists = useMemo(() => {
    const norm = normalizeText(inputText);
    if (!norm) return true;
    return items.some(i => normalizeText(i.name) === norm);
  }, [items, inputText]);

  // Update floating dropdown position
  const updatePosition = useCallback(() => {
    if (!activeInputRef.current) return;
    const rect = activeInputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = 280;
    const showAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    setCoords({
      top: showAbove ? rect.top - 6 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
      width: Math.max(rect.width, 280),
      showAbove
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleResizeScroll = () => updatePosition();
    window.addEventListener('scroll', handleResizeScroll, true);
    window.addEventListener('resize', handleResizeScroll);

    return () => {
      window.removeEventListener('scroll', handleResizeScroll, true);
      window.removeEventListener('resize', handleResizeScroll);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
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

  const handleSelect = (item: ComboboxOption) => {
    setInputText(item.name);
    if (onChangeText) onChangeText(item.name);
    onSelect(item);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Perform quick addition directly in place
  const handlePerformQuickAdd = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    if (onQuickAdd) {
      await onQuickAdd(trimmed);
      setIsOpen(false);
      return;
    }

    // Default context-based quick creation
    try {
      if (entityType === 'customer' || entityType === 'party') {
        const created = addParty({
          name: trimmed,
          type: 'customer',
          phone: '',
          address: '',
          initialBalance: 0
        });
        const option: ComboboxOption = {
          id: created.id,
          name: created.name,
          code: created.code,
          subText: 'عميل جديد تم إنشاؤه تلقائياً',
          raw: created
        };
        handleSelect(option);
      } else if (entityType === 'supplier') {
        const created = addParty({
          name: trimmed,
          type: 'supplier',
          phone: '',
          address: '',
          initialBalance: 0
        });
        const option: ComboboxOption = {
          id: created.id,
          name: created.name,
          code: created.code,
          subText: 'مورد جديد تم إنشاؤه تلقائياً',
          raw: created
        };
        handleSelect(option);
      } else if (entityType === 'item') {
        const created = addInventoryItem({
          name: trimmed,
          code: '',
          category: 'خامات ومستلزمات عامة',
          unit: 'قطعة',
          purchasePrice: 0,
          retailPrice: 0,
          wholesalePrice: 0,
          stockQuantity: 0,
          minStockLevel: 5
        });
        const option: ComboboxOption = {
          id: created.id,
          name: created.name,
          code: created.code,
          subText: 'صنف جديد في المخزن',
          raw: created
        };
        handleSelect(option);
      } else if (entityType === 'employee') {
        const created = addEmployee({
          name: trimmed,
          jobTitle: 'موظف',
          department: 'عام',
          salaryType: 'monthly',
          salaryAmount: 0,
          status: 'active',
          hireDate: new Date().toISOString().split('T')[0]
        });
        const option: ComboboxOption = {
          id: created.id,
          name: created.name,
          code: created.id,
          subText: 'موظف جديد',
          raw: created
        };
        handleSelect(option);
      }
    } catch (err) {
      console.error('Error during quick add in combobox:', err);
    }
    setIsOpen(false);
  };

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
        const max = filteredItems.length + (!exactMatchExists && inputText.trim() ? 1 : 0);
        const next = prev + 1;
        return next >= max ? 0 : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const max = filteredItems.length + (!exactMatchExists && inputText.trim() ? 1 : 0);
        const next = prev - 1;
        return next < 0 ? max - 1 : next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
        handleSelect(filteredItems[highlightedIndex]);
      } else if (highlightedIndex === filteredItems.length && !exactMatchExists && inputText.trim()) {
        handlePerformQuickAdd();
      } else if (filteredItems.length === 1) {
        handleSelect(filteredItems[0]);
      } else if (!exactMatchExists && inputText.trim()) {
        handlePerformQuickAdd();
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputText('');
    if (onChangeText) onChangeText('');
    onSelect({ id: '', name: '' });
    setIsOpen(true);
    if (activeInputRef.current) activeInputRef.current.focus();
  };

  const IconComponent = entityMeta.icon;

  return (
    <div ref={containerRef} className={`relative font-sans text-xs ${className}`}>
      {/* Input container */}
      <div className="relative flex items-center">
        <div className="absolute right-2.5 text-slate-400 pointer-events-none flex items-center">
          <Search className="w-3.5 h-3.5" />
        </div>

        <input
          ref={activeInputRef}
          id={id}
          type="text"
          value={inputText}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          placeholder={placeholder || entityMeta.defaultPlaceholder}
          onChange={e => {
            const val = e.target.value;
            setInputText(val);
            if (onChangeText) onChangeText(val);
            setIsOpen(true);
            setHighlightedIndex(-1);
            updatePosition();
          }}
          onFocus={(e) => {
            if (clearOnFocus) {
              setInputText('');
              if (onChangeText) onChangeText('');
              onSelect({ id: '', name: '' });
              try {
                e.currentTarget.value = '';
              } catch {}
              setIsOpen(true);
            } else if (!inputText) {
              setIsOpen(true);
            }
            updatePosition();
          }}
          onKeyDown={handleKeyDown}
          className={`w-full bg-white border border-slate-300 rounded-lg pr-8 pl-14 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium disabled:bg-slate-100 disabled:cursor-not-allowed ${inputClassName}`}
        />

        {/* Action icons on left */}
        <div className="absolute left-1.5 flex items-center gap-0.5">
          {inputText && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
              title="مسح"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                setIsOpen(prev => !prev);
                if (activeInputRef.current) activeInputRef.current.focus();
              }
            }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 cursor-pointer"
            title={`عرض قائمة ${entityMeta.plural}`}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dropdown via React Portal to prevent clipping */}
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
          className="bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col text-xs font-sans animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header */}
          <div className="p-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-slate-600 text-[11px]">
            <span className="font-bold flex items-center gap-1.5">
              <IconComponent className="w-3.5 h-3.5 text-blue-600" />
              <span>نتائج المطابقة:</span>
              <span className="bg-blue-100 text-blue-800 font-mono px-1.5 py-0.5 rounded-full font-bold">
                {filteredItems.length}
              </span>
            </span>

            {!exactMatchExists && inputText.trim() && (
              <button
                type="button"
                onClick={handlePerformQuickAdd}
                className="text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 font-bold px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title={`إضافة "${inputText.trim()}" مباشرة`}
              >
                <Plus className="w-3 h-3 text-emerald-600" />
                <span>+ إضافة مباشرة</span>
              </button>
            )}
          </div>

          {/* Items list */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {filteredItems.length > 0 ? (
              filteredItems.map((item, idx) => {
                const isSelected = item.id === selectedId;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={`ac-${item.id || idx}-${idx}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isHighlighted
                        ? 'bg-blue-50'
                        : isSelected
                        ? 'bg-blue-50/50 font-semibold'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {showCode && item.code && (
                        <span className="font-mono text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                          {item.code}
                        </span>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate text-xs ${isSelected ? 'text-blue-700 font-bold' : 'text-slate-800 font-medium'}`}>
                            <HighlightMatch text={item.name} query={inputText} />
                          </span>
                          {isSelected && <Check className="w-3 h-3 text-blue-600 shrink-0" />}
                        </div>

                        {entityType !== 'item' && item.subText && (
                          <div className="text-[9px] text-slate-400 font-light truncate mt-0.5">
                            {item.subText}
                          </div>
                        )}
                      </div>
                    </div>

                    {entityType !== 'item' && item.badge && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 bg-slate-100 text-slate-700 border border-slate-200">
                        {item.badge}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-3 text-center text-slate-500">
                <p className="text-xs">
                  لا يوجد {entityMeta.label} يطابق: <span className="font-bold text-slate-800">"{inputText}"</span>
                </p>
              </div>
            )}

            {/* In-place Quick Add Action Button inside dropdown */}
            {!exactMatchExists && inputText.trim() && (
              <div className="p-2 bg-emerald-50/60 border-t border-emerald-100">
                <button
                  type="button"
                  onClick={handlePerformQuickAdd}
                  className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-2xs ${
                    highlightedIndex === filteredItems.length
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    إضافة <strong className="underline mx-1">"{inputText.trim()}"</strong> {entityMeta.quickAddLabel}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
